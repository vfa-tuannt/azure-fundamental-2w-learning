## ADDED Requirements

### Requirement: Container Apps environment (VNet-injected)
The system SHALL provision a Container Apps environment `cae-skillplatform-prod` in `southeastasia`, infrastructure subnet `snet-aca`, internal-only ingress DISABLED (the environment must be reachable from the App Service over the VNet but external ingress is also allowed for the thumbnail App's APIM-fronted route), and the shared Log Analytics workspace `log-skillplatform-prod` attached.

#### Scenario: Environment uses snet-aca
- **WHEN** an operator views the Container Apps environment's Networking blade
- **THEN** the infrastructure subnet equals `snet-aca`

#### Scenario: Environment logs flow to shared workspace
- **WHEN** any Container App in the environment logs a line
- **THEN** the line appears within 5 minutes in the `ContainerAppConsoleLogs_CL` table of `log-skillplatform-prod`

### Requirement: Thumbnail Container App
The system SHALL provision a Container App `aca-skillplatform-thumbnail` in `cae-skillplatform-prod` configured with:
- Image: `acrskillplatformprod.azurecr.io/thumbnail:<git-sha>` pulled via system-assigned managed identity.
- Ingress: external HTTPS, target port `3000`, transport `auto`.
- Resources: `0.5` vCPU, `1.0` Gi memory.
- Scale rules: `minReplicas = 0`, `maxReplicas = 3`, HTTP concurrency scale rule with `concurrentRequests = 10`.
- Environment variables: `APPLICATIONINSIGHTS_CONNECTION_STRING` (Key Vault reference), `STORAGE_CONNECTION_STRING` (Key Vault reference).

#### Scenario: Scale-to-zero is active
- **WHEN** the App receives no traffic for 5 consecutive minutes
- **THEN** the active-replicas count drops to `0`

#### Scenario: First request after idle starts a replica
- **WHEN** a `POST /thumbnail` arrives while replicas = 0
- **THEN** within 30 seconds a new replica is provisioned, accepts the request, and responds with HTTP 200 (any slower than 30s is a failed scenario)

#### Scenario: HTTPS-only ingress
- **WHEN** a client sends an HTTP (non-TLS) request to the Container App FQDN
- **THEN** the response is HTTP 301 redirect to HTTPS

### Requirement: Image build via CI
The CI/CD `container-app.yml` workflow SHALL build `services/thumbnail/Dockerfile`, push the image to ACR tagged with both `latest` and the commit SHA, then update the Container App revision to point at the SHA-tagged image. The workflow SHALL fail if the resulting revision does not reach `Healthy` within 5 minutes.

#### Scenario: Build pushes both tags
- **WHEN** the workflow runs on a push to `main`
- **THEN** `az acr repository show-tags --name acrskillplatformprod --repository thumbnail` lists both `latest` and the commit SHA

#### Scenario: Revision update is verified healthy
- **WHEN** the workflow's final step polls revision status
- **THEN** the workflow succeeds only after the revision's `runningState` becomes `Running` AND `provisioningState` becomes `Provisioned`
