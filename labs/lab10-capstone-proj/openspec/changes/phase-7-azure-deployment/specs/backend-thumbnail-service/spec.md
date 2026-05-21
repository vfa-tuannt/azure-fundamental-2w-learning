## ADDED Requirements

### Requirement: Thumbnail microservice repo layout
The repository SHALL contain a top-level `services/thumbnail/` directory holding a Node 24 Express app with `package.json`, `Dockerfile`, `src/index.ts`, and unit tests. The Dockerfile SHALL use a multi-stage build that ends with a small runtime image (e.g., `node:24-slim`) and SHALL run as a non-root user. The image SHALL listen on port `3000`.

#### Scenario: Image runs as non-root
- **WHEN** an operator runs `docker inspect <image> --format '{{.Config.User}}'`
- **THEN** the value is not `root` and not the empty string

### Requirement: POST /thumbnail endpoint
The thumbnail service SHALL expose `POST /thumbnail` accepting JSON body `{ blobUrl: string }`. The service SHALL:
1. Download the blob bytes via the URL (using a SAS URL or, in v1, a connection-string-authenticated Azure SDK client when `STORAGE_CONNECTION_STRING` env var is set and the URL host matches the configured Storage Account).
2. Detect MIME type from bytes.
3. Branch on type:
   - `image/png`, `image/jpeg`, `image/webp` → resize via `sharp` to fit `256x256`, output PNG.
   - `application/pdf` → render page 1 to 256x256 PNG via `pdf-thumbnail`.
   - Anything else → return a static placeholder PNG (256x256, file-type-icon style) bundled in the image.
4. Respond `200 OK` with `Content-Type: image/png` and the PNG bytes in the body.

The endpoint SHALL respond with HTTP `422` if the body is invalid (missing `blobUrl`), HTTP `502` if the blob download fails, and HTTP `500` on any other unhandled error.

#### Scenario: PNG input is resized
- **WHEN** the service receives a `POST /thumbnail` with `blobUrl` pointing to a 1920x1080 PNG
- **THEN** the response is HTTP 200 `image/png` with dimensions ≤ 256x256

#### Scenario: PDF first-page rendering
- **WHEN** the service receives a `POST /thumbnail` pointing to a multi-page PDF
- **THEN** the response is HTTP 200 `image/png` showing page 1 only

#### Scenario: Unsupported MIME returns placeholder
- **WHEN** the service receives `POST /thumbnail` pointing to a `.zip` blob
- **THEN** the response is HTTP 200 `image/png` containing the bundled placeholder image

#### Scenario: Missing blobUrl returns 422
- **WHEN** the service receives `POST /thumbnail` with body `{}` 
- **THEN** the response is HTTP 422 with body `{ error: "blobUrl_required" }`

#### Scenario: Unreachable blob returns 502
- **WHEN** the upstream Storage Account returns 404 for the given URL
- **THEN** the response is HTTP 502 with body `{ error: "blob_fetch_failed" }`

### Requirement: NestJS thumbnail client integration
NestJS SHALL contain a `ThumbnailClient` service with method `requestThumbnail(submissionId: string, blobUrl: string): Promise<string>` that POSTs to `${THUMBNAIL_SERVICE_URL}/thumbnail`, persists the returned PNG to the Storage `submissions` container under path `thumbnails/${submissionId}.png`, and resolves with the resulting blob URL. The request SHALL have a 10-second timeout. The implementation SHALL be injected only into the file-submission path of `SubmissionsService`.

#### Scenario: Successful thumbnail call updates the submission row
- **WHEN** `requestThumbnail` resolves with a URL
- **THEN** the corresponding `submissions.thumbnail_url` column is updated to that URL via a stand-alone `UPDATE`

#### Scenario: Failure leaves thumbnail_url null
- **WHEN** the thumbnail service returns non-2xx or the request times out
- **THEN** `submissions.thumbnail_url` stays NULL, the failure is logged at `warn` level, and the original API response was already returned to the caller (the call is fire-and-forget from the request thread)

### Requirement: SubmissionsService dispatches the thumbnail call after commit
After `SubmissionsService.createFileSubmission` commits its transaction (the submission row + the enrollment status flip), it SHALL schedule `ThumbnailClient.requestThumbnail` via `setImmediate` (so the HTTP response returns first) and SHALL NOT block the caller on its result. URL submissions SHALL NOT trigger a thumbnail call.

#### Scenario: File submission HTTP latency is unaffected by thumbnail latency
- **WHEN** the thumbnail service is slow (5s) but `createFileSubmission` succeeds in 100ms
- **THEN** the HTTP response to the FE is sent within ~100ms; the thumbnail completes ~5s later out-of-band

#### Scenario: URL submission does not call the thumbnail service
- **WHEN** `createUrlSubmission` succeeds
- **THEN** `ThumbnailClient.requestThumbnail` is not invoked
