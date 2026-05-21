## ADDED Requirements

### Requirement: Azure Database for PostgreSQL Flexible Server
The system SHALL provision an Azure Database for PostgreSQL Flexible Server `psql-skillplatform-prod` in `southeastasia` using SKU `B_Standard_B1ms` (Burstable B1ms), Postgres major version `16`, storage `32` GB, backup retention `7` days, geo-redundant backup `false`, public network access disabled, and VNet-injected into `snet-db`. The server SHALL host a single database `skillplatform` owned by the admin user. The admin password SHALL come from a Terraform variable, NOT a literal, and SHALL be written to Key Vault as the secret `postgres-admin-password` plus a separate composed connection-string secret `database-url` (URL-encoded).

#### Scenario: Postgres is unreachable from public internet
- **WHEN** an operator runs `psql 'host=psql-skillplatform-prod.postgres.database.azure.com port=5432 user=...'` from a public network
- **THEN** the connection times out or DNS resolution fails (no public A record exists)

#### Scenario: App Service can reach Postgres via private endpoint
- **WHEN** the App Service starts and reads `DATABASE_URL` from Key Vault
- **THEN** TypeORM connects successfully and `GET /health` returns 200

#### Scenario: Database name and admin user
- **WHEN** an operator views the server's Databases blade
- **THEN** a database named `skillplatform` exists, and the admin user matches the Terraform `admin_user` variable

### Requirement: Storage Account and containers
The system SHALL provision a Storage Account `stskillplatformprod` (LRS, Standard tier, kind `StorageV2`), public network access disabled, hierarchical namespace disabled, and two blob containers `submissions` (private access) and `reports` (private access). The connection string SHALL be stored in Key Vault as `storage-connection-string`.

#### Scenario: Containers exist with private access
- **WHEN** an operator views the Storage Account's Containers blade
- **THEN** containers `submissions` and `reports` exist, both with anonymous access set to `None`

#### Scenario: Public blob access is disabled
- **WHEN** an operator inspects the Storage Account's Configuration blade
- **THEN** the "Allow blob anonymous access" property is `false`

### Requirement: Cosmos DB Serverless account and containers
The system SHALL provision an Azure Cosmos DB account `cosmos-skillplatform-prod` in capacity mode `Serverless` using the Core (SQL) API, public network access disabled, with a single SQL database `skillplatform` containing two containers: `activity_events` (partition key `/userId`) and `submission_events` (partition key `/submissionId`). The `activity_events` container SHALL have a composite index `[ { path: "/userId", order: "ascending" }, { path: "/createdAt", order: "descending" } ]`. The Cosmos account's connection string SHALL be stored in Key Vault as `cosmos-connection-string`.

#### Scenario: Account is in Serverless mode
- **WHEN** an operator views the Cosmos account's Overview blade
- **THEN** the capacity mode is `Serverless` and no manual RU/s value is shown

#### Scenario: activity_events composite index supports time-ordered per-user reads
- **WHEN** a query `SELECT * FROM c WHERE c.userId = @uid ORDER BY c.createdAt DESC` is run via the data explorer
- **THEN** the query completes without an order-by-index error and consumes a small RU charge proportional to result size

#### Scenario: Containers exist with correct partition keys
- **WHEN** an operator views the Data Explorer
- **THEN** `activity_events` has partition key `/userId` and `submission_events` has partition key `/submissionId`
