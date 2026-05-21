# Day 6 — API Management (APIM)

> **Goal:** Front your backend APIs (App Service, Functions, Container Apps) with a managed gateway that handles authentication, rate limiting, caching, transforms, and developer onboarding.
> **Time budget:** Theory 2 h · Hands-on 3 h
> **AWS analogy:** Amazon API Gateway (+ Usage Plans + Developer Portal)

---

## 1. Concepts

### 1.1 Why an API Gateway?

Without a gateway, every backend has to re-implement cross-cutting concerns: auth, throttling, CORS, response shaping, logging. APIM centralizes them.

```
            ┌────────────────────────────────────┐
            │       Azure API Management         │
            │  ┌──────┐  ┌──────┐  ┌──────────┐  │
Client ───► │  │ Auth │→ │ Rate │→ │ Transform│ │ ───► Backend (App Service / Function / Container App)
            │  └──────┘  └──────┘  └──────────┘  │
            └────────────────────────────────────┘
                   ▲                  ▲
              policies           developer portal
```

**You move logic out of every backend into one declarative place (policies).**

---

### 1.2 APIM Tiers — Pick One for the Right Job

| Tier | Use Case | Key Limits |
|------|----------|-----------|
| **Consumption** | Pay-per-call, low traffic, lab/POC | No VNet, no developer portal customization |
| **Developer** | Non-production / staging | Single-instance (no SLA) |
| **Basic** | Small production | No VNet, 2 units |
| **Standard** | Production | VNet integration (external), Application Gateway pattern |
| **Premium** | Enterprise / multi-region | Full VNet (internal mode), multi-region, AAD groups |
| **v2 (Basic v2 / Standard v2)** | Newer SKUs | Faster provisioning, simpler networking |

> **Rule of thumb for labs:** **Consumption** (cheap, ready in ~2 min). **Premium** is heavy — provisioning can take 30–45 minutes.

---

### 1.3 The APIM Object Model

```
APIM Service
  ├── APIs            (logical group: "Tasks API v1")
  │     └── Operations   (GET /tasks, POST /tasks, …)
  ├── Products        (bundle of APIs sold/exposed together: "Free", "Gold")
  │     └── Subscriptions  (API key issued to a consumer)
  ├── Groups          (Administrators, Developers, Guests, custom)
  ├── Users           (developer portal accounts)
  ├── Named Values    (env-var-like config, can reference Key Vault)
  └── Policies        (XML rules attached at global / product / API / operation scope)
```

| Concept | AWS analogy |
|---------|-------------|
| **API** | API Gateway "API" |
| **Operation** | API Gateway "Method" |
| **Product** | Usage Plan |
| **Subscription** | API Key tied to a Usage Plan |
| **Policy** | Mapping templates + Lambda authorizer + WAF rules combined |
| **Named Value** | Stage Variable (with Key Vault support) |

---

### 1.4 Policies — The Heart of APIM

Policies are **XML snippets** that execute in a pipeline around every request. Four scopes (inheriting top-down):

```
<policies>
  <inbound>          ← before forwarding to backend (auth, rate-limit, rewrite)
    <base />         ← runs parent scope's inbound
    ...
  </inbound>
  <backend>          ← how to call backend (retry, change URL)
    <base />
    ...
  </backend>
  <outbound>         ← after backend responds (mask fields, add headers)
    <base />
    ...
  </outbound>
  <on-error>         ← exception handling
    <base />
    ...
  </on-error>
</policies>
```

**Common policies you must recognize:**

| Policy | What it does |
|--------|--------------|
| `<rate-limit calls="100" renewal-period="60" />` | 100 req / 60s per subscription key |
| `<rate-limit-by-key />` | Rate-limit by IP, header, or custom expression |
| `<quota calls="10000" renewal-period="2592000" />` | Monthly quota |
| `<cors />` | Whitelist origins, methods, headers |
| `<validate-jwt />` | Verify a JWT against Entra ID or any OIDC issuer |
| `<set-header>` / `<set-query-parameter>` | Add/remove headers or query string |
| `<rewrite-uri template="/v1/{op}" />` | Map external path to backend path |
| `<cache-lookup>` / `<cache-store>` | Response caching (free 10 MB on Consumption) |
| `<set-backend-service />` | Route to a different backend (canary, mock) |
| `<return-response>` | Short-circuit (mock, block) |

