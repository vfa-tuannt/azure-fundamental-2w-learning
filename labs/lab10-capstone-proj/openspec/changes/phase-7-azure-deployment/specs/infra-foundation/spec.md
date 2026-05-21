## ADDED Requirements

### Requirement: Terraform layout and naming convention
The system SHALL provide an `infra/` directory at the repo root containing a `bootstrap/` subdirectory (local-state Terraform that provisions only the remote-state Storage Account) and a `main/` subdirectory (remote-state Terraform that provisions the workload). Every Azure resource SHALL be named `<prefix>-skillplatform-prod[-<purpose>]` where `<prefix>` is the resource type's canonical short code (e.g., `rg`, `vnet`, `app`, `func`, `aca`, `apim`, `acr`, `kv`, `psql`, `cosmos`, `st`, `appi`, `log`) and `<purpose>` is an optional disambiguator. Every resource SHALL carry the tags `project = "skillplatform"`, `env = "prod"`, and `managedBy = "terraform"`.

#### Scenario: Bootstrap stack is self-contained
- **WHEN** an operator runs `terraform init && terraform apply` inside `infra/bootstrap/`
- **THEN** the apply succeeds with local state, creates exactly the tfstate resource group and Storage Account, and does NOT depend on any other Terraform state

#### Scenario: Main stack uses remote state
- **WHEN** an operator runs `terraform init` inside `infra/main/`
- **THEN** Terraform initialises the `azurerm` backend pointing at the bootstrap-created Storage Account and the `terraform.tfstate` blob path is configured via `backend.tf`

#### Scenario: Naming convention is enforced via locals
- **WHEN** any resource is added to `infra/main/`
- **THEN** its `name` argument is derived from a `locals.naming` map keyed by short code so resources cannot be inconsistently named by hand

#### Scenario: Tags are applied to every resource
- **WHEN** `terraform plan` is run for the main stack
- **THEN** every resource in the plan output that supports tagging has the three required tags

### Requirement: Workload resource group
The system SHALL provision exactly one resource group `rg-skillplatform-prod` in region `southeastasia` that owns every workload resource. The bootstrap stack SHALL also create a second resource group `rg-skillplatform-tfstate` (in the same region) that owns only the Terraform state Storage Account.

#### Scenario: Resource group exists post-apply
- **WHEN** `terraform apply` completes for the main stack
- **THEN** `rg-skillplatform-prod` exists in `southeastasia` and contains every other resource provisioned by the main stack

#### Scenario: Destroying the workload does not touch state
- **WHEN** an operator runs `terraform destroy` on the main stack
- **THEN** `rg-skillplatform-prod` is deleted and `rg-skillplatform-tfstate` is left intact

### Requirement: Subscription-level deployment identity
The system SHALL provision an Entra App Registration `gh-skillplatform-deploy` with one federated credential for branch `main` of the project repo, granted the `Contributor` role on `rg-skillplatform-prod` and `Storage Blob Data Contributor` on `rg-skillplatform-tfstate`. GitHub Actions workflows SHALL authenticate using OIDC against this identity — no client secret SHALL be stored in GitHub.

#### Scenario: Workflow authenticates without a secret
- **WHEN** a GitHub Actions workflow runs `azure/login@v2` with the App's client/tenant/subscription IDs
- **THEN** the login succeeds using OIDC federation and does not require a `client-secret` input

#### Scenario: App has no role outside the project
- **WHEN** an operator reviews the App's role assignments
- **THEN** the only assignments are `Contributor` on `rg-skillplatform-prod` and `Storage Blob Data Contributor` on `rg-skillplatform-tfstate`

### Requirement: Cost guardrails
The system SHALL provision a subscription-scoped Azure Budget alert configured at $32 (80% of the PRD's $40 ceiling) with an email notification action, and SHALL configure the Log Analytics workspace daily ingestion cap at `1` GB.

#### Scenario: Budget alert exists at $32
- **WHEN** an operator inspects the Cost Management blade
- **THEN** an active budget named `budget-skillplatform-monthly` with amount `32` USD and an email action group is present

#### Scenario: Log Analytics cap enforced
- **WHEN** the Log Analytics workspace is inspected
- **THEN** the daily quota is set to 1 GB and ingestion past that quota is paused for the day
