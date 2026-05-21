## ADDED Requirements

### Requirement: Submission scanner function — blob trigger and validation
The system SHALL provide a Python Azure Function `submission_scanner` defined with the v2 model and `@app.blob_trigger(arg_name="blob", path="submissions/{name}", connection="AZURE_STORAGE_CONNECTION_STRING")`. On each invocation it SHALL:
1. Read the blob bytes (streaming up to a 26 MB cap to detect oversize).
2. Determine MIME type (use `magic`/`puremagic` to inspect bytes — do NOT trust filename extension).
3. Compute size in bytes.
4. Decide validity: MIME ∈ {`application/pdf`, `image/png`, `image/jpeg`, `application/zip`, `text/markdown`} AND size ≤ 25 MB → valid; otherwise invalid with a reason string.
5. Extract the `submissionId` from the blob path — the upload path convention is `submissions/{userId}/{enrollmentId}/{submissionId}/{filename}`.

#### Scenario: Valid PDF passes validation
- **WHEN** a 1 MB application/pdf blob is uploaded to `submissions/u/e/s/x.pdf`
- **THEN** the function logs `valid=true` and does NOT call the invalidate webhook

#### Scenario: Oversize file is flagged invalid
- **WHEN** a 30 MB application/pdf blob is uploaded
- **THEN** the function flags it invalid with reason `size_exceeded` and calls the invalidate webhook

#### Scenario: Wrong MIME by content is flagged invalid
- **WHEN** a file is uploaded with `.pdf` extension but byte content is `image/heic`
- **THEN** the function flags it invalid with reason `unsupported_mime` based on byte sniffing, not the extension

### Requirement: Submission scanner — Cosmos write
For every invocation (valid or invalid), the function SHALL upsert one document into Cosmos container `submission_events` with shape:
```
{
  "id": "<uuid>",
  "submissionId": "<from blob path>",
  "validationResult": "valid" | "invalid",
  "reason": "<string when invalid, omitted when valid>",
  "sizeBytes": <int>,
  "detectedMime": "<string>",
  "processedAt": "<ISO 8601 UTC>"
}
```
The partition key write SHALL use `submissionId`.

#### Scenario: Cosmos document is written per invocation
- **WHEN** the scanner finishes processing any blob
- **THEN** one new document with the matching `submissionId` exists in `submission_events`

### Requirement: Submission scanner — invalidate webhook
When validation result is `invalid`, the function SHALL POST `{ reason: string }` to `${API_BASE_URL}/internal/submissions/${submissionId}/invalidate` over HTTPS, with header `X-Internal-Secret: ${SCANNER_SHARED_SECRET}`. The function SHALL retry the POST up to 3 times with exponential backoff (1s, 2s, 4s) on non-2xx responses or transport errors. After 3 failures, the function SHALL log the failure at `error` level and emit a custom App Insights event `scanner.webhook_failed`.

#### Scenario: Webhook is called only on invalid blobs
- **WHEN** the scanner runs against a valid blob
- **THEN** no POST to `/internal/submissions/.../invalidate` is issued

#### Scenario: Webhook retry on transient 500
- **WHEN** the App Service returns 500 then 500 then 200 to the invalidate POST
- **THEN** the function attempts the call 3 times in total and the final result is logged as success

#### Scenario: Webhook failure after retries
- **WHEN** the App Service returns 500 for all 3 attempts
- **THEN** the function logs `scanner.webhook_failed` with the submission id and the Cosmos document is still written

### Requirement: Weekly report function — schedule and computation
The system SHALL provide a Python Azure Function `weekly_report` defined as `@app.timer_trigger(schedule="0 0 2 * * 1", arg_name="timer", run_on_startup=False, use_monitor=True)` (i.e., Monday 02:00 UTC = 09:00 UTC+7). On each invocation it SHALL:
1. Connect to Azure Postgres using `DATABASE_URL`.
2. Run a query that returns all challenges where `status = 'open'` AND `deleted_at IS NULL` AND `(max_enrollments IS NULL OR enrolled_count < CEIL(max_enrollments * 0.5))` where `enrolled_count` is the count of `enrollments` rows for the challenge whose status is in `('in_progress', 'submitted', 'approved')`.
3. Build a JSON report `{ generated_at: <ISO>, challenges: [{ id, title, required_skills, enrolled, max }] }`.

#### Scenario: Schedule matches PRD
- **WHEN** an operator views the Function's Code + Test → Integration blade
- **THEN** the timer cron string equals `0 0 2 * * 1`

#### Scenario: Report includes only under-enrolled open challenges
- **WHEN** the function runs against a DB with one open challenge at 0/10 enrollments, one closed challenge, and one open challenge at 8/10
- **THEN** the report contains exactly the first challenge

### Requirement: Weekly report — blob output
The function SHALL upload the report JSON as `reports/weekly-{YYYY-MM-DD}.json` (UTC date of the run) with `Content-Type: application/json` to the Storage Account `stskillplatformprod`. If a blob with the same name already exists, the function SHALL overwrite it.

#### Scenario: Blob is created with correct name
- **WHEN** the function runs on `2026-06-01 02:00 UTC` (a Monday)
- **THEN** a blob named `reports/weekly-2026-06-01.json` appears in the `reports` container with the report JSON