> **The XML is order-dependent.** Auth before rate-limit before transforms.

---

### 1.5 Subscriptions and Keys

A consumer calls APIM with the header `Ocp-Apim-Subscription-Key: <key>`. The key is tied to:
- a **Product** (which APIs it can reach), and
- a **User** (for analytics + developer portal).

You can also expose APIs without a key (`subscriptionRequired=false`) and rely on JWT or another auth — common when APIM sits behind a CDN with its own auth.

---

### 1.6 Versioning vs Revisions — Don't Confuse Them

| Mechanism | When to use | Visible to client? |
|-----------|------------|--------------------|
| **Version** | Breaking changes (`/v1` → `/v2`). Different URL/header/query. | Yes — client opts in |
| **Revision** | Non-breaking changes (bug fix, new optional field). Stage before going live. | No — only one revision is "current" |

Pattern: cut a **revision** for every change, promote to current when verified. Cut a **version** only when contracts break.

---

### 1.7 Importing an API

You almost never define operations by hand — you import:

| Format | Source |
|--------|--------|
| **OpenAPI v2/v3** | Most common — `swagger.json` from your backend |
| **WSDL** | SOAP services |
| **Logic App / Function App / App Service** | One-click import via Portal |
| **GraphQL** | Schema-first or pass-through |

> Importing creates an `API + Operations` matching the spec; backend URL is set to your origin.

---

### 1.8 Developer Portal

Auto-generated docs site (`https://<service>.developer.azure-api.net`) where developers:
- Browse APIs
- Try operations interactively
- Sign up for subscriptions (get keys)

You customize branding via the portal's built-in editor. **Not available on Consumption tier.**

---

## 2. ✏️ Practice Quiz

**Q1.** You want to expose an internal Azure Function only through APIM, with rate limiting and an API key. The Function App has a public URL — anyone with that URL bypasses APIM. How do you fix it?
<details><summary>Answer</summary>
Two layers:
1. On the Function App, set the auth level of HTTP triggers to **Function** or **Admin** (not Anonymous), and store the function key in APIM as a **Named Value**, then have APIM append it via `<set-header name="x-functions-key" />`.
2. Even better, put the Function in a **VNet** (Premium plan) and only allow access from APIM's outbound IP / subnet, or use a **Private Endpoint** (Day 8). Anonymous public exposure is the single most common APIM mistake.
</details>

**Q2.** What's the minimum tier that supports the customizable Developer Portal?
<details><summary>Answer</summary>
**Developer** (non-prod) or **Basic** and above for production. **Consumption** has APIs but no full developer portal — only an API reference page.
</details>

**Q3.** You need 100 req/min per client, regardless of how many subscription keys they have. Which policy?
<details><summary>Answer</summary>
`<rate-limit-by-key calls="100" renewal-period="60" counter-key="@(context.Request.IpAddress)" />` — the `counter-key` expression decides what to throttle on (IP, header, JWT claim, etc.). The plain `<rate-limit>` policy keys on subscription, which a client can defeat by getting multiple keys.
</details>

**Q4.** You changed the response shape — added a new optional field. Do you publish a new **version** or a new **revision**?
<details><summary>Answer</summary>
**Revision.** Adding optional fields is non-breaking. Use revisions to stage and validate; promote to current when ready. Save versions for breaking changes (renamed fields, removed endpoints, status code semantics changed).
</details>

**Q5.** Why store secrets in **Named Values referencing Key Vault** rather than inline in a policy?
<details><summary>Answer</summary>
- Policies are version-controlled and visible to anyone with read access; inline secrets leak.
- Key Vault rotation propagates automatically (4-hour refresh by default).
- You can audit Key Vault access centrally.
Same principle as App Service → Key Vault references on Day 7.
</details>

---

## 3. 🔬 Hands-on Lab

You'll put APIM in front of the Day 2 Tasks API (or any HTTP endpoint you have), add rate limiting, CORS, JWT-free key auth, and a simple response transform.

### Prerequisites

