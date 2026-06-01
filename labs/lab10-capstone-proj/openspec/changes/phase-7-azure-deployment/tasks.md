# Phase 7 — Azure Deployment Tasks

Read first:
- `proposal.md` for the "why" of this phase.
- `design.md` for the rationale behind each technical choice — especially **D-2** (portal-first then Terraform) which is the working pattern for every infra section below.

Each section ends with a **Demo checkpoint** the user can show to a teammate to prove the section landed. Stop at each demo checkpoint and confirm before moving on. Tasks marked with **(Portal)** are pure click-through walk-throughs designed to build Azure-portal familiarity; the matching **(Terraform)** tasks then re-do the same work via IaC.

---

## 0. One-time prerequisites

- [x] 0.1 Sign in to the Azure student subscription at https://portal.azure.com; **(Portal)** confirm the subscription name in the top bar matches the one with the $100 credit.
- [x] 0.2 Install Azure CLI 2.60+ (`brew install azure-cli`); run `az login` and `az account show` to confirm the active subscription.
- [x] 0.3 Install Terraform 1.8+ (`brew install terraform`); run `terraform -version`.
- [x] 0.4 Install Docker Desktop (if not present) and confirm `docker version` works (needed for thumbnail image builds locally).
- [x] 0.5 Install Azure Functions Core Tools 4 (`npm i -g azure-functions-core-tools@4 --unsafe-perm true`); run `func --version`.
- [x] 0.6 Generate a fresh RS256 key pair locally (`openssl genrsa -out jwt-private.pem 2048 && openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem`). Keep both files **outside** the repo — they will be loaded into Key Vault via Terraform variables.
- [x] 0.7 Decide region: the project uses `japaneast` everywhere. Note your chosen region's quota for B-series VMs (Postgres B1ms, App Service B1) under Subscription → Usage + quotas; raise the limit if it shows zero.

---

## 1. Phase 7a Bootstrap + Core Infrastructure

Goal: from zero, have an empty Resource Group + VNet + every backing data service provisioned and reachable only over the VNet.

### 1.1 Bootstrap remote Terraform state

- [x] 1.1.1 **(Portal)** Create resource group `rg-skillplatform-tfstate` in Japan East. Note the Overview pane fields — Subscription ID, Location, Tags. **Screenshot the Overview blade for your own reference**, then delete the RG.
- [x] 1.1.2 Add `infra/` to `.gitignore` for `*.tfstate`, `*.tfstate.backup`, `.terraform/`, `.terraform.lock.hcl` (keep the lock file actually; gitignore only the cache).
- [x] 1.1.3 Create `infra/bootstrap/main.tf` declaring the `azurerm` provider with `features {}`, a `random_string` for the storage account suffix (lowercase, 6 chars), and two resources: `azurerm_resource_group.tfstate` and `azurerm_storage_account.tfstate` (LRS, kind `StorageV2`, `min_tls_version = "TLS1_2"`, blob soft-delete OFF for tfstate, `shared_access_key_enabled = true`). Also create `azurerm_storage_container.tfstate` named `tfstate`.
- [x] 1.1.4 Run `terraform init && terraform plan && terraform apply` from `infra/bootstrap/`. Confirm in the Portal that the RG and Storage Account exist.
- [x] 1.1.5 **(Portal)** Open the Storage Account → Containers → `tfstate`. Confirm it's empty for now. **Screenshot.**
- [x] 1.1.6 Capture the Storage Account name as a Terraform output (`output "tfstate_storage_account" { value = azurerm_storage_account.tfstate.name }`); copy it for the next section.

### 1.2 Bootstrap GitHub OIDC identity (for CI/CD later, set up now to avoid context switch)

