## ADDED Requirements

### Requirement: Submission DTO includes thumbnail and invalidation fields
The TypeScript type that the FE uses for `Submission` (defined in `frontend/src/api/submissions.ts`) SHALL include three new optional/nullable properties: `thumbnailUrl: string | null`, `invalidatedAt: string | null`, `invalidReason: string | null`. The API client SHALL pass them through verbatim from the backend response.

#### Scenario: Type includes new fields
- **WHEN** an FE developer hovers over a `Submission` value in their editor
- **THEN** the inferred type includes the three new properties

### Requirement: Invalid submission renders an inline warning
The submission list rendering SHALL display a small warning chip ("Invalid: ${invalidReason}") for any submission whose `invalidatedAt` is non-null. The chip SHALL use PrimeVue's `Tag` severity `"warning"` and SHALL render below the submitter name/timestamp line of the card.

#### Scenario: Valid submission shows no chip
- **WHEN** a submission has `invalidatedAt = null`
- **THEN** no invalid-warning chip is rendered for that submission

#### Scenario: Invalid submission shows chip with reason
- **WHEN** a submission has `invalidatedAt != null` and `invalidReason = "size_exceeded"`
- **THEN** the card renders a `Tag` with severity `warning` and text `Invalid: size_exceeded`

### Requirement: Submission list rendering integrates the thumbnail component
Wherever the FE renders a submission (the panel on the challenge detail page and the owner-only Submissions tab), the rendering SHALL include the thumbnail/icon block described in [frontend-thumbnails](../frontend-thumbnails/spec.md) as the leading element of the card.

#### Scenario: Thumbnail block is present on every card
- **WHEN** the submission list is rendered for any enrollment
- **THEN** each card contains exactly one leading thumbnail/icon block (an `<img>` if `thumbnailUrl` is present, otherwise a PrimeIcon fallback)
