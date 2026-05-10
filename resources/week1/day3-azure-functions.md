# Day 3 — Azure Functions: Serverless

> **Goal:** Write, test locally, and deploy serverless functions with multiple trigger types.  
> **Time budget:** Theory 2 h · Hands-on 3 h  
> **AWS analogy:** AWS Lambda (same concept, similar execution model)

---

## 1. Concepts

### 1.1 What Is a Serverless Function?

You write a **function** (a single unit of work). Azure handles:
- Provisioning & scaling servers
- OS patching
- Idle time (you pay only for executions)

```
Event (trigger)  →  Your function code runs  →  Output (binding / return value)
```

---

### 1.2 Hosting Plans — Critical Difference

| Plan | Cold start | Max execution | Scaling | Cost model |
|------|-----------|---------------|---------|------------|
| **Consumption** | Yes (~1–3s) | 10 min | Automatic, 0→∞ | Pay per execution |
| **Flex Consumption** | Reduced | 10 min (extendable) | Automatic | Pay per execution + reserved |
| **Premium (EP1–EP3)** | No (pre-warmed) | Unlimited | Automatic | Pay per vCore-second |
| **Dedicated (App Service Plan)** | No | Unlimited | Manual/auto-scale | Pay for plan |

> **Rule of thumb:**  
> - Lightweight, infrequent jobs → **Consumption**  
> - APIs needing no cold start / VNet integration → **Premium**  
> - Always-on, co-hosted with existing App Service → **Dedicated**

---

### 1.3 Triggers

A trigger **starts** your function. Each function has exactly **one** trigger.

| Trigger | Fires when… | AWS equivalent |
|---------|------------|----------------|
| **HTTP** | An HTTP request arrives | Lambda + API Gateway / Function URL |
| **Timer** | CRON expression fires | EventBridge Scheduler |
| **Blob** | A file is uploaded to Blob Storage | S3 trigger on Lambda |
| **Queue** | A message arrives in Storage Queue | SQS trigger |
| **Service Bus** | Message on Service Bus Queue/Topic | SQS / SNS trigger |
| **Event Hub** | Event arrives in Event Hub | Kinesis trigger |
| **Cosmos DB** | Document change (change feed) | DynamoDB Streams |

---

### 1.4 Bindings — Declarative I/O

Bindings let you read/write other services **without writing boilerplate connection code**.

```
Input binding  →  [Your function] →  Output binding
(reads data)                        (writes data)
```

Example: A Blob-triggered function that reads a file (input binding) and writes a row to Storage Queue (output binding) — no SDK code for either, just configuration.

**function.json (v3) / decorator (v2 Python) example:**

```json
{
  "bindings": [
    {
      "type": "blobTrigger",
      "direction": "in",
      "name": "myBlob",
      "path": "uploads/{name}",
      "connection": "AzureWebJobsStorage"
    },
    {
      "type": "queue",
      "direction": "out",
      "name": "outputQueue",
      "queueName": "processed",
      "connection": "AzureWebJobsStorage"
    }
  ]
}
```

---

### 1.5 CRON Expression Format

