# Day 2 — App Service: Web Hosting

> **Goal:** Deploy and run a web app / REST API on Azure App Service with staging slot and auto-scaling.  
> **Time budget:** Theory 2 h · Hands-on 3 h  
> **AWS analogy:** Elastic Beanstalk + EC2 (managed PaaS)

---

## 1. Concepts

### 1.1 App Service Plan — The "Server" Behind the App

An **App Service Plan** defines the underlying compute resources. Think of it as the EC2 instance type for your web app.

```
App Service Plan  (compute resources: CPU, RAM, instances)
   ├── Web App A
   ├── Web App B  ← multiple apps share one plan
   └── API App C
```

**Tiers at a glance:**

| Tier | Use Case | Key Feature |
|------|---------|-------------|
| **Free (F1)** | Learning only | 60 min/day CPU, no custom domain |
| **Shared (D1)** | Learning + custom domain | Still shared host |
| **Basic (B1–B3)** | Dev/test | Manual scale, no auto-scale |
| **Standard (S1–S3)** | Production | Auto-scale, deployment slots, custom SSL |
| **Premium (P1v3–P3v3)** | High-perf production | VNet integration, more instances |
| **Isolated (I1v2–I3v2)** | Compliance / private | Dedicated environment (App Service Environment) |

> **AWS equivalent:** Think of Free/Shared as t3.micro, Standard as m5.xlarge with autoscaling groups.

---

### 1.2 App Types

| App Type | Purpose |
|----------|---------|
| **Web App** | Serves HTTP requests (website, SPA, SSR) |
| **API App** | REST/gRPC backend (same infra, just a label + Swagger support) |
| **Function App** | Serverless (covered Day 3) |

In practice, Web App and API App are the same infrastructure — the distinction is semantic and for Portal organization.

---

### 1.3 Deployment Methods

| Method | Best For |
|--------|---------|
| **GitHub Actions** | Automated CI/CD from GitHub repo |
| **Azure DevOps Pipelines** | Enterprise CI/CD |
| **ZIP Deploy** | Quick manual deploy (`az webapp deploy`) |
| **FTP** | Legacy / quick test |
| **Container (Docker)** | Deploy a pre-built container image |

> For your company's workflow, **GitHub Actions** is the target method (Day 9 covers CI/CD fully).

---

### 1.4 Deployment Slots ⭐

Slots are separate instances of your app within the same App Service Plan. Available from **Standard** tier.

```
Production Slot  ←── traffic from users
     │
     │  swap (atomic, zero-downtime)
     ▼
Staging Slot     ←── deploy new version here first
```

**Workflow:**
1. Deploy to `staging` slot.
2. Run smoke tests against `staging` URL.
3. **Swap** → staging becomes production instantly.
4. Old production is now in staging — easy rollback.

> **AWS analogy:** Blue/Green deployment with ALB weighted routing, but much simpler.

---

### 1.5 Configuration: App Settings vs Connection Strings

| Type | Purpose | AWS analogy |
|------|---------|-------------|
| **App Settings** | Environment variables injected at runtime | `process.env.MY_VAR` | Lambda env vars |
| **Connection Strings** | DB connection strings (overrides app config) | RDS connection info in Secrets Manager |

- App Settings override `appsettings.json` (`.NET`) or `process.env` (Node.js) automatically.
- **Never hardcode secrets** — use App Settings + Key Vault references (Day 7).

---

### 1.6 Scale Up vs Scale Out

| Operation | What changes | When to use |
|-----------|-------------|-------------|
| **Scale Up** | Bigger VM tier (B1 → S1) | Need more CPU/RAM per instance |
| **Scale Out** | More instances of same tier | Handle more concurrent requests |

**Auto-scaling rules (Standard+ tier):**

```
Trigger: CpuPercentage > 70%  →  add 1 instance
Trigger: CpuPercentage < 30%  →  remove 1 instance
Bounds:  min=2, max=10 instances
```

> **AWS analogy:** EC2 Auto Scaling Groups with CloudWatch alarms.

---

### 1.7 Custom Domains & SSL

1. Add a **CNAME** or **A record** in your DNS pointing to the app's default domain.
2. Bind the custom domain in App Service.
3. Add an **SSL/TLS certificate** (free managed certificate available on Basic+).

---

### 1.8 VNet Integration (Private Access)

By default, your App Service has a public IP. To access private resources (private DB, internal services):

- **VNet Integration** (outbound): App Service → private VNet → private resources.
- **Private Endpoint** (inbound): Remove public access; only VNet clients can reach the app.

> Covered in detail on Day 8.

---

