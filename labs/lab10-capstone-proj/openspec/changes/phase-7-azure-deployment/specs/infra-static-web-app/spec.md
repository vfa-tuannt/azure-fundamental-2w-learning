## ADDED Requirements

### Requirement: Static Web Apps Free-tier resource
The system SHALL provision an Azure Static Web App `stapp-skillplatform-prod` on the Free SKU, region `eastasia` (the closest SWA region to `japaneast`), with build provider `Custom` (deployed via GitHub Actions, not the built-in build pipeline). The frontend SHALL be deployed by the [infra-cicd](../infra-cicd/spec.md) workflow.

#### Scenario: Default hostname is published
- **WHEN** `terraform output static_web_app_url` is run
- **THEN** the output is a value matching the pattern `https://<random-prefix>-skillplatform-prod.azurestaticapps.net`

#### Scenario: SKU is Free
- **WHEN** an operator views the SWA Overview blade
- **THEN** the SKU is `Free`

### Requirement: SPA routing fallback
The repository SHALL contain a `frontend/staticwebapp.config.json` that maps unmatched routes to `/index.html` so client-side Vue Router paths (e.g., `/challenges/abc`) load the SPA shell, not 404. Static assets under `/assets/*` SHALL be served with `Cache-Control: max-age=31536000, immutable`.

#### Scenario: Deep link loads SPA
- **WHEN** a user opens `https://<swa>.azurestaticapps.net/challenges/abc` directly in a new tab
- **THEN** the response is the SPA `index.html` and the Vue Router resolves `/challenges/abc` client-side without a 404

### Requirement: Build-time env vars
The CI/CD workflow SHALL inject `VITE_API_URL` and `VITE_PUBLIC_URL` into the `yarn build` step. `VITE_API_URL` SHALL equal the APIM gateway URL (e.g., `https://apim-skillplatform-prod.azure-api.net`). `VITE_PUBLIC_URL` SHALL equal the SWA default hostname.

#### Scenario: Built bundle calls APIM
- **WHEN** an end user signs in via the deployed SWA and the FE issues its first API call
- **THEN** the request goes to `https://apim-skillplatform-prod.azure-api.net/api/...`, not the App Service hostname
