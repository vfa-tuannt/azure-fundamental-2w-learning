# Day 1 — Azure Fundamentals

> **Goal:** Navigate the Azure Portal and understand core organizational concepts.  
> **Time budget:** Theory 2–3 h · Hands-on 2 h

---

## 1. Concepts

### 1.1 The Azure Hierarchy

Understanding how Azure organizes resources is the first thing you need.

```
Management Group          ← optional, for enterprise-wide policy
  └── Subscription        ← billing boundary + access boundary
        └── Resource Group ← logical container for related resources
              └── Resource  ← actual service (VM, DB, Function, …)
```

| Term | What it is | AWS analogy |
|------|-----------|-------------|
| **Subscription** | A billing account with its own limits and RBAC scope | AWS Account |
| **Resource Group** | A folder that holds related Azure resources; deleted as a unit | (no direct match; loosely: CloudFormation Stack) |
| **Region** | Physical data center cluster (e.g., `southeastasia` = Singapore) | AWS Region |
| **Management Group** | Groups subscriptions for policy inheritance | AWS Organizations OU |

> **Key rule:** Every resource must belong to exactly one Resource Group and one Region.

---

### 1.2 Azure Resource Manager (ARM)

ARM is the control plane for every Azure operation — Portal, CLI, SDKs and Terraform all go through it.

```
You (CLI / Portal / SDK)
        │
        ▼
  Azure Resource Manager (ARM)
        │  authenticates via Azure Entra ID
        ▼
  Resource Provider
  (Microsoft.Web, Microsoft.Sql, Microsoft.Storage …)
        │
        ▼
  Actual Resource
```

- **ARM Templates** = JSON/Bicep files that declare desired state → equivalent of AWS CloudFormation.
- **Idempotent** — running the same template twice produces the same result.

---

### 1.3 Azure Entra ID (formerly Azure Active Directory)

| Concept | Explanation | AWS analogy |
|---------|-------------|-------------|
| **Tenant** | An Entra ID directory; auto-created with a subscription | AWS Account root |
| **User** | A person with a login | IAM User |
| **Service Principal** | An app identity used by code / CI-CD | IAM Role assumed by a service |
| **Managed Identity** | Service principal auto-managed by Azure (no password rotation needed) | IAM Role attached to EC2/Lambda |
| **Group** | Collection of users or service principals | IAM Group |

---

### 1.4 RBAC (Role-Based Access Control)

Azure RBAC controls **who** can do **what** on **which scope**.

```
Principal (User / Group / Service Principal)
    │  assigned a
    ▼
Role Definition (set of allowed actions)
    │  scoped to
    ▼
Scope (Management Group → Subscription → Resource Group → Resource)
```

**Built-in roles you must know:**

| Role | What it can do |
|------|---------------|
| **Owner** | Full access + can assign roles to others |
| **Contributor** | Full access to resources, cannot assign roles |
| **Reader** | View everything, change nothing |
| **User Access Administrator** | Manage role assignments only |

> **Best practice:** Assign roles at the Resource Group level, not the Subscription level, to limit blast radius — same principle as AWS least-privilege IAM.

---

### 1.5 Azure CLI Essentials

The Azure CLI follows a consistent pattern:

```
az <service> <noun> <verb> [--parameters]
```

| Command | Purpose |
|---------|---------|
| `az login` | Authenticate interactively |
| `az account list` | List subscriptions your account has access to |
| `az account set --subscription <id>` | Switch active subscription |
| `az group create` | Create a resource group |
| `az resource list` | List resources in a group |
| `az --version` | Confirm CLI is installed |

---

## 2. ✏️ Practice Quiz

Answer these before the hands-on lab to confirm your understanding.

**Q1.** You accidentally delete a Resource Group. What else gets deleted?  
<details><summary>Answer</summary>
All resources inside that Resource Group are permanently deleted. This is why naming and grouping resources logically matters — and why you should apply locks (`az lock create`) on production resource groups.
</details>

**Q2.** Your app running in an Azure VM needs to read from Blob Storage. Which identity type should you use — a Service Principal with a stored secret, or a Managed Identity? Why?  
<details><summary>Answer</summary>
Managed Identity. Azure rotates credentials automatically; your code never stores a password or client secret. This is the Azure equivalent of an IAM Role attached to an EC2 instance.
</details>