## 2. ✏️ Practice Quiz

**Q1.** You have 3 web apps: a frontend, a backend API, and an admin portal. They all have similar traffic. Should they share one App Service Plan or have separate plans?  
<details><summary>Answer</summary>
They **can** share one plan to save cost — all three run on the same compute. However, if one app spikes CPU, it affects the others. For production workloads, separate the backend API (higher traffic) from the others. For dev/test, one plan is fine.
</details>

**Q2.** You need zero-downtime deployments. What feature do you use and what tier is the minimum?  
<details><summary>Answer</summary>
**Deployment Slots** — minimum **Standard (S1)** tier. Deploy to the staging slot, validate, then swap.
</details>

**Q3.** Your Node.js app reads `process.env.DATABASE_URL`. Where do you configure this value in Azure?  
<details><summary>Answer</summary>
In **App Service → Configuration → Application Settings**. Add a key `DATABASE_URL` with the value. Azure injects it as an environment variable automatically. For production, the value should be a **Key Vault reference** (syntax: `@Microsoft.KeyVault(SecretUri=...)`).
</details>

**Q4.** The staging slot has a different database connection string than production. How do you handle this?  
<details><summary>Answer</summary>
Mark the App Setting or Connection String as **"Deployment slot setting"** (stick to slot). This setting will NOT be swapped — each slot keeps its own value even after a swap.
</details>

**Q5.** Your API gets 3× traffic every weekday at 9 AM. What's the most cost-effective scaling strategy?  
<details><summary>Answer</summary>
**Schedule-based auto-scale**: scale out to 5 instances at 8:45 AM on weekdays, scale back to 2 at 6 PM. Combine with metric-based rules (CPU > 70%) as a safety net. This is cheaper than always running at peak capacity.
</details>

---

## 3. 🔬 Hands-on Lab

### Prerequisites
- Resource Group from Day 1 (`rg-learning-day1`) still exists, **or** create `rg-learning-day2`
- A simple Node.js or Python REST API on GitHub (use the sample below if you don't have one)

---

### Step 1 — Create a Sample App (if needed)

If you don't have a repo, create a minimal Node.js app locally:

```bash
mkdir demo-api && cd demo-api
npm init -y
npm install express
```

Create `server.js`:

```javascript
const express = require('express');
const app = express();
app.use(express.json());

let tasks = [];
let nextId = 1;

app.get('/api/tasks', (req, res) => res.json(tasks));

app.post('/api/tasks', (req, res) => {
  const task = { id: nextId++, ...req.body, createdAt: new Date() };
  tasks.push(task);
  res.status(201).json(task);
});

app.put('/api/tasks/:id', (req, res) => {
  const idx = tasks.findIndex(t => t.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  tasks[idx] = { ...tasks[idx], ...req.body };
  res.json(tasks[idx]);
});

app.delete('/api/tasks/:id', (req, res) => {
  tasks = tasks.filter(t => t.id !== parseInt(req.params.id));
  res.status(204).send();
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on port ${port}`));
```

Update `package.json` start script:

```json
"scripts": { "start": "node server.js" }
```

Push to GitHub or use ZIP deploy (Step 3b).

---

### Step 2 — Create App Service Plan and Web App

```bash
# Use existing resource group or create a new one
az group create --name rg-learning-day2 --location southeastasia

# Create App Service Plan (Standard S1 = supports slots + auto-scale)
az appservice plan create \
  --name plan-learning-day2 \
  --resource-group rg-learning-day2 \
  --sku S1 \
  --location southeastasia

# Create Web App (Node.js 18)
az webapp create \
  --name api-tasks-<YOUR_ALIAS>   \
  --resource-group rg-learning-day2 \
  --plan plan-learning-day2 \
  --runtime "NODE|18-lts"
```

> Replace `<YOUR_ALIAS>` with something unique — App Service names are globally unique.

Verify the app is running (returns default page):

```bash
az webapp show \
  --name api-tasks-<YOUR_ALIAS> \
  --resource-group rg-learning-day2 \
  --query defaultHostName \
  --output tsv
```

Open `https://<defaultHostName>` in browser.

---

### Step 3a — Deploy from GitHub

```bash
az webapp deployment source config \
  --name api-tasks-<YOUR_ALIAS> \
  --resource-group rg-learning-day2 \
  --repo-url "https://github.com/<YOUR_GITHUB>/demo-api" \
  --branch main \
  --manual-integration
```

Trigger a build:

```bash
az webapp deployment source sync \
  --name api-tasks-<YOUR_ALIAS> \
  --resource-group rg-learning-day2
```

---

