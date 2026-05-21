## Context

Phases 0–6 produced a NestJS + Vue platform that runs locally against Docker Postgres, Azurite, and a Postgres-backed activity log. Phase 7 lifts that platform onto Azure while exercising every service from the 2-week Azure learning plan, including **Day 8 Virtual Network** which was missing from the original PRD. The implementer is new to Azure — first time touching the portal, the CLI, Terraform on Azure, and most of the managed services — so the design optimises for *learning while shipping*: each technical choice favours the option that surfaces the most Azure concepts at the cheapest tier while staying within the PRD's $40/month budget.

The codebase already has a clean abstraction layer for activity persistence (the `ActivityRepository` port introduced in Phase 6), Key-Vault-friendly env-var loading in `main.ts`, and a CORS allowlist driven by `CORS_ORIGIN` — those Phase-0 decisions pay off here. The current `SubmissionsService` writes directly to Azurite via a connection string; lifting that to Azure Blob is a connection-string swap once Managed Identity + Key Vault references are wired through App Service.

## Goals / Non-Goals

**Goals:**
- Every Azure service from the learning plan (Day 1–10) is provisioned and exercised with a concrete role in the running product.
- Add VNet isolation (Day 8) so backend resources are not exposed to the public internet — only APIM is.
- The implementer can verify each step in the Azure Portal (visual checkpoint) before moving on. Portal-first for first-time provisioning, Terraform-second for reproducibility.
- `terraform destroy` → `terraform apply` rebuilds the whole environment in under 30 minutes.
- Activity persistence moves to Cosmos DB with zero FE changes; only the repository implementation swaps.
- CI/CD uses GitHub OIDC federated credentials — no long-lived Azure secrets in GitHub.
- Total monthly cost stays under $40 by sticking to the cheapest tier that still demonstrates each service (Postgres B1ms, Cosmos Serverless, APIM Consumption, Container Apps scale-to-zero, ACR Basic, App Service B1, Static Web Apps Free, Log Analytics pay-per-GB with a 1 GB/day cap, Functions Consumption).

**Non-Goals:**
- Production hardening: WAF, multi-region failover, geo-replication, blue/green slots — out for v1.
- Custom domains / TLS certs — use the default Azure-managed hostnames.
- Database migration of historical activity rows — local Postgres data is throwaway; Cosmos starts empty.
- Real-time data sync (Change Feed, event streaming) — Cosmos is a flat write-on-event store.
- Cost optimisation beyond tier selection — no Reserved Instances, no auto-shutdown automation.
- Production-grade secret rotation — Key Vault holds secrets; rotation is a follow-up.
- Removing Azurite from local dev — local-first development still runs against Docker Postgres + Azurite, unchanged.

## Decisions

### D-1. Terraform over Bicep/ARM
**Choice:** Use Terraform (HCL) as the IaC layer.
**Rationale:** The PRD already mandates Terraform (`FR-14`, US-016). Terraform is also the cross-cloud lingua franca for the implementer's company (AWS shop transitioning) so the skill transfers. The `azurerm` provider has full coverage for everything we need including APIM, Container Apps, and Cosmos Serverless.
**Alternatives considered:** Bicep — Microsoft-native, lighter syntax, but Azure-only and a less-transferable skill. ARM templates — too verbose for hand-editing.

### D-2. Portal-first then Terraform per resource
**Choice:** Each new resource is created twice: first manually in the Azure Portal (so the user *sees* the blade and the wizard fields), then torn down and re-created via Terraform.
**Rationale:** This is a learning project. Hands-on portal time is the fastest way to internalise Azure's resource model. Re-creating via Terraform reinforces what the portal hid behind defaults.
**Trade-off:** Roughly doubles the wall-clock time per resource. Acceptable — the implementer is here to learn, not to ship a sprint.
**How it shows up in tasks:** Each infra task has a `Portal:` checkpoint and a `Terraform:` checkpoint with a verification step between them.