- [x] 1.2.1 **(Portal)** Open Microsoft Entra ID → App registrations → New registration. Name `gh-skillplatform-deploy`, single tenant, no redirect URI. Note the **Application (client) ID** and **Directory (tenant) ID** on the Overview pane. **Screenshot.**
- [x] 1.2.2 **(Portal)** Inside the App → Certificates & secrets → Federated credentials → Add credential. Issuer `https://token.actions.githubusercontent.com`, subject identifier `repo:<gh-org>/<repo>:ref:refs/heads/main`. Confirm the dropdown showed both "GitHub Actions deploying Azure resources" and the federated credential form.
- [x] 1.2.3 **(Portal)** Open Subscription → Access control (IAM) → Add role assignment → `Contributor` → assign to `gh-skillplatform-deploy`. **Limit scope to `rg-skillplatform-prod`** — but the RG doesn't exist yet, so do this after task 1.4.1. Mark this checkbox after the RG exists.
- [x] 1.2.4 Add the three IDs to GitHub repo secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`. Do NOT add a client secret — OIDC eliminates it.

### 1.3 Main Terraform stack skeleton

- [x] 1.3.1 Create `infra/main/` with `versions.tf` (require `azurerm ~> 4.0`, `random ~> 3.6`).
- [x] 1.3.2 Create `infra/main/backend.tf` with `terraform { backend "azurerm" { resource_group_name = "rg-skillplatform-tfstate"; storage_account_name = "<from-output>"; container_name = "tfstate"; key = "skillplatform-prod.tfstate" } }`.
- [x] 1.3.3 Create `infra/main/variables.tf` with required vars: `location` (default `japaneast`), `pg_admin_user`, `pg_admin_password` (sensitive), `google_client_id` (sensitive), `google_client_secret` (sensitive), `jwt_private_key` (sensitive), `jwt_public_key`, `alert_email`, `apim_publisher_email`, `apim_publisher_name`.
- [x] 1.3.4 Create `infra/main/locals.tf` with `naming = { rg = "rg-skillplatform-prod", vnet = "vnet-skillplatform-prod", ... }` (one entry per resource type — see proposal Capabilities list) and `tags = { project = "skillplatform", env = "prod", managedBy = "terraform" }`.
- [x] 1.3.5 Create `infra/main/providers.tf` with `provider "azurerm" { features { key_vault { purge_soft_deleted_secrets_on_destroy = false } } }`.
- [x] 1.3.6 Create `infra/main/terraform.tfvars.example` listing all variables (no values) and add `infra/main/terraform.tfvars` to `.gitignore`.
- [x] 1.3.7 `terraform init` succeeds; `terraform validate` is clean.

### 1.4 Resource Group + VNet (Day 8 hands-on)

- [x] 1.4.1 **(Portal)** Create RG `rg-skillplatform-prod` in Japan East with tags `project=skillplatform, env=prod`. Confirm Overview. **Screenshot.**
- [x] 1.4.2 **(Portal)** Inside the RG → Create → search "Virtual network". Wizard: name `vnet-skillplatform-prod`, address space `10.20.0.0/16`. Add subnets one by one in the wizard's Subnets tab:
  - `snet-app` `10.20.1.0/24` → after creating, open the subnet, find **Delegate subnet to a service** → `Microsoft.Web/serverFarms`. **Note** what the delegation does (PrimePort permissions).
  - `snet-pe` `10.20.2.0/24` → no delegation. Set **Private endpoint network policies** to Disabled.
  - `snet-db` `10.20.3.0/24` → delegate to `Microsoft.DBforPostgreSQL/flexibleServers`.
  - `snet-aca` `10.20.4.0/27` → no delegation (Container Apps environment will claim this subnet at creation).
- [x] 1.4.3 **(Portal)** Inspect the VNet's "Connected devices" tab — empty for now. Inspect "DNS servers" → Default (Azure-provided). **Screenshot the Subnets blade** showing all four subnets.
- [x] 1.4.4 **(Portal)** Create NSG `nsg-app` in the RG with one inbound rule: source `ServiceTag` `ApiManagement` → port 443 → priority 100 → action Allow. Associate `nsg-app` with subnet `snet-app`.
- [x] 1.4.5 **(Portal)** Create NSG `nsg-pe` and `nsg-db` with no custom rules (default deny inbound from Internet is sufficient). Associate them with `snet-pe` and `snet-db` respectively.
- [x] 1.4.6 **(Terraform)** Now reproduce 1.4.1–1.4.5 in Terraform. Write `infra/main/modules/network/` with `main.tf`, `variables.tf`, `outputs.tf`. The module SHALL produce a `vnet`, four `subnet` resources with correct delegations, three `network_security_group` resources, and three `subnet_network_security_group_association` resources.
- [x] 1.4.7 **(Portal)** Delete the manually-created VNet + NSGs. Run `terraform plan` — should show 4 subnets + 1 VNet + 3 NSGs + 3 associations to create. `terraform apply`. Confirm the portal again shows the same topology you saw in 1.4.3.
- [x] 1.4.8 **(Portal)** Open one subnet (e.g., `snet-app`) and click **Service endpoints** tab to *see* what they are (we don't use them — we use Private Endpoints — but understanding the difference is useful). Note: service endpoints are subnet-scoped firewall openings; private endpoints are full NICs in your subnet.

### 1.5 Private DNS zones

- [x] 1.5.1 **(Portal)** Create one Private DNS Zone: `privatelink.postgres.database.azure.com`. Inside the zone → Virtual network links → Add → name `link-vnet-skillplatform-prod`, link to `vnet-skillplatform-prod`, **disable auto-registration**. **Screenshot.**
- [x] 1.5.2 Delete that Private DNS Zone (Terraform will recreate all five).
- [x] 1.5.3 **(Terraform)** In the network module, add five `azurerm_private_dns_zone` resources for `postgres`, `blob`, `vault`, `documents` (Cosmos), `azurecr`. Add a `for_each` `azurerm_private_dns_zone_virtual_network_link` linking each to the VNet, registration disabled.
- [x] 1.5.4 `terraform apply` and confirm all five zones appear in the RG.

### 1.6 Postgres Flexible Server (Day 5 — already touched in Phase 0, but on managed service now)

- [x] 1.6.1 **(Portal)** Create → "Azure Database for PostgreSQL flexible servers" → Flexible server. Wizard:
  - Server name `psql-skillplatform-prod` (must be globally unique; if taken, append `-2`).
  - Region Japan East.
  - Postgres version 16.
  - Workload type Development.
  - Compute Burstable B1ms.
  - Storage 32 GB, IOPS auto.
  - Admin user + password (write them down, you'll move to KV later).
  - Networking: **Private access (VNet integration)** → VNet `vnet-skillplatform-prod`, subnet `snet-db`, Private DNS `privatelink.postgres.database.azure.com` (created in 1.5).
  - Tags: standard set.
- [x] 1.6.2 Wait for provisioning (~10 min). **(Portal)** Confirm the Connect blade shows the private FQDN only, no public endpoint.
- [x] 1.6.3 **(Portal)** Create a database `skillplatform` under Databases tab.
- [x] 1.6.4 **(Portal)** Try to connect via Azure CLI Cloud Shell with `psql` — confirm it works only from inside the VNet (Cloud Shell will fail; that's expected).
- [x] 1.6.5 **(Portal)** Delete the manually-created server (DO NOT enable purge protection on this one).
- [x] 1.6.6 **(Terraform)** Create `infra/main/modules/postgres/` with `azurerm_postgresql_flexible_server` + `azurerm_postgresql_flexible_server_database "skillplatform"`. Wire admin password from the `pg_admin_password` variable. Configure `delegated_subnet_id = snet-db.id` and `private_dns_zone_id = postgres_dns_zone.id`.
- [x] 1.6.7 `terraform apply` and confirm the Portal shows the same server back, with the database `skillplatform` present.

### 1.7 Storage Account + containers

- [x] 1.7.1 **(Portal)** Create Storage Account `stskillplatformprod` (the convention is no hyphens for storage accounts — they're restricted to lowercase alphanumeric, ≤24 chars). Standard LRS, kind StorageV2, hierarchical namespace OFF.
- [x] 1.7.2 **(Portal)** Networking → "Disable public network access". Then add a Private Endpoint to `snet-pe` for the **blob** sub-resource. Confirm the matching Private DNS A record appears in `privatelink.blob.core.windows.net` zone.
- [x] 1.7.3 **(Portal)** Containers → create `submissions` (Private access) and `reports` (Private access). **Screenshot.**
- [x] 1.7.4 **(Portal)** Configuration → "Allow blob anonymous access" → Disabled. Apply.
- [x] 1.7.5 Delete the manually-created Storage Account.
- [x] 1.7.6 **(Terraform)** Add `infra/main/modules/storage/`: `azurerm_storage_account` (`public_network_access_enabled = false`, `allow_nested_items_to_be_public = false`), two `azurerm_storage_container`, a `azurerm_private_endpoint` to `snet-pe` for sub-resource `blob`, plus a `private_dns_zone_group` linking it to the `blob` Private DNS zone.
- [x] 1.7.7 `terraform apply` and confirm in the Portal.

### 1.8 Key Vault

- [x] 1.8.1 **(Portal)** Create Key Vault `kv-skillplatform-prod`. Standard SKU, soft-delete enabled (90 days), purge protection ENABLED, **Permission model: Azure role-based access control**, Networking: Disable public access + Private Endpoint to `snet-pe` (sub-resource `vault`).
- [x] 1.8.2 **(Portal)** Confirm in Access control (IAM) that **no** access policies appear (RBAC mode). Grant yourself `Key Vault Administrator` role at the vault scope so the next step works.
- [x] 1.8.3 **(Portal)** Add one secret manually: name `database-url`, value `dummy`. Confirm it appears in Secrets. Delete it.
- [x] 1.8.4 **(Portal)** Note: purge-protected vaults cannot be deleted-and-recreated within 90 days. So **leave this one in place** — we'll let Terraform `import` it rather than recreate.
- [x] 1.8.5 **(Terraform)** Add `infra/main/modules/key_vault/` with `azurerm_key_vault` (RBAC mode, public access disabled, soft-delete and purge protection ON), `azurerm_private_endpoint` to `snet-pe`. ~~Run `terraform import` …~~ — manually-created vault was deleted; provider's `recover_soft_deleted_key_vaults = true` will auto-recover the soft-deleted vault on next `apply`.
- [x] 1.8.6 `terraform plan` should show no changes (or only tag changes). `terraform apply` to reconcile.
- [x] 1.8.7 **(Terraform)** Add `azurerm_role_assignment` blocks granting your own user (look up your object ID via `az ad signed-in-user show --query id -o tsv`) the `Key Vault Administrator` role and the future App Service / Function App / Container App identities the `Key Vault Secrets User` role (these reference resources not yet created — leave the assignments commented with `# TODO: enable after compute resources exist`, OR put them in a separate `iam.tf` file you `apply` after the compute resources land).
- [x] 1.8.8 **(Terraform)** Add `azurerm_key_vault_secret` resources for every secret listed in `infra-secrets/spec.md` "Required secrets populated". Use `random_password` for `scanner-shared-secret`. Apply. — *7 of 9 secrets populated now; cosmos-connection-string and appinsights-connection-string deferred to tasks 1.9 and 1.11 (commented stubs in `kv-secrets.tf`).*
- [x] 1.8.9 **(Portal)** Confirm all nine secrets appear under Secrets.

