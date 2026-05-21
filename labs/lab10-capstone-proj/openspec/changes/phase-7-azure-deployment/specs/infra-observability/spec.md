## ADDED Requirements

### Requirement: Log Analytics workspace and Application Insights
The system SHALL provision one Log Analytics workspace `log-skillplatform-prod` (SKU `PerGB2018`, retention `30` days, daily quota `1` GB) and one Application Insights resource `appi-skillplatform-prod` in Workspace-based mode that points at the Log Analytics workspace. The Application Insights connection string SHALL be written to Key Vault as `appinsights-connection-string` (see [infra-secrets](../infra-secrets/spec.md)).

#### Scenario: App Insights is workspace-based
- **WHEN** an operator views the App Insights Properties blade
- **THEN** the workspace resource ID points to `log-skillplatform-prod`

#### Scenario: Daily ingestion cap enforced
- **WHEN** the workspace is inspected
- **THEN** the daily quota equals 1 GB and ingestion past that quota is paused for the day

### Requirement: Shared App Insights across all compute
The App Service, Container App, and Function App SHALL all be configured with the same Application Insights connection string (sourced via Key Vault reference) and SHALL each set a distinct `cloud_RoleName`: `skillplatform-api` for the App Service, `skillplatform-thumbnail` for the Container App, `skillplatform-functions` for the Function App. Distributed-tracing correlation IDs SHALL propagate end-to-end across the three.

#### Scenario: Single connection string used everywhere
- **WHEN** an operator views the Environment Variables blade on each of the three compute resources
- **THEN** all three have `APPLICATIONINSIGHTS_CONNECTION_STRING` set to the same Key Vault reference

#### Scenario: Cloud role names are distinct
- **WHEN** the App Insights Application Map is loaded after a few requests have flowed through
- **THEN** three distinct nodes are visible named `skillplatform-api`, `skillplatform-thumbnail`, and `skillplatform-functions`

#### Scenario: End-to-end trace stitching
- **WHEN** a request flows APIM → App Service → Container App
- **THEN** the App Insights end-to-end transaction details view shows all three spans linked under one `operation_Id`

### Requirement: Portal dashboard
The system SHALL provision a shared Portal dashboard `dash-skillplatform-prod` displaying at least: request rate (`requests/count` over 1 min), failure count (`requests/failed` over 1 min), average request latency (`requests/duration`), and a custom-events timeline filtered to `customEvents/name in ("challenge.created", "enrollment.created", "submission.uploaded", "submission.approved", "submission.rejected")`.

#### Scenario: Dashboard is present and pinned
- **WHEN** an operator opens the Azure Portal and selects the dashboards menu
- **THEN** `dash-skillplatform-prod` is listed and contains the four panels named above

### Requirement: 5xx alert
The system SHALL provision an Azure Monitor alert rule that fires when the App Service's HTTP 5xx rate exceeds 5% of total requests over any rolling 5-minute window, with an action group `ag-skillplatform-oncall` that emails the address supplied via a Terraform variable.

#### Scenario: Alert fires on simulated 5xx
- **WHEN** the App Service emits 5xx for at least 6% of requests over a 5-minute window
- **THEN** the alert rule transitions to `Fired` state and the action group receives an email within 5 minutes