### D-3. Remote Terraform state in a bootstrap Storage Account
**Choice:** A one-off `infra/bootstrap/` directory creates a dedicated Storage Account (`stskillplatformtfstate`, LRS, public-access disabled, no soft-delete) with a `tfstate` container. The main Terraform stack uses an `azurerm` backend pointing at that container.
**Rationale:** Local state files are too fragile for a multi-workflow CI/CD pipeline; one accidental `git rm` kills the deployment. The bootstrap stack is small enough to keep in local state.
**Alternatives considered:** Terraform Cloud — extra signup friction and a separate billing/auth model. GitHub-native state via OIDC + an Azure blob — same effect as our backend choice, but adds a non-standard step.

### D-4. Resource Group strategy — single RG for the workload, separate RG for state
**Choice:** One workload RG (`rg-skillplatform-prod`) holds every running resource. A second RG (`rg-skillplatform-tfstate`) holds only the bootstrap state Storage Account.
**Rationale:** Keeps blast radius of `terraform destroy` aligned with the workload — destroying the workload cannot accidentally orphan state. Two RGs is the smallest split that gives that property.

### D-5. VNet topology (Day 8 addition)
**Choice:** Single VNet `vnet-skillplatform` with prefix `10.20.0.0/16`. Four subnets:
- `snet-app` (`10.20.1.0/24`) — delegated to `Microsoft.Web/serverFarms` for App Service VNet integration.
- `snet-pe` (`10.20.2.0/24`) — Private Endpoints for Postgres, Storage, Key Vault, Cosmos, ACR.
- `snet-db` (`10.20.3.0/24`) — delegated to `Microsoft.DBforPostgreSQL/flexibleServers` (required for private-access Postgres Flexible Server).
- `snet-aca` (`10.20.4.0/27`) — Container Apps environment. ACA requires `/27` or larger.
**Private DNS zones:** one per service: `privatelink.postgres.database.azure.com`, `privatelink.blob.core.windows.net`, `privatelink.vaultcore.azure.net`, `privatelink.documents.azure.com`, `privatelink.azurecr.io`. All linked to the VNet.
**NSGs:** `nsg-app` allows AzureLoadBalancer + APIM inbound on 443; `nsg-pe` and `nsg-db` deny inbound from `Internet`. Default outbound (allow) stays — egress filtering is not a Phase 7 concern.
**Why this layout:** Matches the PRD architecture (APIM → App Service → backends), keeps each service category in its own subnet so NSG rules read clearly, and uses the minimum subnet sizing each Azure service mandates. `10.20.x.x` (not `10.0.x.x`) reduces the chance of clashing with the implementer's home/office network.

### D-6. APIM Consumption tier as the single public entry point
**Choice:** Public traffic enters via APIM only. App Service is set to "Access restriction: allow only `ApiManagement` service tag" so it cannot be reached directly even by IP.
**Rationale:** Demonstrates the Day 6 API Management material end-to-end (rate limit, CORS, JWT validation, Developer Portal). APIM Consumption is $0 for the first 1M calls — fits the budget.
**Alternative:** Front Door + APIM Developer tier. Way over budget ($50+/mo for Developer alone).

### D-7. JWT validation policy in APIM
**Choice:** APIM uses `<validate-jwt>` with `signing-keys` pointing at the JWT RS256 **public** key stored as an APIM Named Value. The private key stays in Key Vault and is only used by NestJS to sign.
**Rationale:** Moves the auth gate to the edge — NestJS still re-validates per request (defence in depth), but APIM short-circuits unauthenticated traffic before it reaches the App Service.
**Anonymous-exempt routes:** `/auth/google`, `/auth/google/callback`, `/auth/me`, `GET /activity/recent`, `GET /challenges`, `GET /challenges/:id`, `GET /health` — driven by per-operation policy overrides.

### D-8. Identity model — System-assigned MI for every compute resource
**Choice:** App Service, Function App, and Container App each get a system-assigned managed identity. RBAC grants:
- App Service MI → Key Vault `Key Vault Secrets User`, Cosmos DB `Cosmos DB Built-in Data Contributor`, Storage Account `Storage Blob Data Contributor`.
- Function App MI → same as App Service.
- Container App MI → ACR `AcrPull` + Application Insights `Monitoring Metrics Publisher`.
**Rationale:** Per-resource identity = clean revocation surface. No shared user-assigned MI sprawl in a small project.

