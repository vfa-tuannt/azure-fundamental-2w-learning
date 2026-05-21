## ADDED Requirements

### Requirement: Virtual network and subnets
The system SHALL provision one Virtual Network `vnet-skillplatform-prod` with address space `10.20.0.0/16` in region `japaneast`, and exactly four subnets:
- `snet-app` (`10.20.1.0/24`), delegated to `Microsoft.Web/serverFarms` so an App Service can VNet-integrate into it.
- `snet-pe` (`10.20.2.0/24`), with `private_endpoint_network_policies = "Disabled"` so Private Endpoints can attach.
- `snet-db` (`10.20.3.0/24`), delegated to `Microsoft.DBforPostgreSQL/flexibleServers` (a hard requirement of Postgres Flexible Server in VNet-injected mode).
- `snet-aca` (`10.20.4.0/27`), used as the Container Apps environment infrastructure subnet (Azure requires `/27` minimum).

#### Scenario: VNet exists with correct address space
- **WHEN** `terraform apply` completes
- **THEN** `vnet-skillplatform-prod` exists with address space `10.20.0.0/16` and contains four subnets named exactly `snet-app`, `snet-pe`, `snet-db`, and `snet-aca`

#### Scenario: snet-db is delegated correctly
- **WHEN** an operator views `snet-db` in the portal
- **THEN** the delegation is `Microsoft.DBforPostgreSQL/flexibleServers`

#### Scenario: snet-aca sizing
- **WHEN** the Container Apps environment is created
- **THEN** the `infrastructure_subnet_id` argument points at `snet-aca` (`10.20.4.0/27`)

### Requirement: Network security groups
The system SHALL associate a Network Security Group with `snet-pe` and a second with `snet-db`. Both NSGs SHALL deny all inbound from the `Internet` service tag (priority 4096 default-deny is sufficient — no explicit rule needed) and allow inbound from `VirtualNetwork` to support intra-VNet traffic. `snet-app` SHALL have an NSG `nsg-app` that allows inbound 443 from the `ApiManagement` service tag and from `AzureLoadBalancer`, and denies all other inbound from the Internet.

#### Scenario: snet-pe blocks internet inbound
- **WHEN** an operator inspects `nsg-pe`
- **THEN** there is no inbound rule allowing `Internet → snet-pe` on any port

#### Scenario: snet-app allows APIM inbound
- **WHEN** an operator inspects `nsg-app`
- **THEN** an inbound rule allows port 443 from the `ApiManagement` service tag at a priority below the default deny

### Requirement: Private endpoints for backend services
The system SHALL create Private Endpoints in `snet-pe` for: Azure Database for PostgreSQL (`group_ids = ["postgresqlServer"]`), Storage Account (`group_ids = ["blob"]`), Key Vault (`group_ids = ["vault"]`), Cosmos DB (`group_ids = ["Sql"]`), and Azure Container Registry (`group_ids = ["registry"]`). Each Private Endpoint SHALL be linked to a matching Private DNS zone so that VNet clients can resolve the resource's FQDN to its private IP.

#### Scenario: Postgres has a private endpoint
- **WHEN** an operator views the Postgres server's Networking blade
- **THEN** a Private Endpoint named `pe-psql-skillplatform-prod` is listed in `snet-pe` and the public-access setting is disabled

#### Scenario: Storage has a blob private endpoint
- **WHEN** an operator views the Storage Account's Networking blade
- **THEN** a Private Endpoint named `pe-st-skillplatform-prod-blob` is listed in `snet-pe`

#### Scenario: All five private endpoints exist
- **WHEN** an operator lists Private Endpoints in `rg-skillplatform-prod`
- **THEN** five private endpoints (Postgres, Storage blob, Key Vault, Cosmos, ACR) are present, all in `snet-pe`

### Requirement: Private DNS zones
The system SHALL create the following Private DNS zones in `rg-skillplatform-prod`, each linked to `vnet-skillplatform-prod`: `privatelink.postgres.database.azure.com`, `privatelink.blob.core.windows.net`, `privatelink.vaultcore.azure.net`, `privatelink.documents.azure.com`, `privatelink.azurecr.io`. Each Private Endpoint's `private_dns_zone_group` SHALL register an A record into the corresponding zone.

#### Scenario: VNet client resolves Postgres FQDN to private IP
- **WHEN** a VNet-integrated client runs `dig psql-skillplatform-prod.postgres.database.azure.com`
- **THEN** the response is an A record inside `10.20.2.0/24` (the `snet-pe` range)

#### Scenario: Each zone is linked to the VNet
- **WHEN** an operator views any of the five Private DNS zones
- **THEN** a VNet link named `link-vnet-skillplatform-prod` is present, with registration disabled

### Requirement: App Service VNet integration
The system SHALL VNet-integrate the NestJS App Service into `snet-app` via regional VNet integration so that calls from NestJS to Postgres, Storage, Key Vault, Cosmos, and the thumbnail Container App traverse the VNet only.

#### Scenario: App Service traffic to Postgres is private
- **WHEN** the App Service makes a Postgres connection
- **THEN** the source IP observed by Postgres is inside `10.20.1.0/24` (the `snet-app` range) and never a public IP