- A reachable backend HTTP API. Easiest options:
  - The `api-tasks-<ALIAS>.azurewebsites.net` from Day 2, **or**
  - The `func-tasks-<ALIAS>.azurewebsites.net` HTTP trigger from Day 3, **or**
  - Any public test API (e.g. `https://httpbin.org`) — fine for learning the policies.
- Azure CLI logged in (`az login`).

> **Heads-up on tier choice.** Use **Consumption** (`--sku-name Consumption`). It provisions in ~2 minutes. Picking Developer/Standard means 30–45 minutes of waiting before you can do anything.

---

### Step 1 — Create the APIM Service

```bash
az group create --name rg-learning-day6 --location southeastasia

APIM_NAME="apim-learning-<YOUR_ALIAS>"   # globally unique
PUBLISHER_EMAIL="tuannt@vitalify.asia"
PUBLISHER_NAME="Tuan Nguyen"

az apim create \
  --name "$APIM_NAME" \
  --resource-group rg-learning-day6 \
  --location southeastasia \
  --publisher-email "$PUBLISHER_EMAIL" \
  --publisher-name "$PUBLISHER_NAME" \
  --sku-name Consumption
```

Wait for provisioning:

```bash
az apim show \
  --name "$APIM_NAME" \
  --resource-group rg-learning-day6 \
  --query "{state:provisioningState, gateway:gatewayUrl}"
```

When `provisioningState == "Succeeded"`, your gateway URL is `https://<APIM_NAME>.azure-api.net`.

---

### Step 2 — Import an API

#### Option A — Import from OpenAPI URL (recommended)

If your backend exposes a swagger doc:

```bash
az apim api import \
  --resource-group rg-learning-day6 \
  --service-name "$APIM_NAME" \
  --api-id tasks-api \
  --path tasks \
  --specification-format OpenApiJson \
  --specification-url "https://api-tasks-<YOUR_ALIAS>.azurewebsites.net/swagger/v1/swagger.json" \
  --display-name "Tasks API"
```

#### Option B — Create manually (no swagger handy)

```bash
# Create an empty API pointing at the backend
az apim api create \
  --resource-group rg-learning-day6 \
  --service-name "$APIM_NAME" \
  --api-id tasks-api \
  --path tasks \
  --display-name "Tasks API" \
  --service-url "https://api-tasks-<YOUR_ALIAS>.azurewebsites.net" \
  --protocols https

# Add the GET /tasks operation
az apim api operation create \
  --resource-group rg-learning-day6 \
  --service-name "$APIM_NAME" \
  --api-id tasks-api \
  --operation-id list-tasks \
  --display-name "List tasks" \
  --method GET \
  --url-template "/api/tasks"

# Add POST /tasks
az apim api operation create \
  --resource-group rg-learning-day6 \
  --service-name "$APIM_NAME" \
  --api-id tasks-api \
  --operation-id create-task \
  --display-name "Create task" \
  --method POST \
  --url-template "/api/tasks"
```

Test through the gateway:

```bash
# Get a subscription key (auto-created "master" key)
SUB_KEY=$(az apim subscription show \
  --resource-group rg-learning-day6 \
  --service-name "$APIM_NAME" \
  --sid master \
  --query primaryKey -o tsv)

curl "https://$APIM_NAME.azure-api.net/tasks/api/tasks" \
  -H "Ocp-Apim-Subscription-Key: $SUB_KEY"
```

---

### Step 3 — Add a Rate-Limit Policy (100 req / 60 s)

Create `policy-tasks-api.xml`:

```xml
<policies>
  <inbound>
    <base />
    <rate-limit calls="100" renewal-period="60" />
    <cors allow-credentials="false">
      <allowed-origins>
        <origin>*</origin>
      </allowed-origins>
      <allowed-methods>
        <method>GET</method>
        <method>POST</method>
        <method>PUT</method>
        <method>DELETE</method>
      </allowed-methods>
      <allowed-headers>
        <header>*</header>
      </allowed-headers>
    </cors>
  </inbound>
  <backend>
    <base />
  </backend>
  <outbound>
    <base />
    <set-header name="X-Powered-By" exists-action="delete" />
    <set-header name="X-Api-Gateway" exists-action="override">
      <value>APIM-Day6</value>
    </set-header>
  </outbound>
  <on-error>
    <base />
  </on-error>
</policies>
```

Apply it to the API:

```bash
az apim api policy create \
  --resource-group rg-learning-day6 \
  --service-name "$APIM_NAME" \
  --api-id tasks-api \
  --policy-format xml \
  --value "$(cat policy-tasks-api.xml)"
```

> **Portal alternative:** APIM → APIs → Tasks API → **Design** tab → click the `</>` icon on **Inbound processing** to edit policies with autocomplete. Easier than CLI for iteration.

Verify the rate limit:

```bash
for i in {1..110}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    "https://$APIM_NAME.azure-api.net/tasks/api/tasks" \
    -H "Ocp-Apim-Subscription-Key: $SUB_KEY"
done | sort | uniq -c
# Expect ~100x 200 then 10x 429
```

---

### Step 4 — Issue a Per-Consumer Subscription Key

```bash
# Create a "free" product
az apim product create \
  --resource-group rg-learning-day6 \
  --service-name "$APIM_NAME" \
  --product-id free \
  --display-name "Free tier" \
  --subscription-required true \
  --approval-required false \
  --state published

# Add the Tasks API to the product
az apim product api add \
  --resource-group rg-learning-day6 \
  --service-name "$APIM_NAME" \
  --product-id free \
  --api-id tasks-api

# Issue a subscription tied to this product
az apim subscription create \
  --resource-group rg-learning-day6 \
  --service-name "$APIM_NAME" \
  --sid sub-mobile-app \
  --display-name "Mobile app subscription" \
  --scope "/products/free"

NEW_KEY=$(az apim subscription show \
  --resource-group rg-learning-day6 \
  --service-name "$APIM_NAME" \
  --sid sub-mobile-app \
  --query primaryKey -o tsv)

curl "https://$APIM_NAME.azure-api.net/tasks/api/tasks" \
  -H "Ocp-Apim-Subscription-Key: $NEW_KEY"
```

> The "master" key works for any product. Real consumers get product-scoped keys so you can revoke/rotate per consumer.

---

### Step 5 — Hide the Backend URL with `rewrite-uri`

Add to the inbound policy (between `<base />` and `<rate-limit>`):

```xml
<rewrite-uri template="/api/tasks" />
```

…and change the API's `path` from `tasks` to `v1`. Now clients call `/v1/tasks` and APIM forwards to `/api/tasks` on the backend. The internal route is no longer leaked.

---

### Step 6 — (Optional) Inspect Traffic in the Portal

Portal → APIM → APIs → Tasks API → **Test** tab → pick `List tasks` → **Send**.
- See the resolved policies in **Trace** (toggle "Trace" on first).
- Trace shows every policy and its execution time — invaluable for debugging.

---

### Cleanup

```bash
az group delete --name rg-learning-day6 --yes --no-wait
```

Note: deleting the resource group on Consumption tier is quick. Premium-tier instances leave a soft-deleted shell for 48 h — use `az apim deletedservice purge ...` if names clash.

---

## 4. ✅ Checkpoint

- [ ] APIM Consumption-tier service is `Succeeded` and you have its gateway URL
- [ ] `tasks-api` imported (or created) with at least one operation
- [ ] Gateway URL with subscription key returns the same payload as the backend
- [ ] Rate-limit policy returns `429` after the 100th call within 60s
- [ ] Product `free` + subscription `sub-mobile-app` issue a working scoped key
- [ ] CORS preflight (`OPTIONS`) returns 200 with the expected `Access-Control-*` headers

---

## 5. Key Takeaways

| Concept | Remember |
|---------|----------|
| Tier choice for labs | **Consumption** — provisions in ~2 min; Developer/Standard takes 30–45 min |
| Policy scopes | global → product → API → operation, with `<base />` to inherit parent |
| Subscriptions vs Products | Product = bundle of APIs; Subscription = key for a consumer of that product |
| Versions vs Revisions | Version = breaking; Revision = staged non-breaking change |
| Secrets in policies | Use **Named Values** referencing Key Vault — never inline |
| Don't leak the backend | Block public access (VNet / Private Endpoint / function keys) — APIM should be the only door |

---

**← [Day 5: Azure SQL & PostgreSQL](../week1/day5-databases.md)**
**→ [Day 7: Blob Storage + Key Vault](./day7-blob-keyvault.md)**