### D-9. Key Vault references at the App Service layer (no SDK call at runtime)
**Choice:** Secret values surface via `@Microsoft.KeyVault(SecretUri=https://kv-skillplatform-prod.vault.azure.net/secrets/<name>/)` app-setting expressions. NestJS reads them as plain env vars via `process.env` — same code as local dev, just different values.
**Rationale:** Zero code changes to read secrets in prod vs local. App Service handles the KV round-trip and caching for us.
**Alternative considered:** `@azure/identity` + `@azure/keyvault-secrets` at runtime — extra dependency, extra cold-start latency, more code paths to test.

### D-10. Cosmos DB structure for activity events
**Choice:** Two containers, both Serverless:
- `activity_events`, PK `/userId`. Documents: `{ id, userId, eventType, payload, createdAt }`. `id` is a UUID v4 (not the actor user, so cross-user reads via PK are safe).
- `submission_events`, PK `/submissionId`. Documents: `{ id, submissionId, validationResult, processedAt }`.
**Indexing:** Default indexing policy is fine for Phase 7. Add a `/createdAt`-DESC composite index on `activity_events` to power `ORDER BY createdAt DESC LIMIT 50` efficiently.
**Repository interface:** The existing `ActivityRepository` port has `record(event)`, `listRecent(limit)`, `listForUser(userId, limit)`. The Cosmos implementation uses a cross-partition query for `listRecent` (acceptable at 50 rows / low write rate) and a single-partition query for `listForUser`.

### D-11. Drop the Postgres `activity_events` table
**Choice:** A TypeORM `down`-able migration that `DROP TABLE activity_events`. Run as the last step of Phase 7c after the Cosmos repository is wired in and verified.
**Rationale:** No reason to keep two writers in sync. The data was always disposable.

### D-12. Thumbnail service architecture
**Choice:** Standalone Node 24 Express app in `services/thumbnail/`. One endpoint `POST /thumbnail` taking `{ blobUrl }`, returning `image/png`. Internal-only (no auth at the app layer — APIM handles `validate-jwt` at the edge for the `/thumbnail/*` route).
**Why Express, not NestJS:** A 50-line service does not need a framework. Keeps the Docker image small and the cold-start fast.
**Why on Container Apps, not App Service or Functions:** Demonstrates the Day 4 Container Apps material; scale-to-zero is exactly the kind of bursty workload that justifies ACA.
**Failure mode:** NestJS calls the service with a 10s timeout; if it fails, the submission row is still created and `thumbnail_url` simply stays NULL. The FE renders a file-type icon fallback. We do NOT retry — thumbnail is best-effort.

### D-13. NestJS → thumbnail call is asynchronous (fire-and-forget at the request boundary)
**Choice:** After `SubmissionsService.createFileSubmission` commits the DB row, it returns the response immediately and dispatches the thumbnail call from a `setImmediate`-style worker (a small in-process queue is fine for v1). When the thumbnail URL comes back, an `UPDATE submissions SET thumbnail_url = ?` runs.
**Rationale:** Synchronous would block the user behind a cold ACA scale-up. Async keeps the UX snappy and means thumbnail failures don't surface as 5xx on submit.
**Trade-off:** The FE's initial response has `thumbnailUrl: null`; the user sees the thumbnail on the next view. Acceptable.

### D-14. Submission scanner function — invalidate semantics
**Choice:** When the function determines a blob is invalid (wrong MIME or > 25 MB), it:
1. Writes a `submission_events` Cosmos document with `validationResult: "invalid"` and a reason.
2. POSTs to NestJS `POST /internal/submissions/:id/invalidate` with header `X-Internal-Secret: <shared-secret>` (random string in Key Vault).
3. NestJS sets `submission.invalidated_at = NOW()` (new nullable column) and `submission.invalid_reason = <reason>`; the enrollment status drops back to `in_progress` so the user can retry.
**Why a shared secret, not Managed Identity / Entra:** APIM is the public edge; the internal route bypasses APIM (Function App → App Service directly over the VNet). A shared secret kept in Key Vault is the simplest defence; both ends mount it via Key Vault references.

### D-15. Weekly report function
**Choice:** Python `@app.timer_trigger` schedule `0 0 2 * * 1` (Mon 02:00 UTC = 09:00 UTC+7). Queries Postgres via `psycopg`, computes `enrollment_rate = enrollments_count / max_enrollments` (treat NULL max as ∞ → rate is 0 unless enrolled, so include any challenge with `enrollments_count < ceil(max * 0.5)`). Writes `reports/weekly-{YYYY-MM-DD}.json` with `{ generated_at, challenges: [{ id, title, required_skills, enrolled, max }] }`.
**Why Python, not Node:** PRD mandates Python (US-019/020). Also lets the implementer touch the Python v2 model from Day 3.

