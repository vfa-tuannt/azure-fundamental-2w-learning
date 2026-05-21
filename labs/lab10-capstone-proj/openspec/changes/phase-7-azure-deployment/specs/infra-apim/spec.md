## ADDED Requirements

### Requirement: APIM Consumption-tier instance
The system SHALL provision an Azure API Management instance `apim-skillplatform-prod` in `japaneast` on the Consumption SKU, publisher email and name supplied via Terraform variables, and a system-assigned managed identity. The Developer Portal SHALL be enabled and reachable at the default `*.developer.azure-api.net` hostname.

#### Scenario: APIM SKU is Consumption
- **WHEN** an operator views the APIM Overview blade
- **THEN** the pricing tier reads `Consumption (0)`

#### Scenario: Developer Portal is published
- **WHEN** an operator navigates to `https://apim-skillplatform-prod.developer.azure-api.net`
- **THEN** the portal loads and lists at least the `skillplatform-api` product

### Requirement: Backend registrations and routing
The system SHALL register two APIM backends:
- `be-skillplatform-api`: URL `https://app-skillplatform-prod.azurewebsites.net`, credentials `none`.
- `be-skillplatform-thumbnail`: URL `https://aca-skillplatform-thumbnail.<region>.azurecontainerapps.io`, credentials `none`.

The APIM API definition SHALL be imported from the NestJS Swagger JSON (the workflow downloads `https://app-skillplatform-prod.azurewebsites.net/api/docs-json` over the VNet using a deployment helper, or alternatively the workflow exports the JSON during the backend deploy step and uploads it as an artifact). Operations originally under `/` SHALL be re-based under `/api`. The thumbnail App's `POST /thumbnail` SHALL be exposed under `/thumbnail`.

#### Scenario: All NestJS routes are reachable via /api
- **WHEN** a client calls `https://apim-skillplatform-prod.azure-api.net/api/challenges`
- **THEN** the request is forwarded to the App Service and returns the same payload as the local-dev `GET /challenges`

#### Scenario: Thumbnail is reachable via /thumbnail
- **WHEN** a client calls `https://apim-skillplatform-prod.azure-api.net/thumbnail`
- **THEN** the request is forwarded to the thumbnail Container App

### Requirement: Edge policies
The APIM API SHALL apply the following policies in the inbound section:
1. `cors`: allow the SWA default hostname as `allowed-origins`; methods `GET, POST, PATCH, DELETE, OPTIONS`; headers `*`.
2. `rate-limit-by-key`: 100 calls per 60 seconds keyed on caller IP (`context.Request.IpAddress`).
3. `validate-jwt`: RS256, signing key from the `JwtPublicKey` Named Value (Key Vault-backed). Required header `Authorization: Bearer <token>`, audience and issuer matching the NestJS-issued JWT. Applied at the global API level with per-operation `<base />` overrides for the anonymous routes.

The anonymous-exempt routes SHALL be: `GET /api/health`, `GET /api/auth/google`, `GET /api/auth/google/callback`, `GET /api/auth/me` (still 401s without a token, but bypasses the APIM-edge JWT gate so the App Service's own auth path runs), `POST /api/auth/logout`, `GET /api/activity/recent`, `GET /api/challenges`, `GET /api/challenges/{id}`.

#### Scenario: Rate limit fires at 101st request
- **WHEN** a single IP sends 101 requests within 60 seconds to any APIM-fronted route
- **THEN** the 101st response is HTTP 429 with a `Retry-After` header

#### Scenario: Missing JWT on a protected route returns 401 at the edge
- **WHEN** a client calls `POST /api/challenges` without an `Authorization` header
- **THEN** APIM responds with HTTP 401 and the request never reaches the App Service

#### Scenario: Valid JWT on a protected route reaches the backend
- **WHEN** a client calls `POST /api/challenges` with a valid JWT signed by our RS256 private key
- **THEN** APIM passes the request through and the App Service handles it normally

#### Scenario: Anonymous routes do not require JWT
- **WHEN** a client calls `GET /api/activity/recent` without an `Authorization` header
- **THEN** APIM forwards the request and the App Service responds with HTTP 200

#### Scenario: CORS preflight succeeds for SWA origin
- **WHEN** the deployed SWA issues a CORS preflight `OPTIONS` request
- **THEN** APIM responds with HTTP 204 and `Access-Control-Allow-Origin` equal to the SWA hostname
