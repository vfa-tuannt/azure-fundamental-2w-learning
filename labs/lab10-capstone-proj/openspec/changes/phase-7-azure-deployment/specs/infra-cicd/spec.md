## ADDED Requirements

### Requirement: GitHub OIDC federated identity
The system SHALL authenticate GitHub Actions to Azure via OIDC federated credentials only; no long-lived client secret SHALL be present in GitHub secrets. The repository SHALL store three secrets only: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`. Every workflow that talks to Azure SHALL begin with `azure/login@v2` using these three inputs and `permissions: { id-token: write, contents: read }`.

#### Scenario: No client secret in GitHub
- **WHEN** an operator inspects the repo Settings → Secrets → Actions page
- **THEN** the only secrets configured are `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` (plus any Static Web App deployment token required by the SWA action)

#### Scenario: Workflow login succeeds without a secret
- **WHEN** any of the four workflows runs `azure/login@v2`
- **THEN** the step succeeds without a `client-secret` input being supplied

### Requirement: backend.yml workflow
The repository SHALL contain `.github/workflows/backend.yml` that, on push to `main` affecting `backend/**`, runs `yarn install --frozen-lockfile`, `yarn lint`, `yarn tsc --noEmit`, `yarn test`, `yarn build`, then deploys the build output to App Service `app-skillplatform-prod` via `azure/webapps-deploy@v3`. The workflow SHALL fail if any of lint, typecheck, or tests fail.

#### Scenario: PR fails on lint error
- **WHEN** a pull request introduces an ESLint error in `backend/`
- **THEN** the workflow fails at the `yarn lint` step and the deploy step does not run

#### Scenario: Successful push deploys to App Service
- **WHEN** a green push lands on `main`
- **THEN** the workflow's final step uploads the build artifact and the deployed `GET /api/health` returns 200 within 5 minutes

### Requirement: frontend.yml workflow
The repository SHALL contain `.github/workflows/frontend.yml` that, on push to `main` affecting `frontend/**`, runs `yarn install --frozen-lockfile`, `yarn type-check`, `VITE_API_URL=<apim-url> VITE_PUBLIC_URL=<swa-url> yarn build`, then deploys via the `Azure/static-web-apps-deploy@v1` action.

#### Scenario: Successful push deploys SPA
- **WHEN** a green push lands on `main`
- **THEN** the deployed SWA hostname serves the new bundle and the bundle's network requests go to the APIM URL

### Requirement: functions.yml workflow
The repository SHALL contain `.github/workflows/functions.yml` that, on push to `main` affecting `functions/**`, installs Python 3.11, runs `pip install -r requirements.txt`, `pip install ruff` then `ruff check`, then deploys via `azure/functions-action@v1` with `scm-do-build-during-deployment: true`.

#### Scenario: Both functions show up post-deploy
- **WHEN** the workflow finishes
- **THEN** `az functionapp function list --name func-skillplatform-prod --resource-group rg-skillplatform-prod` includes both `submission_scanner` and `weekly_report`

### Requirement: container-app.yml workflow
The repository SHALL contain `.github/workflows/container-app.yml` that, on push to `main` affecting `services/thumbnail/**`, runs Docker Buildx to build the image, pushes it to ACR tagged `latest` AND `<git-sha>` (using `az acr login --identity` after `azure/login@v2`), then calls `az containerapp update --image acrskillplatformprod.azurecr.io/thumbnail:<git-sha>` to create a new revision; the workflow SHALL poll until the new revision is `Healthy`.

#### Scenario: Revision is healthy before workflow succeeds
- **WHEN** the workflow finishes successfully
- **THEN** `az containerapp revision list ... --query "[?properties.healthState=='Healthy']"` includes the revision with the just-pushed image tag