### 1.9 Cosmos DB

- [x] 1.9.1 **(Portal)** Create Cosmos DB → Azure Cosmos DB for NoSQL → Capacity mode Serverless → name `cosmos-skillplatform-prod`. Networking: disable public access, Private Endpoint to `snet-pe` (sub-resource `Sql`).
- [x] 1.9.2 **(Portal)** Open Data Explorer → New Database `skillplatform` (no shared throughput; Serverless allocates per container). Then add containers:
  - `activity_events` PK `/userId`.
  - `submission_events` PK `/submissionId`.
- [x] 1.9.3 **(Portal)** Edit `activity_events` Indexing Policy → add composite index `[ /userId ASC, /createdAt DESC ]`. Save.
- [x] 1.9.4 Delete the manually-created Cosmos account.
- [x] 1.9.5 **(Terraform)** Add `infra/main/modules/cosmos/` with `azurerm_cosmosdb_account` (capabilities `EnableServerless`, public_network_access_enabled false), `azurerm_cosmosdb_sql_database "skillplatform"`, two `azurerm_cosmosdb_sql_container` (with the composite index for the first), and the Private Endpoint + DNS zone group. Also uncommented `cosmos-connection-string` in `kv-secrets.tf`.
- [x] 1.9.6 `terraform apply` and confirm in the Data Explorer.

### 1.10 Azure Container Registry

- [x] 1.10.1 **(Portal)** Create ACR `acrskillplatformprod` (Basic SKU, admin user OFF, public network access Disabled, Private Endpoint to `snet-pe`).
- [x] 1.10.2 Delete it.
- [x] 1.10.3 **(Terraform)** Add `infra/main/modules/acr/` with `azurerm_container_registry` (~~`sku = "Basic"`~~ **upgraded to `Premium`** — Basic does not support Private Endpoints, `admin_enabled = false`, `public_network_access_enabled = false`) + Private Endpoint. *Spec deviation: Premium SKU (~$50/mo) busts the $40 monthly budget; update the budget alert in section 1.12 accordingly.*
- [x] 1.10.4 `terraform apply`.

### 1.11 Application Insights + Log Analytics

- [x] 1.11.1 **(Portal)** Create Log Analytics workspace `log-skillplatform-prod` (Per-GB pricing). Set Usage and estimated costs → Daily cap → 1 GB → Apply.
- [x] 1.11.2 **(Portal)** Create Application Insights `appi-skillplatform-prod`, attach to the workspace just created (Workspace-based).
- [x] 1.11.3 **(Portal)** Copy the App Insights Connection string from Overview. Confirm format `InstrumentationKey=...;IngestionEndpoint=...`.
- [x] 1.11.4 Delete both.
- [x] 1.11.5 **(Terraform)** Add `infra/main/modules/observability/` with `azurerm_log_analytics_workspace` (`daily_quota_gb = 1`), `azurerm_application_insights` (`workspace_id = log_analytics.id`). Save the connection string to Key Vault as the `appinsights-connection-string` secret.
- [x] 1.11.6 `terraform apply`.