**Q3.** A junior developer needs to deploy new versions of an App Service but must NOT be able to delete it or change access policies. Which built-in RBAC role fits?  
<details><summary>Answer</summary>
**Contributor** — they get full operational access but cannot manage role assignments or delete the resource group itself (unless they have delete permissions on the specific resource). For even tighter control, create a custom role.
</details>

**Q4.** You have a `dev` subscription and a `production` subscription. You want a security policy that enforces tag requirements on both. Where do you apply it?  
<details><summary>Answer</summary>
A **Management Group** that contains both subscriptions. Assign an Azure Policy at that level and it inherits down to both subscriptions.
</details>

**Q5.** What is the difference between a **Region** and an **Availability Zone**?  
<details><summary>Answer</summary>
A Region is a geographic area (e.g., Southeast Asia). An Availability Zone is an isolated physical data center *within* a region — typically 3 per region. Distributing resources across AZs protects against single-datacenter failure.
</details>

---

## 3. 🔬 Hands-on Lab

### Prerequisites
- Azure CLI installed: `brew install azure-cli` (macOS)
- A free Azure account at https://azure.microsoft.com/free/

### Step 1 — Authenticate

```bash
az login
# A browser window opens; log in with your Azure account
```

Verify you are in the right subscription:

```bash
az account list --output table
az account set --subscription "<YOUR_SUBSCRIPTION_ID>"
az account show --query "{name:name, id:id, state:state}"
```

---

### Step 2 — Create a Resource Group

```bash
az group create \
  --name rg-learning-day1 \
  --location southeastasia

# Verify
az group show --name rg-learning-day1 --output table
```

> **Why `southeastasia`?** It maps to Singapore — lowest latency for Southeast Asia-based teams.

---

### Step 3 — Explore RBAC on the Resource Group

```bash
# List your own role assignments on the resource group
az role assignment list \
  --resource-group rg-learning-day1 \
  --output table

# List all built-in roles
az role definition list --output table | head -30
```

---

### Step 4 — Deploy a Minimal ARM Template

Create a file `simple-storage.json`:

```json
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "storageAccountName": {
      "type": "string",
      "defaultValue": "[concat('stlearn', uniqueString(resourceGroup().id))]"
    }
  },
  "resources": [
    {
      "type": "Microsoft.Storage/storageAccounts",
      "apiVersion": "2023-01-01",
      "name": "[parameters('storageAccountName')]",
      "location": "[resourceGroup().location]",
      "sku": { "name": "Standard_LRS" },
      "kind": "StorageV2"
    }
  ]
}
```

Deploy it:

```bash
az deployment group create \
  --resource-group rg-learning-day1 \
  --template-file simple-storage.json \
  --verbose
```

List what was created:

```bash
az resource list \
  --resource-group rg-learning-day1 \
  --output table
```

---

### Step 5 — Explore Azure Portal (GUI)

1. Open https://portal.azure.com  
2. Navigate **Resource Groups → rg-learning-day1**  
3. Click on the Storage Account → observe **Access Control (IAM)** tab  
4. Go to **Azure Active Directory → Users** → find your own account  

---

### Cleanup (optional — keep for Day 7 Blob Storage lab)

```bash
# Only run this if you want to delete everything
az group delete --name rg-learning-day1 --yes --no-wait
```

---

## 4. ✅ Checkpoint

Mark yourself done when you can answer **yes** to all:

- [ ] `az login` and `az account show` work without errors
- [ ] Resource Group `rg-learning-day1` exists in `southeastasia`
- [ ] ARM template deployed successfully (Storage Account created)
- [ ] You can explain the difference between a Subscription and a Resource Group
- [ ] You know which RBAC role to assign a developer who should deploy but not delete

---

## 5. Key Takeaways

| Concept | Remember |
|---------|----------|
| Resource Group | Logical container; deleting it deletes everything inside |
| ARM | Every operation goes through ARM — Portal, CLI, Terraform all the same |
| Managed Identity | Preferred over Service Principal + secret for app-to-Azure auth |
| RBAC scope | Apply at Resource Group level; inherit from Subscription / Management Group |
| Region `southeastasia` | Singapore — use for all labs |

---

**Next → [Day 2: App Service — Web Hosting](./day2-app-service.md)**