### D-16. CI/CD authentication — GitHub OIDC + federated credentials
**Choice:** Create one Entra App Registration `gh-skillplatform-deploy`. Add three federated credentials (one per environment branch — `main`, `staging-not-used-yet`, plus a wildcard for PR previews not in v1). Grant the App `Contributor` on the workload RG and `Storage Blob Data Contributor` on the tfstate RG. GitHub Actions uses `azure/login@v2` with `client-id`, `tenant-id`, `subscription-id`.
**Rationale:** No client secrets to rotate. Aligns with Microsoft's current recommendation.
**Alternative:** Service principal with a client secret stored in GitHub. Easier to start with but creates a long-lived secret. Skip.

### D-17. Observability — single App Insights, multiple sources
**Choice:** All three compute resources (App Service, Function App, Container App) share one App Insights connection string. Cloud role names are set per service (`skillplatform-api`, `skillplatform-thumbnail`, `skillplatform-functions`) so the dependency map separates them cleanly.
**Custom telemetry:** NestJS emits `trackEvent` for the five domain events. Application Insights' `operation_Id` is propagated as a header (`x-correlation-id`) into the thumbnail service so traces stitch end-to-end.

### D-18. Static Web App URL is known at deploy time
**Choice:** Terraform outputs the Static Web App default hostname, and the GitHub Actions `frontend.yml` workflow injects it (and the APIM URL) into `VITE_API_URL` and `VITE_PUBLIC_URL` at build time.
**Rationale:** No need for a runtime config endpoint. Vite inlines the values; one rebuild on URL change is acceptable.

### D-19. Cost ceiling defense
**Choice:** A budget alert at 80% of $40 (so $32) on the subscription, plus a daily Log Analytics ingestion cap of 1 GB.
**Rationale:** PRD says "$40/month and a Budget Alert at $80 on the student sub". We codify both.

### D-20. Local dev unchanged
**Choice:** Phase 7 does NOT remove Azurite, the Docker Postgres, or any local-only feature. The `ActivityRepository` port stays in place; the local repo binding is still the Postgres adapter (so `yarn start:dev` keeps working). The Cosmos binding is conditional on `COSMOS_CONNECTION_STRING` being present.
**Rationale:** A working laptop dev loop is more valuable than perfect parity with production.

## Risks / Trade-offs

- **[Risk]** APIM Consumption tier has variable cold-start latency (sometimes 2–5s on first request after idle). → **Mitigation:** Document this in the README; rely on a keep-warm ping via the Static Web App health-check pattern (a tiny GitHub Action firing `curl` every 10 min is an option if needed in practice).
- **[Risk]** Container Apps scale-to-zero means the first thumbnail call after idle is slow (5–10s). → **Mitigation:** Async/fire-and-forget pattern from NestJS (D-13) keeps user-facing latency unaffected. FE shows a placeholder until the thumbnail loads on next view.
- **[Risk]** Cosmos Serverless cross-partition queries on `activity_events` could spike RU/s under load. → **Mitigation:** Hard cap of 50 rows on `listRecent`, composite index on `createdAt`. At the project's expected load (< 100 events/day), this is well under the free RU/s threshold.
- **[Risk]** Private Postgres + App Service VNet integration adds latency vs public endpoints. → **Mitigation:** Same region (Southeast Asia) for VNet and DB → keeps RTT under 5ms. Empirically acceptable.
- **[Risk]** GitHub OIDC federated credentials require Entra App Registration permissions the student subscription owner may not have. → **Mitigation:** Document the exact AAD role required (`Application Developer` or higher) in the bootstrap step; fall back to a service-principal-with-secret path if the implementer can't get the permission.
- **[Risk]** Implementer is new to Azure; portal UI changes (Microsoft rebrands tabs frequently). → **Mitigation:** Tasks say *what to look for*, not *click X on tab Y* — e.g., "find the resource's networking blade" rather than "click 'Settings' then 'Networking'".
- **[Risk]** `terraform destroy` of the workload RG could leak Private DNS zone records if VNet links aren't deleted in the right order. → **Mitigation:** Terraform `depends_on` between zone, link, and the consuming resource; smoke-test destroy + apply once before declaring Phase 7a done.
- **[Risk]** Cost overrun if the implementer leaves resources running idle. → **Mitigation:** Budget alert at $32. README documents `terraform destroy` as the end-of-day habit during the learning phase.
- **[Trade-off]** Portal-first + Terraform-second doubles provisioning time. **Accepted** because the learning goal trumps speed.
- **[Trade-off]** No staging environment. **Accepted** for v1 — adding one is a follow-up phase, not a Phase 7 task.