### 1.12 Subscription Budget alert

- [x] 1.12.1 **(Portal)** Cost Management + Billing → Budgets → Add budget `budget-skillplatform-monthly`, monthly amount `32`, alert thresholds 80% and 100%, contact email = your email.
- [x] 1.12.2 **(Terraform)** Reproduce via `azurerm_consumption_budget_subscription`. Apply.

### 1.13 Demo checkpoint 7a

- [x] 1.13.1 `terraform plan` is clean (zero changes).
- [x] 1.13.2 `terraform destroy` + `terraform apply` rebuilds the whole stack in under 30 minutes (note: Key Vault may take longer due to purge protection — use a separate state slice if needed).
- [x] 1.13.3 **(Portal)** Visit RG `rg-skillplatform-prod` Overview. Resource count ≥ 20. **Screenshot** the resource list — this is your "before code" milestone.
- [x] 1.13.4 Open at least three private endpoints' Networking blade and verify each shows "Approved" connection state with a private IP in `10.20.2.0/24`.

---

## 2. Phase 7b — Deploy Backend & Frontend

Goal: NestJS running on App Service, Vue running on Static Web Apps, login flow works end-to-end against Azure-hosted resources.

### 2.1 App Service Plan + App Service

- [x] 2.1.1 **(Portal)** Create App Service Plan `plan-skillplatform-prod`, Linux, B1, region Japan East. Then App Service `app-skillplatform-prod` on it, runtime Node 24 LTS, region same as plan.
- [x] 2.1.2 **(Portal)** App Service → Identity → System assigned → On → Save. Note the **Object (principal) ID**.
- [x] 2.1.3 **(Portal)** Networking → VNet integration → Add VNet integration → Region match, VNet `vnet-skillplatform-prod`, subnet `snet-app`. Confirm "Outbound traffic routed through VNet" is ON.
- [x] 2.1.4 **(Portal)** Health check → enable, path `/health`, 2 min window.
- [x] 2.1.5 Delete both.
- [x] 2.1.6 **(Terraform)** Add `infra/main/modules/app_service/` with `azurerm_service_plan` (`sku_name = "B1"`, `os_type = "Linux"`) and `azurerm_linux_web_app` (`site_config.application_stack.node_version = "24-lts"`, `identity.type = "SystemAssigned"`, `virtual_network_subnet_id = snet_app.id`, `site_config.health_check_path = "/health"`).
- [x] 2.1.7 **(Terraform)** Configure `app_settings` per [infra-app-service](specs/infra-app-service/spec.md): eight Key Vault references plus `NODE_ENV=production`, `PORT=8080`, `CORS_ORIGIN`, `THUMBNAIL_SERVICE_URL` (set placeholder; will update after Phase 7c).
- [x] 2.1.8 **(Terraform)** Grant the App Service MI `Key Vault Secrets User`, `Storage Blob Data Contributor`, and `Cosmos DB Built-in Data Contributor` (the Cosmos role is a data-plane role; use `azapi_resource` or `az rest` post-apply if `azurerm` lacks coverage).
- [x] 2.1.9 `terraform apply`. Restart the App Service in the Portal; confirm all eight Key Vault references show green checkmarks under Environment Variables.

### 2.2 NestJS code changes for Azure

- [x] 2.2.1 Audit `backend/src/main.ts` and confirm `process.env.PORT`, `process.env.CORS_ORIGIN`, `process.env.DATABASE_URL` are all already read (they are, per CLAUDE.md). If anything is hard-coded for local dev, gate it on `NODE_ENV !== 'production'`.
- [x] 2.2.2 Add `applicationinsights` to `backend/package.json`: `yarn add applicationinsights`. Initialise in `main.ts` BEFORE any other import: `const ai = require('applicationinsights'); ai.setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING).setAutoCollectConsole(true, true).setAutoCollectExceptions(true).setAutoCollectRequests(true).setAutoCollectDependencies(true).setDistributedTracingMode(ai.DistributedTracingModes.AI_AND_W3C).setSendLiveMetrics(false).start();` Gate on `process.env.APPLICATIONINSIGHTS_CONNECTION_STRING` being set so local dev still boots.
- [x] 2.2.3 Set `cloudRole` to `"skillplatform-api"`: `ai.defaultClient.context.tags[ai.defaultClient.context.keys.cloudRole] = "skillplatform-api"`.
- [x] 2.2.4 Add a tiny `TelemetryService` in `backend/src/telemetry/telemetry.service.ts` exposing `trackEvent(name, props?)`. The existing Phase-6 hooks (`challenge.created`, etc.) call `telemetry.trackEvent('challenge.created', { challengeId })`.
- [x] 2.2.5 In each domain service that already calls `ActivityService.record`, add a sibling `telemetry.trackEvent(...)` call with the same event name (mirror the activity event types but in dot-case).
- [x] 2.2.6 `yarn test && yarn lint && yarn tsc --noEmit` — all clean.

### 2.3 First-time deploy of NestJS

- [ ] 2.3.1 **(Portal)** Run a one-off deploy from local: `cd backend && yarn build && cd dist && zip -r ../deploy.zip . && cd .. && az webapp deploy --resource-group rg-skillplatform-prod --name app-skillplatform-prod --src-path deploy.zip --type zip`.
- [ ] 2.3.2 **(Portal)** Watch Deployment Center → Logs to see the deploy succeed.
- [ ] 2.3.3 The App Service is **not** publicly reachable yet (we will restrict it to APIM only at 4.x). For this initial test, **temporarily** un-restrict it (Networking → Access restriction → Allow all) for one curl. Then `curl https://app-skillplatform-prod.azurewebsites.net/health` → expect `{ "status": "ok" }`. Lock it back down once done.
- [ ] 2.3.4 **(Portal)** App Service → Log stream → confirm logs appear; pipe through App Insights Live Metrics → confirm requests show up.
- [ ] 2.3.5 Set up Google OAuth for production: in the Google Cloud Console add `https://app-skillplatform-prod.azurewebsites.net/auth/google/callback` as an authorized redirect URI. Update `google-client-id` / `google-client-secret` in Key Vault if they differ from local.

