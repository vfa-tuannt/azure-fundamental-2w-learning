## MODIFIED Requirements

### Requirement: Submission entity persistence
The system SHALL persist submissions in a `submissions` table with the following columns: `id` (uuid, primary key), `enrollment_id` (uuid, not null, foreign key to `enrollments.id` with `ON DELETE RESTRICT`), `blob_url` (text, nullable), `external_url` (text, nullable), `notes` (text, not null, defaults to empty string `''`), `submitted_at` (timestamptz, not null, defaults to `now()`), `rejection_reason` (text, nullable, defaults to `NULL`), and `reviewed_at` (timestamptz, nullable, defaults to `NULL`). The table SHALL be created via a TypeORM migration that also adds a CHECK constraint `(blob_url IS NULL) <> (external_url IS NULL)` enforcing that exactly one of the two URL columns is non-null, and an index on `(enrollment_id, submitted_at DESC)` to keep listing fast. The `rejection_reason` and `reviewed_at` columns SHALL be added via a follow-up migration in the review-approval change and SHALL be `NULL` for any pre-existing rows.

#### Scenario: Migration creates submissions table with XOR constraint
- **WHEN** `yarn migration:run` is executed against a database that already contains the `enrollments` table
- **THEN** the `submissions` table is created with all required columns including `rejection_reason` (nullable text) and `reviewed_at` (nullable timestamptz), the foreign key to `enrollments.id` with `ON DELETE RESTRICT`, the CHECK constraint `(blob_url IS NULL) <> (external_url IS NULL)`, and the index on `(enrollment_id, submitted_at DESC)`

#### Scenario: Inserting a row with both URLs is blocked
- **WHEN** the application attempts to insert a `submissions` row with both `blob_url` and `external_url` set to non-null values
- **THEN** the insert fails with a CHECK constraint violation

#### Scenario: Inserting a row with neither URL is blocked
- **WHEN** the application attempts to insert a `submissions` row with both `blob_url` and `external_url` set to `NULL`
- **THEN** the insert fails with a CHECK constraint violation

#### Scenario: Deleting a referenced enrollment is blocked
- **WHEN** the application attempts to hard-delete an `enrollments` row that is referenced by at least one `submissions.enrollment_id`
- **THEN** the deletion fails with a foreign-key violation (`ON DELETE RESTRICT`)

#### Scenario: Review columns default to NULL on insert
- **WHEN** the application inserts a `submissions` row without specifying `rejection_reason` or `reviewed_at`
- **THEN** both columns are stored as `NULL` and remain `NULL` until a review action mutates them

#### Scenario: Migration down rolls back review columns cleanly
- **WHEN** `yarn migration:revert` is run against a database where the review-approval migration has been applied
- **THEN** the `rejection_reason` and `reviewed_at` columns are dropped from the `submissions` table and the original Phase 4 schema is restored

### Requirement: Submission DTO shape
The system SHALL serialize submissions to clients using the DTO `{ id (uuid), enrollmentId (uuid), blobUrl (string | null), externalUrl (string | null), notes (string), submittedAt (ISO 8601 string), rejectionReason (string | null), reviewedAt (ISO 8601 string | null) }`. Exactly one of `blobUrl` and `externalUrl` is non-null per row. `rejectionReason` and `reviewedAt` are `null` until a review action populates them. Database column names use snake_case; DTO properties use camelCase.

#### Scenario: File submission DTO has blobUrl and null externalUrl
- **WHEN** a `submissions` row was created via file upload
- **THEN** the serialized DTO has `blobUrl` as a non-empty string and `externalUrl` as `null`

#### Scenario: URL submission DTO has externalUrl and null blobUrl
- **WHEN** a `submissions` row was created via external URL
- **THEN** the serialized DTO has `externalUrl` as a non-empty string and `blobUrl` as `null`

#### Scenario: Unreviewed submission DTO has null review fields
- **WHEN** a `submissions` row whose parent enrollment is `submitted` (no review action taken yet) is serialized
- **THEN** the DTO has `rejectionReason: null` and `reviewedAt: null`

#### Scenario: Approved submission DTO has timestamp and null reason
- **WHEN** a `submissions` row whose parent enrollment is `approved` is serialized
- **THEN** the DTO has `reviewedAt` as a non-null ISO 8601 string and `rejectionReason: null`

#### Scenario: Rejected submission DTO has timestamp and optional reason
- **WHEN** a `submissions` row whose parent enrollment is `rejected` is serialized
- **THEN** the DTO has `reviewedAt` as a non-null ISO 8601 string and `rejectionReason` as either a non-empty string (when the reject action supplied a reason) or `null` (when the reject action omitted a reason)

#### Scenario: DTO uses camelCase
- **WHEN** any submission endpoint serializes a row
- **THEN** the JSON response uses `enrollmentId`, `blobUrl`, `externalUrl`, `submittedAt`, `rejectionReason`, and `reviewedAt` (camelCase) regardless of the underlying column names
