## ADDED Requirements

### Requirement: App Service Plan and App Service
The system SHALL provision a Linux App Service Plan `plan-skillplatform-prod` with SKU `B1` (Basic, 1 instance, no auto-scale in v1) and an App Service `app-skillplatform-prod` on that plan running runtime `NODE|24-lts`. The App SHALL be VNet-integrated into `snet-app` and SHALL have a system-assigned managed identity.

#### Scenario: Runtime is Node 24 LTS
- **WHEN** an operator views the App Service Configuration → General settings blade
- **THEN** the runtime stack is Node 24 LTS

#### Scenario: VNet integration is active
- **WHEN** an operator views the App Service Networking blade
- **THEN** VNet Integration is enabled with `snet-app` selected and route-all traffic through the VNet is ON

### Requirement: Key Vault references for all secrets
Every secret consumed by the NestJS app SHALL be configured as an App Setting using the `@Microsoft.KeyVault(SecretUri=...)` syntax pointing at the corresponding [infra-secrets](../infra-secrets/spec.md) entry. The exhaustive list of Key Vault-backed app settings SHALL be: `DATABASE_URL`, `AZURE_STORAGE_CONNECTION_STRING`, `COSMOS_CONNECTION_STRING`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `APPLICATIONINSIGHTS_CONNECTION_STRING`, `SCANNER_SHARED_SECRET`. Other app settings (NON-secret) MAY be set as plain values: `NODE_ENV=production`, `PORT=8080`, `CORS_ORIGIN=<static-web-app-url>`, `THUMBNAIL_SERVICE_URL=https://<container-app-fqdn>`.

#### Scenario: All nine Key Vault references resolve
- **WHEN** the App Service is restarted
- **THEN** the Portal's App Settings list shows a green checkmark next to each of the nine Key Vault-referenced settings

#### Scenario: NestJS reads secrets as plain env vars
- **WHEN** NestJS code reads `process.env.DATABASE_URL` at runtime
- **THEN** the value is the plain connection string (the App Service runtime resolves the KV reference before exposing the env var)

### Requirement: Access restriction limits ingress to APIM
Once APIM is provisioned (see [infra-apim](../infra-apim/spec.md)), the App Service SHALL be configured with an Access Restriction rule allowing only the `ApiManagement` service tag for the project's APIM instance. All other inbound traffic to the App Service hostname SHALL be denied (HTTP 403).

#### Scenario: Direct request to App Service is rejected
- **WHEN** any client outside APIM calls `https://app-skillplatform-prod.azurewebsites.net/health`
- **THEN** the response is HTTP 403

#### Scenario: Request via APIM succeeds
- **WHEN** the same client calls `https://apim-skillplatform-prod.azure-api.net/api/health`
- **THEN** the response is HTTP 200 `{ "status": "ok" }`

### Requirement: Health probe is /health
The App Service SHALL be configured with Health Check path `/health` and a 2-minute load-balancing window so unhealthy instances are removed automatically.

#### Scenario: Health check returns 200
- **WHEN** the App Service is running
- **THEN** the App Service's Health Check blade reports the instance as `Healthy` based on probes of `/health`
