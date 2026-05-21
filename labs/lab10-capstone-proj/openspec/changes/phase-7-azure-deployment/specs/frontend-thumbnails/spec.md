## ADDED Requirements

### Requirement: SubmissionCard renders thumbnail when present
The submission rendering component (`frontend/src/components/SubmissionCard.vue`, or its equivalent inline markup in the submission list) SHALL render an `<img>` element of fixed size 64x64 (CSS) sourced from `submission.thumbnailUrl` when the field is a non-empty string. When `thumbnailUrl` is null/undefined/empty, the component SHALL render a fallback PrimeIcon based on the submission's `kind`: `pi pi-file-pdf` for PDF, `pi pi-image` for images, `pi pi-file-arrow-up` for ZIP, `pi pi-link` for URL submissions, `pi pi-file` for anything else.

#### Scenario: Thumbnail URL renders as image
- **WHEN** a submission has `thumbnailUrl = "https://stskillplatformprod.blob.core.windows.net/submissions/thumbnails/abc.png"`
- **THEN** the rendered DOM contains exactly one `<img>` with `src` equal to that URL and 64x64 CSS dimensions

#### Scenario: Null thumbnail falls back to icon
- **WHEN** a submission has `thumbnailUrl = null` and is a PDF file
- **THEN** the rendered DOM contains a `<i class="pi pi-file-pdf">` and NO `<img>` element for the thumbnail

#### Scenario: URL submission shows link icon
- **WHEN** the submission has no `blobUrl` (URL submission)
- **THEN** the rendered DOM contains a `<i class="pi pi-link">`

### Requirement: Lazy-loaded image
The thumbnail `<img>` SHALL include `loading="lazy"` so the SWA does not eagerly fetch every thumbnail on first render of a long submission list. The `<img>` SHALL also include `alt="Submission preview"` for accessibility.

#### Scenario: Image is lazy and accessible
- **WHEN** any thumbnail `<img>` is rendered
- **THEN** the element's `loading` attribute equals `lazy` and the `alt` attribute is non-empty