Azure Functions uses a **6-field** CRON (unlike Linux's 5-field):

```
{second} {minute} {hour} {day} {month} {day-of-week}
```

| Expression | Meaning |
|-----------|---------|
| `0 */5 * * * *` | Every 5 minutes |
| `0 0 9 * * 1-5` | 9:00 AM Monday–Friday |
| `0 0 0 1 * *` | Midnight on the 1st of every month |
| `0 30 8 * * *` | Every day at 8:30 AM |

---

### 1.6 Durable Functions (Orchestration)

When you need to coordinate multiple functions in a workflow:

```
Orchestrator Function
   ├── calls Activity Function A  (process image)
   ├── waits for result
   ├── calls Activity Function B  (send notification)
   └── returns final result
```

**Patterns:**
| Pattern | Description |
|---------|-------------|
| **Function Chaining** | A → B → C sequentially |
| **Fan-out/Fan-in** | Spawn N parallel tasks, wait for all |
| **Async HTTP (polling)** | Long-running job with status endpoint |
| **Human Interaction** | Pause until external event (approval workflow) |

> **AWS analogy:** AWS Step Functions.

---

### 1.7 Application Insights Integration

Every Function App should be linked to Application Insights for:
- Invocation logs and errors
- Performance (execution duration, failures)
- Live Metrics stream
- Distributed tracing (correlation ID across services)

```bash
az monitor app-insights component create \
  --app ai-functions-day3 \
  --location southeastasia \
  --resource-group rg-learning-day3
```

---

## 2. ✏️ Practice Quiz

**Q1.** Your Lambda-equivalent function runs every 5 minutes to process pending records. It completes in < 30 seconds. Which hosting plan do you choose and why?  
<details><summary>Answer</summary>
**Consumption plan.** The function is infrequent and short-lived — you pay only for the ~30 seconds of execution × number of runs per day. Cold start is acceptable for a background job. This maps directly to a Lambda triggered by EventBridge Scheduler.
</details>

**Q2.** You need a function that responds to HTTP requests at low latency (< 50ms) with no cold starts. Which plan?  
<details><summary>Answer</summary>
**Premium plan** — pre-warmed instances eliminate cold starts. Consumption cold starts can be 1–3 seconds for Node.js/Python, which is unacceptable for user-facing APIs.
</details>

**Q3.** Write the CRON expression for: "Run at 2:30 AM every day."  
<details><summary>Answer</summary>
`0 30 2 * * *` — second=0, minute=30, hour=2, day=*, month=*, day-of-week=*
</details>

**Q4.** A Blob-triggered function needs to write results to a Storage Queue. Do you need to use the Azure Storage SDK in your code?  
<details><summary>Answer</summary>
No. Configure an **output binding** for the Queue. Azure Functions injects the output automatically — your function just returns the value or sets the output binding parameter. This is one of the key benefits of bindings.
</details>

**Q5.** What is the maximum execution timeout for a function on the **Consumption plan**?  
<details><summary>Answer</summary>
**10 minutes** (default is 5 minutes; configurable up to 10 in `host.json`). If your job takes longer, use the **Premium or Dedicated plan** (unlimited), or break the work into smaller chunks using Durable Functions fan-out.
</details>

---

## 3. 🔬 Hands-on Lab

### Prerequisites

```bash
# Install Azure Functions Core Tools (v4)
npm install -g azure-functions-core-tools@4 --unsafe-perm true

# Verify
func --version   # should be 4.x

# Install Python (if using Python runtime)
python3 --version  # 3.11 recommended
```

---

### Step 1 — Create Resource Group and Storage Account

```bash
az group create --name rg-learning-day3 --location southeastasia

# Functions need a storage account for runtime state
az storage account create \
  --name stfuncday3<YOUR_ALIAS> \
  --resource-group rg-learning-day3 \
  --location southeastasia \
  --sku Standard_LRS
```

---

### Step 2 — Scaffold a Function App Locally (Python)

```bash
mkdir func-day3 && cd func-day3

# Initialize project — v2 programming model
func init --python --model V2

# Your project structure:
# func-day3/
#   function_app.py     ← ALL functions go here (decorators)
#   host.json           ← global settings (timeout, logging)
#   local.settings.json ← local env vars (NOT committed to git)
#   requirements.txt
```

> **v2 vs v1:** v2 uses a single `function_app.py` with Python decorators. No `__init__.py` or `function.json` per function. This is the current recommended model.

---

### Lab A — HTTP Trigger

Edit `function_app.py`:

```python
import azure.functions as func
import json
import logging

app = func.FunctionApp()

tasks = []
next_id = [1]

@app.route(route="HttpTasksApi", auth_level=func.AuthLevel.ANONYMOUS, methods=["GET", "POST"])
def HttpTasksApi(req: func.HttpRequest) -> func.HttpResponse:
    logging.info(f"HTTP trigger: {req.method} {req.url}")

    if req.method == "GET":
        return func.HttpResponse(
            json.dumps(tasks),
            mimetype="application/json"
        )

    if req.method == "POST":
        body = req.get_json()
        task = {
            "id": next_id[0],
            "title": body.get("title", ""),
            "status": body.get("status", "pending")
        }
        tasks.append(task)
        next_id[0] += 1
        return func.HttpResponse(
            json.dumps(task),
            mimetype="application/json",
            status_code=201
        )

    return func.HttpResponse("Method not allowed", status_code=405)
```

> No `function.json` needed — the `@app.route()` decorator replaces it.

Test locally:

```bash
func start
# In another terminal:
curl http://localhost:7071/api/HttpTasksApi
curl -X POST http://localhost:7071/api/HttpTasksApi \
  -H "Content-Type: application/json" \
  -d '{"title":"Learn Functions","status":"pending"}'
curl http://localhost:7071/api/HttpTasksApi
```

---

### Lab B — Timer Trigger (every 5 minutes)

Add to `function_app.py` (below Lab A code):

```python
import datetime

@app.timer_trigger(schedule="0 */5 * * * *", arg_name="mytimer", run_on_startup=True)
def BatchReportTimer(mytimer: func.TimerRequest) -> None:
    utc_timestamp = datetime.datetime.utcnow().isoformat()

    if mytimer.past_due:
        logging.warning("Timer is past due — previous run was delayed.")

    logging.info(f"[BatchReportTimer] Ran at {utc_timestamp}")
    logging.info("Simulating: querying pending tasks, generating report...")
    # In Day 10 demo: query Azure SQL + write JSON to Blob Storage
```

> `run_on_startup=True` makes the timer fire immediately when running locally — useful for testing without waiting 5 minutes.

Test locally (timer fires immediately on start, then every 5 min):

```bash
func start
# Watch logs for [BatchReportTimer] output
```

---

### Lab C — Blob Trigger (process uploaded file)

Add to `function_app.py` (below Lab B code):

```python
@app.blob_trigger(arg_name="myblob", path="uploads/{name}", connection="AzureWebJobsStorage")
def BlobProcessor(myblob: func.InputStream) -> None:
    content = myblob.read()
    logging.info(f"[BlobProcessor] Processed blob: {myblob.name}")
    logging.info(f"  Size: {myblob.length} bytes")
    logging.info(f"  Preview: {content[:100]}")
```

> No `function.json` needed — the `@app.blob_trigger()` decorator replaces it.

Update `local.settings.json` to point to your real storage account for local testing:

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "<CONNECTION_STRING_FROM_STEP_1>",
    "FUNCTIONS_WORKER_RUNTIME": "python"
  }
}
```

Get the connection string:

```bash
az storage account show-connection-string \
  --name stfuncday3<YOUR_ALIAS> \
  --resource-group rg-learning-day3 \
  --query connectionString \
  --output tsv
