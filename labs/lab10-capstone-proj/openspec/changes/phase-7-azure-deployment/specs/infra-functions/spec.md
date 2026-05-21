## ADDED Requirements

### Requirement: Function App on Consumption plan
The system SHALL provision a Linux Consumption-plan Function App `func-skillplatform-prod` running Python 3.11 with the Azure Functions v2 programming model. The Function App SHALL have a system-assigned managed identity, share the Storage Account `stskillplatformprod` for its required runtime storage, and be wired to the shared Application Insights via the connection string from Key Vault.

#### Scenario: Functions runtime is Python 3.11
- **WHEN** an operator views the Function App's Configuration → General settings blade
- **THEN** the runtime stack is Python 3.11 on Linux Consumption

#### Scenario: Function App MI has required RBAC
- **WHEN** an operator inspects the MI's role assignments
- **THEN** the assignments listed in [infra-secrets](../infra-secrets/spec.md) for the Function App MI are present

### Requirement: Key Vault-referenced app settings
The Function App SHALL receive the following secrets via `@Microsoft.KeyVault(SecretUri=...)` app settings: `DATABASE_URL`, `AZURE_STORAGE_CONNECTION_STRING`, `COSMOS_CONNECTION_STRING`, `SCANNER_SHARED_SECRET`, `APPLICATIONINSIGHTS_CONNECTION_STRING`, and the App Service base URL as a plain setting `API_BASE_URL = https://app-skillplatform-prod.azurewebsites.net`.

#### Scenario: Secrets resolve at function start
- **WHEN** the Function App restarts
- **THEN** each Key Vault reference in the app settings list shows a green resolved indicator in the Portal

### Requirement: Function deployment via remote build
The CI/CD workflow SHALL deploy the contents of `functions/` to the Function App via `azure/functions-action@v1` with `scm-do-build-during-deployment: true`. Local build artifacts SHALL NOT be required for deploys.

#### Scenario: Deploy from a clean checkout
- **WHEN** the `functions.yml` workflow runs on a clean push to `main`
- **THEN** the workflow installs requirements remotely on the App, deploys both functions, and a `func azure functionapp list-functions` call against the App returns both `submission_scanner` and `weekly_report`