### Step 3b — Deploy via ZIP (alternative, faster for local testing)

```bash
cd demo-api
zip -r app.zip .

az webapp deploy \
  --name api-tasks-<YOUR_ALIAS> \
  --resource-group rg-learning-day2 \
  --src-path app.zip \
  --type zip
```

---

### Step 4 — Set an App Setting (environment variable)

```bash
az webapp config appsettings set \
  --name api-tasks-<YOUR_ALIAS> \
  --resource-group rg-learning-day2 \
  --settings APP_ENV=production LOG_LEVEL=info

# Verify
az webapp config appsettings list \
  --name api-tasks-<YOUR_ALIAS> \
  --resource-group rg-learning-day2 \
  --output table
```

---

### Step 5 — Create a Staging Slot

```bash
# Create staging slot
az webapp deployment slot create \
  --name api-tasks-<YOUR_ALIAS> \
  --resource-group rg-learning-day2 \
  --slot staging

# Set a slot-specific setting (will NOT be swapped)
az webapp config appsettings set \
  --name api-tasks-<YOUR_ALIAS> \
  --resource-group rg-learning-day2 \
  --slot staging \
  --slot-settings APP_ENV=staging

# Deploy to staging slot
az webapp deploy \
  --name api-tasks-<YOUR_ALIAS> \
  --resource-group rg-learning-day2 \
  --slot staging \
  --src-path app.zip \
  --type zip
```

Test staging:

```bash
# Staging URL pattern: https://<app>-staging.azurewebsites.net
curl https://api-tasks-<YOUR_ALIAS>-staging.azurewebsites.net/api/tasks
```

Swap to production:

```bash
az webapp deployment slot swap \
  --name api-tasks-<YOUR_ALIAS> \
  --resource-group rg-learning-day2 \
  --slot staging \
  --target-slot production
```

---

### Step 6 — Configure Auto-scaling

```bash
# Enable autoscale on the App Service Plan
az monitor autoscale create \
  --name autoscale-plan-day2 \
  --resource-group rg-learning-day2 \
  --resource plan-learning-day2 \
  --resource-type Microsoft.Web/serverFarms \
  --min-count 1 \
  --max-count 5 \
  --count 1

# Rule: scale OUT when CPU > 70% for 5 minutes
az monitor autoscale rule create \
  --resource-group rg-learning-day2 \
  --autoscale-name autoscale-plan-day2 \
  --condition "CpuPercentage > 70 avg 5m" \
  --scale out 1

# Rule: scale IN when CPU < 30% for 10 minutes
az monitor autoscale rule create \
  --resource-group rg-learning-day2 \
  --autoscale-name autoscale-plan-day2 \
  --condition "CpuPercentage < 30 avg 10m" \
  --scale in 1
```

---

### Step 7 — Test the API end-to-end

```bash
APP_URL="https://api-tasks-<YOUR_ALIAS>.azurewebsites.net"

# Create a task
curl -X POST "$APP_URL/api/tasks" \
  -H "Content-Type: application/json" \
  -d '{"title":"Learn Azure","description":"Day 2 hands-on","status":"pending"}'

# List tasks
curl "$APP_URL/api/tasks"

# Update
curl -X PUT "$APP_URL/api/tasks/1" \
  -H "Content-Type: application/json" \
  -d '{"status":"completed"}'

# Delete
curl -X DELETE "$APP_URL/api/tasks/1"
```

---

### Cleanup (optional)

```bash
az group delete --name rg-learning-day2 --yes --no-wait
```

---

## 4. ✅ Checkpoint

- [ ] App Service Plan (`S1`) created in `southeastasia`
- [ ] Web App deployed and returns `200` at `/api/tasks`
- [ ] App Setting `APP_ENV=production` visible in Configuration
- [ ] Staging slot created and accessible at `-staging.azurewebsites.net`
- [ ] Swap from staging to production completed without downtime
- [ ] Auto-scale rule configured (CPU > 70% → add instance)

---

## 5. Key Takeaways

| Concept | Remember |
|---------|----------|
| App Service Plan tier | Minimum **Standard (S1)** for slots + auto-scale |
| Deployment slots | Deploy → test → swap → instant rollback available |
| Slot-sticky settings | Use `--slot-settings` for DB URLs that must not swap |
| Scale up vs scale out | Scale up = bigger VM; scale out = more VMs |
| Auto-scale | Metric-based (CPU/HTTP queue) or schedule-based |

---

**← [Day 1: Azure Fundamentals](./day1-azure-fundamentals.md)**  
**→ [Day 3: Azure Functions — Serverless](./day3-azure-functions.md)**