### 2.4 TypeORM migrations against Azure Postgres

- [ ] 2.4.1 Cloud Shell or local laptop (if your IP is allowlisted via Bastion or if you can SSH-tunnel via a temporary VM) — confirm you can `psql` against the private FQDN. If not possible, you must run migrations via the App Service. Easiest path: run `yarn migration:run` as a **deployment script** via `az webapp ssh` once the app is deployed.
- [ ] 2.4.2 SSH into App Service: `az webapp ssh --resource-group rg-skillplatform-prod --name app-skillplatform-prod`. Inside the container, navigate to `/home/site/wwwroot` and run `yarn migration:run`.
- [ ] 2.4.3 Confirm via `psql` (same SSH session, `apt-get install -y postgresql-client` first if missing) `\dt` shows all tables from phases 1–6.
- [ ] 2.4.4 Smoke test: `curl -X POST https://app-skillplatform-prod.azurewebsites.net/auth/google` (after temporarily unlocking ingress per 2.3.3) — should redirect to the Google consent page.

### 2.5 Static Web App for frontend

- [ ] 2.5.1 **(Portal)** Create Static Web App `stapp-skillplatform-prod`, Free tier, region East Asia, Source: Other (custom GH Actions). Confirm the default `*.azurestaticapps.net` hostname.
- [ ] 2.5.2 Delete; recreate via Terraform: `azurerm_static_web_app` in `infra/main/modules/static_web_app/`. Output `default_host_name` and store as a Terraform output.
- [ ] 2.5.3 Add `frontend/staticwebapp.config.json` with SPA fallback (`{ "navigationFallback": { "rewrite": "/index.html", "exclude": ["/assets/*"] } }`) and the cache-control rule for `/assets/*`.
- [ ] 2.5.4 First-time manual deploy: `cd frontend && VITE_API_URL=https://app-skillplatform-prod.azurewebsites.net VITE_PUBLIC_URL=<swa-url> yarn build`, then use the SWA CLI: `npx @azure/static-web-apps-cli deploy ./dist --deployment-token <token>` (get the token from the SWA's Overview blade).
- [ ] 2.5.5 Open the SWA URL in a browser; confirm the SPA shell loads and `/login` route works.

### 2.6 First end-to-end test

- [ ] 2.6.1 Temporarily allow public access to App Service (Access restrictions → Allow all). This is a security regression — only do it for this end-to-end smoke test, then revert.
- [ ] 2.6.2 Open the deployed SWA URL → click Sign in with Google → complete the OAuth → land back on the SWA → confirm Navbar shows your avatar + name.
- [ ] 2.6.3 Create a challenge → enroll on a second incognito-tab account → submit a file → confirm the submission row appears (thumbnail will be NULL — that's Phase 7c).
- [ ] 2.6.4 Re-lock App Service ingress (revert 2.6.1). The FE will be broken until 4.x adds APIM — accept that.

### 2.7 Demo checkpoint 7b

- [ ] 2.7.1 Take a screenshot of the SWA showing the logged-in dashboard.
- [ ] 2.7.2 Take a screenshot of the App Insights Live Metrics stream during the login flow.
- [ ] 2.7.3 Commit and push the Terraform changes + NestJS App Insights wiring + `staticwebapp.config.json` to a branch.

---

## 3. Phase 7c — Serverless, Containers, Cosmos cutover

Goal: scanner function flags invalid blobs, weekly report function lands a JSON to Blob, thumbnail Container App returns thumbnails, activity events live in Cosmos.

### 3.1 Submission scanner function (Day 3 hands-on)

- [ ] 3.1.1 Create `functions/` directory at repo root with `functions/host.json` (extensionBundle `Microsoft.Azure.Functions.ExtensionBundle` `[4.*, 5.0.0)`), `functions/requirements.txt` (`azure-functions`, `azure-storage-blob`, `azure-cosmos`, `puremagic`, `requests`), and `functions/function_app.py` declaring `app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)`.
- [ ] 3.1.2 In `function_app.py`, define `@app.blob_trigger(arg_name="blob", path="submissions/{name}", connection="AZURE_STORAGE_CONNECTION_STRING")` decorating `submission_scanner(blob: func.InputStream)`.
- [ ] 3.1.3 Implement the validation logic per [backend-functions](specs/backend-functions/spec.md) "Submission scanner function — blob trigger and validation". Parse the blob path to extract `submissionId` from `submissions/{userId}/{enrollmentId}/{submissionId}/{filename}`.
- [ ] 3.1.4 Write to Cosmos `submission_events` using the `azure.cosmos.CosmosClient` constructed from `COSMOS_CONNECTION_STRING`.
- [ ] 3.1.5 On invalid, POST to `${API_BASE_URL}/internal/submissions/{id}/invalidate` with `X-Internal-Secret`. Implement 3-retry exponential backoff using `urllib3.util.Retry`.
- [ ] 3.1.6 Local test with Azurite: `cd functions && func start --python` — upload a test blob to the local `submissions` container, confirm the function fires and (with local Cosmos emulator OR a feature-flag stub) logs the validation result.
- [ ] 3.1.7 **(Terraform)** Add `infra/main/modules/functions/` with `azurerm_linux_function_app` (`os_type` `Linux`, runtime `python`, version `3.11`, service plan a `azurerm_service_plan` with `Y1` SKU for Consumption), system-assigned identity, Key Vault-referenced app settings, App Insights connection string env var. Apply.
- [ ] 3.1.8 Grant the Function App MI the same RBAC as the App Service MI (Key Vault Secrets User, Storage Blob Data Contributor, Cosmos DB Built-in Data Contributor).
- [ ] 3.1.9 Deploy: `cd functions && func azure functionapp publish func-skillplatform-prod --python`.
- [ ] 3.1.10 **(Portal)** Function App → Functions → `submission_scanner` → confirm it's enabled. Functions → Monitor → run an upload test from a known-invalid file (e.g., a 30 MB random binary) into `submissions` via the Storage Account → confirm an invocation appears within 30s and the result is "invalid".

### 3.2 NestJS internal invalidate endpoint

- [ ] 3.2.1 Add `backend/src/submissions/internal-invalidate.controller.ts` with `@Controller('internal/submissions') @UseGuards(SharedSecretGuard)`. Implement the spec — `POST :id/invalidate` taking `{ reason: string }`.
- [ ] 3.2.2 Implement `SharedSecretGuard` that compares `request.headers['x-internal-secret']` to `process.env.SCANNER_SHARED_SECRET` in constant time.
- [ ] 3.2.3 TypeORM migration `AddSubmissionInvalidationColumns`: adds `invalidated_at` and `invalid_reason` to `submissions`. Down drops them.
- [ ] 3.2.4 Service method `SubmissionsService.invalidate(id, reason)` runs the two-step transaction described in `backend-submissions/spec.md` "POST /internal/submissions/:id/invalidate endpoint".
- [ ] 3.2.5 Unit tests: invalid header → 401, valid header but unknown id → 404, valid + submitted enrollment → updates both rows, valid + approved enrollment → only submission row updated.
- [ ] 3.2.6 E2E test using supertest with a stub guard.
- [ ] 3.2.7 Deploy via the existing zip-deploy path (we'll automate via GitHub Actions in Phase 7d).
- [ ] 3.2.8 Trigger the scanner from a real upload of an oversize file via the FE → confirm the submission row shows `invalidated_at` populated and the enrollment status is back to `in_progress`.

### 3.3 Weekly report function

- [ ] 3.3.1 In `function_app.py`, add `@app.timer_trigger(arg_name="timer", schedule="0 0 2 * * 1", run_on_startup=False)` decorating `weekly_report(timer: func.TimerRequest)`.
- [ ] 3.3.2 Use `psycopg[binary]` to connect via `DATABASE_URL`. Implement the under-enrolled query from `backend-functions/spec.md` "Weekly report function — schedule and computation".
- [ ] 3.3.3 Upload the resulting JSON to `reports/weekly-{YYYY-MM-DD}.json` via `azure.storage.blob.BlobServiceClient`.
- [ ] 3.3.4 Add `psycopg[binary]` to `requirements.txt`. Redeploy.
- [ ] 3.3.5 **(Portal)** Function App → `weekly_report` → "Run with payload" with an empty body to force an immediate trigger. Confirm a blob appears in the `reports` container.

### 3.4 Thumbnail Container App (Day 4 hands-on)

- [ ] 3.4.1 Create `services/thumbnail/` with `package.json` (dependencies `express`, `sharp`, `pdf-thumbnail`, `@azure/storage-blob`; devDependencies `typescript`, `@types/express`, `@types/node`, `tsx`), `tsconfig.json`, `src/index.ts`.
- [ ] 3.4.2 Implement `POST /thumbnail` per [backend-thumbnail-service](specs/backend-thumbnail-service/spec.md). Add a `GET /health` returning 200.
- [ ] 3.4.3 Add unit tests with `vitest` + `supertest`.
- [ ] 3.4.4 Add `services/thumbnail/Dockerfile` — multi-stage: build stage installs and compiles TS, runtime stage uses `node:24-slim`, copies `dist/` + minimal `node_modules`, runs as non-root user (`USER 1000`), exposes 3000.
- [ ] 3.4.5 Build locally: `docker build -t thumbnail:dev services/thumbnail && docker run --rm -p 3000:3000 thumbnail:dev` — confirm `GET /health` returns 200.
- [ ] 3.4.6 **(Portal)** Azure Container Apps → Create Container Apps environment `cae-skillplatform-prod` → Region SEA → Workload profiles: Consumption-only → Networking: External, link to `snet-aca`. (Note: ACA does NOT allow swapping infrastructure subnet later — get this right first time.)
- [ ] 3.4.7 Delete it.
- [ ] 3.4.8 **(Terraform)** Add `infra/main/modules/container_apps/`:
  - `azurerm_container_app_environment` with `infrastructure_subnet_id = snet_aca.id`, `log_analytics_workspace_id`, `internal_load_balancer_enabled = false` (we need ACA to receive APIM traffic).
  - `azurerm_container_app "thumbnail"` with image placeholder `acrskillplatformprod.azurecr.io/thumbnail:latest`, identity SystemAssigned, registry block using `identity = "system"`, ingress `external_enabled = true, target_port = 3000, transport = "auto"`, scale `min_replicas = 0, max_replicas = 3`, an HTTP scale rule for concurrent_requests = 10.
  - Role assignment: Container App MI gets `AcrPull` on ACR.
- [ ] 3.4.9 First-time image push: `az acr login --name acrskillplatformprod` (uses your Az CLI identity over a temporary public IP exception, OR push from a peered Bastion VM, OR — easier — temporarily enable public access on ACR for the duration of this manual push, then re-disable). Tag & push: `docker tag thumbnail:dev acrskillplatformprod.azurecr.io/thumbnail:bootstrap && docker push ...`. Update the Container App image to that tag.
- [ ] 3.4.10 Curl the Container App FQDN's `/health` from a temporarily-unrestricted client — confirm 200.

### 3.5 NestJS thumbnail integration

- [ ] 3.5.1 Add `backend/src/submissions/thumbnail.client.ts` with `requestThumbnail(submissionId, blobUrl): Promise<string>` per [backend-thumbnail-service](specs/backend-thumbnail-service/spec.md) "NestJS thumbnail client integration".
- [ ] 3.5.2 TypeORM migration `AddSubmissionThumbnailUrl`: adds `thumbnail_url` text nullable. Down drops it.
- [ ] 3.5.3 Modify `SubmissionsService.createFileSubmission` to `setImmediate(() => this.thumbnailClient.requestThumbnail(...).then(url => this.repo.updateThumbnail(submissionId, url)).catch(err => this.logger.warn(...)))` after the commit.
- [ ] 3.5.4 DTO update: expose `thumbnailUrl`, `invalidatedAt`, `invalidReason` in the submission response.
- [ ] 3.5.5 Unit + E2E tests with `nock` to stub the thumbnail endpoint.
- [ ] 3.5.6 Deploy backend.
- [ ] 3.5.7 Upload a real image via the FE and confirm:
  - First response has `thumbnailUrl: null`.
  - 5–10s later, `GET /enrollments/:id/submissions` shows the URL populated.
  - The blob exists at `thumbnails/<submissionId>.png` in the `submissions` container.

### 3.6 Frontend thumbnail rendering

- [ ] 3.6.1 Update `Submission` interface in `frontend/src/api/submissions.ts` to include the three new fields.
- [ ] 3.6.2 Implement the thumbnail rendering block (image OR fallback icon) in the submission card component per [frontend-thumbnails](specs/frontend-thumbnails/spec.md).
- [ ] 3.6.3 Add the "Invalid: ${reason}" warning chip per [frontend-submissions](specs/frontend-submissions/spec.md).
- [ ] 3.6.4 `yarn type-check && yarn build` clean.
- [ ] 3.6.5 Deploy and visually verify in the browser.

### 3.7 Cosmos cutover for activity events

- [ ] 3.7.1 `yarn add @azure/cosmos` in backend.
- [ ] 3.7.2 Implement `CosmosActivityRepository` in `backend/src/activity/cosmos-activity.repository.ts` implementing the existing `ActivityRepository` port. Single-partition reads for `listForUser`, cross-partition `SELECT TOP 50 ... ORDER BY c.createdAt DESC` for `listRecent`.
- [ ] 3.7.3 In the activity module's DI, switch the binding from `PostgresActivityRepository` to `CosmosActivityRepository` when `process.env.COSMOS_CONNECTION_STRING` is set, otherwise keep Postgres (preserves local-dev behaviour per Decision D-20).
- [ ] 3.7.4 Unit tests for `CosmosActivityRepository` using `@azure/cosmos`'s test helpers or a `jest.fn()` mock.
- [ ] 3.7.5 Deploy and verify: create a challenge via the FE → `GET /activity/recent` returns the new event → confirm it exists in the Cosmos Data Explorer.
- [ ] 3.7.6 Write the TypeORM migration `DropActivityEventsTable` per [backend-activity/spec.md](specs/backend-activity/spec.md) "Activity event persistence" MODIFIED. `down()` recreates the Phase-6 table.
- [ ] 3.7.7 SSH into App Service → `yarn migration:run` → confirm the table is dropped.
- [ ] 3.7.8 Run a full smoke test (challenge create → enroll → submit → approve) → confirm the activity feed in `/me` and the home page shows all five event types, all sourced from Cosmos.

### 3.8 Demo checkpoint 7c

- [ ] 3.8.1 Demonstrate: upload a normal PDF → thumbnail appears in 5–10s. Upload a 30 MB ZIP → scanner flips it invalid → enrollment status reverts to in_progress → invalid chip renders on the FE.
- [ ] 3.8.2 Demonstrate: weekly_report function force-run produces `reports/weekly-<today>.json`.
- [ ] 3.8.3 Demonstrate: activity feed reads from Cosmos (App Insights dependency telemetry shows a `Cosmos DB` dependency for `GET /activity/recent`).

---

## 4. Phase 7d — APIM, CI/CD, Observability finishing

### 4.1 APIM Consumption tier

- [ ] 4.1.1 **(Portal)** Create APIM instance → tier Consumption → name `apim-skillplatform-prod` → publisher name/email = yours. Wait for provisioning (~30 min). System-assigned managed identity ON.
- [ ] 4.1.2 **(Portal)** APIM → APIs → Add API → OpenAPI. Source: a one-off downloaded copy of the NestJS Swagger JSON (run locally `curl http://localhost:3000/api/docs-json > openapi.json` against a `yarn start:dev` instance — or temporarily un-restrict the App Service to fetch from the deployed `/api/docs-json`). Import — set Display name "Skillplatform API", Name `skillplatform-api`, **API URL suffix** `api`.
- [ ] 4.1.3 **(Portal)** APIM → APIs → Skillplatform API → Settings → "Web service URL" = the App Service hostname `https://app-skillplatform-prod.azurewebsites.net`.
- [ ] 4.1.4 **(Portal)** APIM → APIs → Add API → HTTP → Display name "Thumbnail", Name `skillplatform-thumbnail`, Web service URL = the Container App FQDN, API URL suffix `thumbnail`. Add one operation `POST /` (the empty path under `/thumbnail`).
- [ ] 4.1.5 **(Portal)** APIM → APIs → All APIs → Policies (the API-level Inbound policy). Paste in: cors policy with the SWA origin, `rate-limit-by-key` at 100/60 keyed on `context.Request.IpAddress`, and `validate-jwt` with the RS256 public key as a Named Value reference.
- [ ] 4.1.6 **(Portal)** APIM → Named values → Add → name `JwtPublicKey`, source Key Vault → secret `jwt-public-key`. APIM's MI needs `Key Vault Secrets User` on the vault — assign it. Confirm the named value resolves (green check).
- [ ] 4.1.7 **(Portal)** For each anonymous operation listed in [infra-apim](specs/infra-apim/spec.md), override the operation-level inbound policy with `<base />` *only* and add a `<set-header name="Authorization" exists-action="skip" />` (or simply omit the `validate-jwt` element at that scope so APIM doesn't enforce it).
- [ ] 4.1.8 Test: `curl https://apim-skillplatform-prod.azure-api.net/api/health` → 200. `curl https://apim-skillplatform-prod.azure-api.net/api/challenges` → 200 (anonymous-allowed). `curl https://apim-skillplatform-prod.azure-api.net/api/challenges -X POST` → 401 (JWT required).
- [ ] 4.1.9 Lock the App Service: Networking → Access restriction → add a rule allowing only the `ApiManagement` service tag (priority 100). Add the rule **first** before deleting the temporary "Allow all" rule from 2.6.1. Verify `curl https://app-skillplatform-prod.azurewebsites.net/health` → 403.
- [ ] 4.1.10 Delete the manually-created APIM API definitions.
- [ ] 4.1.11 **(Terraform)** Add `infra/main/modules/apim/` with `azurerm_api_management` (Consumption_0), system-assigned identity, role assignment for KV access, `azurerm_api_management_named_value` for `JwtPublicKey` (Key Vault-backed), `azurerm_api_management_api` for both APIs (import the Swagger JSON via `import { content_format = "openapi+json", content_value = file("./openapi.json") }`), and `azurerm_api_management_api_policy` for the inbound policies. Apply.
- [ ] 4.1.12 Confirm the Developer Portal is reachable at `https://apim-skillplatform-prod.developer.azure-api.net` and shows the two APIs.

### 4.2 Update FE to point at APIM and redeploy

- [ ] 4.2.1 Confirm `VITE_API_URL` in the SWA build picks up the APIM URL (the GitHub Actions workflow will read it from a Terraform output, but for now hard-code the env var when running the manual build).
- [ ] 4.2.2 Rebuild + redeploy the SWA: `cd frontend && VITE_API_URL=https://apim-skillplatform-prod.azure-api.net VITE_PUBLIC_URL=<swa-host> yarn build`, then SWA-CLI deploy.
- [ ] 4.2.3 Full smoke test through the new edge — every screen of the FE must work.

### 4.3 GitHub Actions workflows

- [ ] 4.3.1 Create `.github/workflows/backend.yml` per [infra-cicd](specs/infra-cicd/spec.md) "backend.yml workflow".
- [ ] 4.3.2 Create `.github/workflows/frontend.yml` reading `VITE_API_URL` and `VITE_PUBLIC_URL` from repo variables (or Terraform-output a `frontend-env.json` artifact). Use `Azure/static-web-apps-deploy@v1` with the SWA deployment token stored as a secret `SWA_DEPLOYMENT_TOKEN`.
- [ ] 4.3.3 Create `.github/workflows/functions.yml` per spec.
- [ ] 4.3.4 Create `.github/workflows/container-app.yml` per spec. Use `docker/build-push-action@v5` with Buildx + `az acr login --identity` for OIDC-based push.
- [ ] 4.3.5 Push a trivial change in each of the four scoped paths and confirm each workflow runs and turns green.

### 4.4 Observability finishing touches

- [ ] 4.4.1 **(Portal)** App Insights → Workbooks → New workbook → add tiles for request rate, failure count, average duration, custom events timeline filter `customEvents | where name in ('challenge.created', 'enrollment.created', 'submission.uploaded', 'submission.approved', 'submission.rejected') | summarize count() by name, bin(timestamp, 1h)`.
- [ ] 4.4.2 Pin the workbook as a Shared Dashboard `dash-skillplatform-prod`. Save the dashboard JSON.
- [ ] 4.4.3 **(Terraform)** Provision the dashboard via `azurerm_portal_dashboard` with the saved JSON template.
- [ ] 4.4.4 **(Terraform)** Create action group `ag-skillplatform-oncall` (email = `var.alert_email`) and `azurerm_monitor_metric_alert` on the App Service's `Http5xx / Requests` ratio over 5 min > 0.05.
- [ ] 4.4.5 **(Portal)** Trigger five demo events (create a challenge, enroll, submit, approve, reject) and confirm all five custom events appear in App Insights Transaction Search.
- [ ] 4.4.6 **(Portal)** Open an end-to-end transaction trace in App Insights → confirm spans flow APIM → App Service → Container App under a single `operation_Id`.

### 4.5 Final demo checkpoint

- [ ] 4.5.1 `terraform destroy` and `terraform apply` from a clean state; time it; verify under 30 minutes.
- [ ] 4.5.2 All four GitHub Actions workflows green on `main`.
- [ ] 4.5.3 Run the full PRD success path:
  - Sign in via the SWA.
  - Create a challenge.
  - On a different account, enroll and submit a file.
  - Owner approves the submission.
  - The activity feed shows all events.
  - The submission card shows a thumbnail.
- [ ] 4.5.4 Confirm monthly Azure cost trajectory under $40 (Cost Management blade → Daily costs).
- [ ] 4.5.5 Confirm budget alert email arrives if the simulated spend exceeds 80% threshold (you can lower the budget to $1 temporarily to trigger this once).
- [ ] 4.5.6 Take screenshots:
  - RG resource list (~25 resources).
  - APIM Developer Portal home.
  - App Insights end-to-end transaction with three spans.
  - Cost Management forecast under $40.
  - The four green GitHub Actions runs.
- [ ] 4.5.7 Update `tasks/prd-skill-challenge-platform.md` with a "Phase 7 — Done" date stamp at the top.
- [ ] 4.5.8 Archive this OpenSpec change with `/opsx:archive` once everything above is checked off.

---

## 5. Documentation and handoff

- [ ] 5.1 Update root `README.md` with a "Production deployment" section pointing at `infra/`, the four workflows, and how to run `terraform destroy` to halt costs overnight.
- [ ] 5.2 Add `infra/README.md` covering bootstrap → main flow, the variables you must supply, and the `terraform destroy` daily-habit recommendation.
- [ ] 5.3 Add `functions/README.md` with local-dev commands (`func start`) and how to set `local.settings.json` (gitignored).
- [ ] 5.4 Add `services/thumbnail/README.md` with local Docker run + curl examples.
- [ ] 5.5 Update `CLAUDE.md` with: the rule that the Azure-deployed environment is the only environment that talks to APIM (local dev still hits the App Service directly via VNet-less local), and the Key Vault reference syntax used in app settings.
- [ ] 5.6 Commit, push, open a PR titled `phase-7-azure-deployment`, ensure all four workflows pass, then merge.