```

Create the `uploads` container and upload a test file:

```bash
az storage container create \
  --name uploads \
  --account-name stfuncday3<YOUR_ALIAS>

echo "hello azure" > test.txt
az storage blob upload \
  --container-name uploads \
  --name test.txt \
  --file test.txt \
  --account-name stfuncday3<YOUR_ALIAS>
```

Start functions and watch the Blob trigger fire:

```bash
func start
```

---

### Step 3 — Deploy to Azure

```bash
# Create the Function App in Azure
az functionapp create \
  --name func-tasks-<YOUR_ALIAS> \
  --resource-group rg-learning-day3 \
  --storage-account stfuncday3<YOUR_ALIAS> \
  --runtime python \
  --runtime-version 3.11 \
  --functions-version 4 \
  --consumption-plan-location southeastasia \
  --os-type linux

# Deploy code
func azure functionapp publish func-tasks-<YOUR_ALIAS>
```

Test the deployed HTTP function:

```bash
curl https://func-tasks-<YOUR_ALIAS>.azurewebsites.net/api/HttpTasksApi
```

---

### Step 4 — Enable Application Insights

```bash
# Create App Insights resource
az monitor app-insights component create \
  --app ai-func-day3 \
  --location southeastasia \
  --resource-group rg-learning-day3

# Get instrumentation key
INSTRUMENTATION_KEY=$(az monitor app-insights component show \
  --app ai-func-day3 \
  --resource-group rg-learning-day3 \
  --query instrumentationKey \
  --output tsv)

# Link to Function App
az functionapp config appsettings set \
  --name func-tasks-<YOUR_ALIAS> \
  --resource-group rg-learning-day3 \
  --settings APPINSIGHTS_INSTRUMENTATIONKEY=$INSTRUMENTATION_KEY
```

In Azure Portal → Application Insights → **Live Metrics** → invoke your HTTP function and watch logs stream in real time.

---

### Cleanup (optional)

```bash
az group delete --name rg-learning-day3 --yes --no-wait
```

---

## 4. ✅ Checkpoint

- [ ] `func --version` returns `4.x`
- [ ] HTTP trigger responds locally to GET and POST
- [ ] Timer trigger fires at `0 */5 * * * *` — visible in logs
- [ ] Blob trigger fires when a file is uploaded to `uploads` container
- [ ] Function App deployed to Azure (Consumption plan)
- [ ] Application Insights linked — invocations visible in Portal

---

## 5. Key Takeaways

| Concept | Remember |
|---------|----------|
| Consumption plan | Pay per execution; cold start acceptable for background jobs |
| Premium plan | No cold start; required for VNet integration or sub-second response |
| One trigger per function | A function has exactly one trigger; multiple output bindings are OK |
| CRON format | 6-field: `{sec} {min} {hour} {day} {month} {dow}` |
| Bindings | Avoid boilerplate SDK code — declare I/O in `function.json` |
| Durable Functions | Orchestrate multi-step workflows (fan-out, chaining, approval) |
| `local.settings.json` | **Never commit** to git — add to `.gitignore` |

---

**← [Day 2: App Service](./day2-app-service.md)**  
**→ Day 4: Azure Container Apps** *(coming soon)*
