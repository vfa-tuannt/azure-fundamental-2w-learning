## ADDED Requirements

### Requirement: Azure Container Registry (Basic tier)
The system SHALL provision an Azure Container Registry `acrskillplatformprod` in `japaneast` with SKU `Basic`, admin user DISABLED, public network access disabled, and a Private Endpoint in `snet-pe`. The registry SHALL be reachable from the Container Apps environment over the VNet only.

#### Scenario: Registry admin user is off
- **WHEN** an operator views the ACR Access Keys blade
- **THEN** "Admin user" is set to `Disabled`

#### Scenario: Registry pull via Managed Identity
- **WHEN** the thumbnail Container App pulls its image
- **THEN** the pull succeeds using the App's system-assigned identity with the `AcrPull` role; no admin credential is supplied

#### Scenario: Registry not reachable publicly
- **WHEN** an operator runs `docker pull acrskillplatformprod.azurecr.io/thumbnail:latest` from a public network
- **THEN** the pull fails (DNS resolves only to the Private Endpoint inside the VNet)