## Migration Plan

Phase 7 is split into four sub-phases that ship sequentially. Each sub-phase ends in a working, demoable state:

1. **7a Bootstrap + Core (Day 1–2 of execution):**
   - Bootstrap: tfstate RG + Storage Account, GitHub OIDC App Registration + federated creds, Budget alert.
   - Workload RG, VNet + 4 subnets + NSGs, Private DNS zones.
   - Postgres Flexible Server (private), Storage Account (private + container `submissions` + `reports`), Key Vault (RBAC mode), Cosmos DB Serverless (private), ACR Basic, App Insights + Log Analytics.
   - Populate Key Vault with all secrets.
   - **Demo:** `terraform plan` clean; portal shows the RG with all resources; all backend resources have private endpoints visible.

2. **7b App Hosting (Day 3–4):**
   - App Service Plan B1 Linux + App Service for NestJS; VNet-integrate; Managed Identity → KV; deploy a known-good commit; `GET /health` returns OK.
   - Static Web App; deploy FE; SPA fallback works.
   - **Demo:** End-to-end login → list challenges → enroll → submit → see thumbnail-less submission. Activity feed still on Postgres in this sub-phase.

3. **7c Serverless + Containers + Cosmos (Day 5–7):**
   - Submission scanner Function App; deploy; verify in App Insights.
   - Weekly report Function App.
   - Thumbnail Container App; ACR image pipeline; NestJS thumbnail client; `thumbnail_url` migration + FE rendering.
   - Cosmos repository for activity; drop Postgres `activity_events` table.
   - **Demo:** Submit a file → see thumbnail show up on refresh; force an invalid file → see scanner flip it; activity feed reads from Cosmos.

4. **7d APIM + CI/CD + Observability (Day 8–10):**
   - APIM Consumption + import Swagger + policies (rate limit, CORS, validate-jwt).
   - Lock App Service to APIM service tag.
   - Update `VITE_API_URL` to APIM URL; redeploy FE.
   - 4 GitHub Actions workflows finalised against `main`.
   - App Insights dashboard, 5xx alert + action group, distributed tracing verified.
   - **Demo:** All four workflows green on a single push; portal dashboard shows traffic flowing APIM → App Service → Container App with a single correlation ID.

**Rollback strategy per sub-phase:** Every sub-phase is its own Terraform state slice with `terraform destroy -target=...` documented. If 7c thumbnail integration misbehaves, the Container App can be removed independently without touching Postgres / Cosmos / App Service. The Cosmos cutover (D-11) is the only non-reversible step in the conventional sense — but since the Postgres activity table is recreated by re-running the Phase 6 migration, even that can be undone.

## Open Questions

- **Q1:** Should we provision a staging slot on the App Service Plan (cheap on B1 — one free slot) even though we have no staging environment? → Tentative answer: yes, for demo purposes, but treat it as an optional task; promote/swap deferred to a follow-up.
- **Q2:** Do we want APIM Named Values to also pull from Key Vault for the JWT public key, or paste the public key inline? → Tentative answer: Key Vault reference (named value with `keyVault` source) — slightly more setup but matches the "no secrets outside KV" principle even though the public key is technically not secret.
- **Q3:** Do we expose the Functions HTTP webhook (`POST /internal/submissions/:id/invalidate`) via Private Endpoint on the App Service, or via VNet integration? → Tentative answer: VNet integration is the existing path; reuse it.
- **Q4:** Application Insights Workspace mode is default; do we want a separate Log Analytics workspace per service for cost segmentation? → Tentative answer: one shared workspace is fine at this scale; cost is negligible.
