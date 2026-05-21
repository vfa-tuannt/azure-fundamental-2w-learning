# Day 8 — Virtual Network (VNet)

> **Goal:** Build an isolated network in Azure, lock down inbound/outbound traffic with NSGs, expose an App Service privately via a Private Endpoint, and give the App Service VNet integration for outbound calls into the VNet.
> **Time budget:** Theory 2 h · Hands-on 3 h
> **AWS analogy:** VPC + Subnets + Security Groups + VPC Endpoints

---

## 1. Concepts

### 1.1 The VNet Hierarchy

```
Virtual Network (VNet)           ← private IP space, e.g. 10.0.0.0/16
  ├── Subnet "frontend"          10.0.1.0/24   ← public-facing tier
  ├── Subnet "app"               10.0.2.0/24   ← VNet-integrated App Service
  ├── Subnet "data"              10.0.3.0/24   ← Private Endpoints to DB, Storage
  └── Subnet "gateway"           10.0.255.0/27 ← reserved for VPN/ExpressRoute
```

| Term | What it is | AWS analogy |
|------|-----------|-------------|
| **VNet** | Private IP space scoped to a region | VPC |
| **Subnet** | Range carved out of the VNet, sits in **one** AZ-set | Subnet |
| **NSG** | Stateful firewall attached to a subnet or NIC | Security Group + a bit of NACL |
| **Private Endpoint** | NIC inside your VNet that maps to a PaaS service | Interface VPC Endpoint (PrivateLink) |
| **Service Endpoint** | Older feature — adds the PaaS as an allowed source on the subnet | Gateway VPC Endpoint |
| **VNet Peering** | Link two VNets so they route privately | VPC Peering |
| **Private DNS Zone** | Resolves PaaS DNS names to private IPs | Route 53 Private Hosted Zone |

> **Address space is not just a number — pick CIDRs that don't overlap with on-prem, peered VNets, or future expansion.** Once chosen, you can extend a VNet but not shrink it without rebuilding.

---

### 1.2 Subnets — Reserved IPs

Azure reserves **5 IPs per subnet** (vs AWS's 5 with different semantics):

```
10.0.1.0   – network address (reserved)
10.0.1.1   – default gateway
10.0.1.2   – DNS
10.0.1.3   – DNS
10.0.1.255 – broadcast (reserved)
```

A `/29` (8 addresses) gives you only 3 usable — too small. Practical minimum is `/27` (32 addresses) for most subnets. **Some Azure services demand their own subnet** (App Service VNet integration, AKS node pool, Bastion, Gateway, Container Apps environment) — plan accordingly.

---

### 1.3 NSG (Network Security Group)

A stateful Layer-4 firewall. Two rule sets: **inbound** and **outbound**. Each rule has:

| Field | Example |
|-------|---------|
| Priority | 100 (1 = highest, 4096 = lowest; lower wins) |
| Source | IP/CIDR, Service Tag (e.g. `Internet`, `AzureCloud`, `AppService`), ASG |
| Destination | same |
| Port | 443, `*`, range |
| Protocol | TCP / UDP / `*` |
| Action | Allow / Deny |

**Default rules (cannot delete, only override with higher-priority rules):**

```
AllowVNetInBound          ← all traffic from same VNet
AllowAzureLoadBalancerInBound
DenyAllInBound            ← drop everything else inbound
AllowVNetOutBound
AllowInternetOutBound     ← outbound to internet is allowed by default
DenyAllOutBound
```

> **Most common mistake:** NSG attached to NIC AND subnet with conflicting rules. Pick one — subnet-level is recommended.

**Service Tags** save you from listing IP ranges. `AzureMonitor`, `Storage.SoutheastAsia`, `Sql.SoutheastAsia` resolve to Microsoft-maintained IP sets that auto-update.

---

### 1.4 Private Endpoint vs Service Endpoint vs VNet Integration

These are the three ways App Service / Function App / SQL / Storage talk to a VNet. They are **not** interchangeable.

| Feature | Direction | Use case |
|---------|-----------|----------|
| **Private Endpoint** | **Inbound** to a PaaS service | "Make my Storage Account reachable only from my VNet, with a private IP." |
| **Service Endpoint** | Outbound from subnet → PaaS firewall allow | "Only allow Storage requests from this subnet." (Public IP still resolved.) |
| **VNet Integration** | **Outbound** from App Service / Functions → VNet | "Let my App Service call into a private DB or Private Endpoint." |

**Picture:**

```
                          ┌──────────────────────────┐
                          │  App Service (Standard+) │
                          │   public hostname        │
                          └─────────────┬────────────┘
                                        │
                          VNet Integration (outbound only)
                                        ▼
   ┌───────────────────────── VNet 10.0.0.0/16 ─────────────────────────┐
   │                                                                   │
   │  Subnet "app"  10.0.2.0/24                                        │
   │                                                                   │
   │  Subnet "data" 10.0.3.0/24                                        │
   │     └─ Private Endpoint (NIC) ──► [ Azure SQL / Storage / etc. ]  │
   │                                                                   │
   └───────────────────────────────────────────────────────────────────┘
```

To **block** the PaaS's public IP after adding a Private Endpoint, you must explicitly disable public network access on the resource (e.g. `az storage account update --public-network-access Disabled`). Adding a Private Endpoint does **not** automatically close the public door.

---

### 1.5 Private DNS Zones

A Private Endpoint gives you a private IP — but your code still uses `mystorage.blob.core.windows.net`. By default that resolves to the public IP.

The fix: a **Private DNS Zone** (`privatelink.blob.core.windows.net`) linked to your VNet. The Private Endpoint creates an A record in that zone; clients in the VNet resolve the FQDN to the private IP automatically.

```
mystorage.blob.core.windows.net
        ↓ CNAME
mystorage.privatelink.blob.core.windows.net
        ↓ A (in Private DNS Zone linked to VNet)
10.0.3.4   ← private IP of the Private Endpoint NIC
```

> Forgetting the Private DNS Zone is the #1 reason "Private Endpoint doesn't work." DNS still returns the public IP and traffic leaves the VNet.

---

### 1.6 VNet Peering

Two VNets in the same or different regions can be linked. Once peered, traffic stays on the Microsoft backbone — no public internet, no encryption overhead, sub-ms latency in-region.

```
VNet A 10.0.0.0/16  <──── peering ────►  VNet B 10.1.0.0/16
```

- **Non-transitive.** A peered with B, B peered with C ⇒ A cannot talk to C. Use a hub-and-spoke topology with a firewall in the hub if you need transit.
- **No overlapping CIDRs.** Plan address space up front.

---

### 1.7 VPN Gateway / ExpressRoute (just enough to recognize)

- **Site-to-Site VPN**: IPsec tunnel from on-prem firewall → Azure VPN Gateway. Internet path, encrypted.
- **ExpressRoute**: dedicated private circuit through a partner (Megaport, Equinix, etc.). No internet, predictable latency. Pricey.
- **Point-to-Site VPN**: developer laptop → VNet. Used for dev access.

You don't need to deploy these in this lab — just recognize the names.

---

## 2. ✏️ Practice Quiz

**Q1.** You created a Private Endpoint for an Azure SQL Database and disabled public access. Your App Service still can't connect — it gets `Server not found`. What's wrong?
<details><summary>Answer</summary>
The App Service is resolving `<server>.database.windows.net` through public DNS (returns the public IP, which is now blocked). You need:
1. A **Private DNS Zone** `privatelink.database.windows.net` with the A record from the Private Endpoint, **linked to the VNet**.
2. The App Service needs **VNet Integration** into a subnet of that VNet so its DNS queries go through Azure DNS for the VNet.
Without both, the FQDN resolves publicly and traffic fails.
</details>

**Q2.** Your NSG allows inbound 443 from `Internet`. You also created a deny rule for `203.0.113.0/24` at priority 200. The allow rule is at priority 100. Does the deny rule work?
<details><summary>Answer</summary>
**No.** Priority 100 wins — allow runs first and the deny rule never evaluates. Lower priority number = higher precedence. Move the deny rule to priority 90 (or any number lower than 100) so it evaluates first. NSG rules are processed in priority order, first match wins.
</details>

**Q3.** Two VNets, `vnet-a (10.0.0.0/16)` peered to `vnet-b (10.0.0.0/16)`. Why is peering failing?
<details><summary>Answer</summary>
**Overlapping CIDR.** Peered VNets cannot have overlapping address spaces because Azure can't route an IP that exists in both. Pick non-overlapping ranges (e.g. `10.0.0.0/16` and `10.1.0.0/16`) before peering — a mistake here means destroying and recreating one of the VNets.
</details>

**Q4.** Your App Service is on Standard tier and you enable **VNet Integration**. Can other resources in the VNet now reach the App Service on its private IP?
<details><summary>Answer</summary>
**No.** VNet Integration is **outbound only** — App Service makes calls *into* the VNet. To make the App Service reachable on a private IP, you also need a **Private Endpoint** on the App Service (Premium tier, or any tier with the newer PE support). VNet Integration ≠ Private Endpoint — they're opposite directions.
</details>

**Q5.** What's the minimum subnet size for App Service VNet Integration?
<details><summary>Answer</summary>
**/28** (16 addresses). Azure recommends **/26** (64) in production so the platform has room to scale instances during deployments. The subnet must be **dedicated** to the App Service Plan — no other resources can share it, and you can't change the size later without re-doing the integration.
</details>

---

## 3. 🔬 Hands-on Lab

You'll build a small VNet, lock it down with NSGs, attach a Private Endpoint to a Storage Account, wire up Private DNS, and connect an App Service via VNet Integration so it can reach the Storage Account privately.

### Prerequisites
- Resource Group: we'll create `rg-learning-day8`.
- Azure CLI logged in (`az login`).
- You'll need an **App Service Plan on Standard (S1) or higher** for VNet Integration. The Day 2 plan works if you kept it.

> Cost note: VNet itself is free. Private Endpoints cost ~$0.01/hour each. Standard App Service Plan ~$0.10/hour. Tear down the resource group when you're done with the lab to avoid lingering charges.

---

### Step 1 — Create VNet and Subnets

```bash
az group create --name rg-learning-day8 --location southeastasia

# 1. VNet with a /16 address space and an initial "app" subnet
az network vnet create \
  --name vnet-learning-day8 \
  --resource-group rg-learning-day8 \
  --location southeastasia \
  --address-prefixes 10.10.0.0/16 \
  --subnet-name snet-app \
  --subnet-prefixes 10.10.1.0/24

# 2. Dedicated subnet for App Service VNet Integration
#    (delegated to Microsoft.Web/serverFarms — can't host anything else)
az network vnet subnet create \
  --name snet-appsvc-integration \
  --vnet-name vnet-learning-day8 \
  --resource-group rg-learning-day8 \
  --address-prefixes 10.10.2.0/26 \
  --delegations Microsoft.Web/serverFarms

# 3. Subnet for Private Endpoints (must disable PE network policies)
az network vnet subnet create \
  --name snet-private-endpoints \
  --vnet-name vnet-learning-day8 \
  --resource-group rg-learning-day8 \
  --address-prefixes 10.10.3.0/27 \
  --disable-private-endpoint-network-policies true
```

Verify:

```bash
az network vnet subnet list \
  --vnet-name vnet-learning-day8 \
  --resource-group rg-learning-day8 \
  --output table
```

---

### Step 2 — Create an NSG and Attach to the App Subnet

```bash
# NSG with default deny-all-inbound; we add a single allow for HTTPS from internet
az network nsg create \
  --name nsg-app \
  --resource-group rg-learning-day8 \
  --location southeastasia

az network nsg rule create \
  --nsg-name nsg-app \
  --resource-group rg-learning-day8 \
  --name AllowHttpsInbound \
  --priority 100 \
  --direction Inbound \
  --access Allow \
  --protocol Tcp \
  --source-address-prefixes Internet \
  --source-port-ranges '*' \
  --destination-address-prefixes '*' \
  --destination-port-ranges 443

# Block SSH from anywhere (illustrative — higher-priority deny)
az network nsg rule create \
  --nsg-name nsg-app \
  --resource-group rg-learning-day8 \
  --name DenySshFromInternet \
  --priority 90 \
  --direction Inbound \
  --access Deny \
  --protocol Tcp \
  --source-address-prefixes Internet \
  --source-port-ranges '*' \
  --destination-address-prefixes '*' \
  --destination-port-ranges 22

# Attach NSG to snet-app
az network vnet subnet update \
  --name snet-app \
  --vnet-name vnet-learning-day8 \
  --resource-group rg-learning-day8 \
  --network-security-group nsg-app
```

Inspect effective rules:

```bash
az network nsg rule list \
  --nsg-name nsg-app \
  --resource-group rg-learning-day8 \
  --output table
```

---

### Step 3 — Create a Storage Account and Lock Down Public Access

```bash
STORAGE="stday8<YOUR_ALIAS>"   # globally unique, 3–24 lowercase letters/digits

az storage account create \
  --name "$STORAGE" \
  --resource-group rg-learning-day8 \
  --location southeastasia \
  --sku Standard_LRS \
  --kind StorageV2 \
  --public-network-access Disabled
```

Try to list blobs from your laptop — it should fail because public access is disabled:

```bash
az storage container list --account-name "$STORAGE" --auth-mode login
# Expect: AuthorizationFailure / NetworkAccessDenied
```

Good — the Storage Account is now unreachable from the public internet.

---

### Step 4 — Add a Private Endpoint for the Storage Account (blob)

```bash
STORAGE_ID=$(az storage account show \
  --name "$STORAGE" \
  --resource-group rg-learning-day8 \
  --query id -o tsv)

az network private-endpoint create \
  --name pe-storage-blob \
  --resource-group rg-learning-day8 \
  --vnet-name vnet-learning-day8 \
  --subnet snet-private-endpoints \
  --private-connection-resource-id "$STORAGE_ID" \
  --group-id blob \
  --connection-name conn-storage-blob
```

This creates a NIC inside `snet-private-endpoints` with a private IP. But DNS still resolves the public name — fix that next.

---

### Step 5 — Wire Up Private DNS

```bash
# 1. Create the Private DNS Zone for blob endpoints
az network private-dns zone create \
  --resource-group rg-learning-day8 \
  --name "privatelink.blob.core.windows.net"

# 2. Link the zone to the VNet (so VMs/Apps inside the VNet resolve via it)
az network private-dns link vnet create \
  --resource-group rg-learning-day8 \
  --zone-name "privatelink.blob.core.windows.net" \
  --name link-vnet-day8 \
  --virtual-network vnet-learning-day8 \
  --registration-enabled false

# 3. Create the DNS A record group that auto-populates from the Private Endpoint
az network private-endpoint dns-zone-group create \
  --resource-group rg-learning-day8 \
  --endpoint-name pe-storage-blob \
  --name dns-zg \
  --private-dns-zone "privatelink.blob.core.windows.net" \
  --zone-name privatelink.blob.core.windows.net
```

Verify the A record was created:

```bash
az network private-dns record-set a list \
  --resource-group rg-learning-day8 \
  --zone-name "privatelink.blob.core.windows.net" \
  --output table
# Expect: an A record matching your storage account name
```

---

### Step 6 — Connect App Service via VNet Integration

If you already have an App Service Plan + Web App from Day 2 in another RG, reuse them. Otherwise create a minimal one here:

```bash
PLAN="plan-day8"
APP="app-day8-<YOUR_ALIAS>"

az appservice plan create \
  --name "$PLAN" \
  --resource-group rg-learning-day8 \
  --sku S1 \
  --location southeastasia

az webapp create \
  --name "$APP" \
  --resource-group rg-learning-day8 \
  --plan "$PLAN" \
  --runtime "NODE|18-lts"

# Enable VNet Integration on the dedicated, delegated subnet
az webapp vnet-integration add \
  --name "$APP" \
  --resource-group rg-learning-day8 \
  --vnet vnet-learning-day8 \
  --subnet snet-appsvc-integration

# Force outbound calls (including DNS) through the VNet so the Private DNS Zone is honoured
az webapp config appsettings set \
  --name "$APP" \
  --resource-group rg-learning-day8 \
  --settings WEBSITE_VNET_ROUTE_ALL=1 WEBSITE_DNS_SERVER=168.63.129.16
```

> `168.63.129.16` is Azure's built-in DNS resolver — required so the App Service uses the VNet-linked Private DNS Zone.

---

### Step 7 — Prove the Private Path Works

From your laptop (still on public internet) — should **fail**:

```bash
nslookup "${STORAGE}.blob.core.windows.net"
# Resolves to a public IP — but the storage refuses traffic
curl -I "https://${STORAGE}.blob.core.windows.net/"
# Expect: connection refused / 403 (public network disabled)
```

From the App Service — should resolve to a **10.10.3.x** address. Open Portal → App Service → **Development Tools → SSH** (or `Console`):

```bash
nslookup ${STORAGE}.blob.core.windows.net
# Expect: name = ${STORAGE}.privatelink.blob.core.windows.net
# Address: 10.10.3.x   ← private IP inside the VNet
```

You can also use the **Network troubleshooter** in the Portal → "Test connectivity to a private endpoint".

---

### Cleanup

```bash
az group delete --name rg-learning-day8 --yes --no-wait
```

This removes the VNet, NSG, Storage Account, Private Endpoint, Private DNS Zone, and App Service together.

---

## 4. ✅ Checkpoint

- [ ] `vnet-learning-day8` exists with 3 subnets (`snet-app`, `snet-appsvc-integration` delegated to `Microsoft.Web/serverFarms`, `snet-private-endpoints`)
- [ ] NSG `nsg-app` attached to `snet-app`; `AllowHttpsInbound` priority 100, `DenySshFromInternet` priority 90
- [ ] Storage Account has `publicNetworkAccess=Disabled` and is **unreachable** from your laptop
- [ ] Private Endpoint `pe-storage-blob` created in `snet-private-endpoints`
- [ ] Private DNS Zone `privatelink.blob.core.windows.net` linked to the VNet with an A record
- [ ] App Service `app-day8-…` has VNet Integration on `snet-appsvc-integration`
- [ ] From the App Service's SSH, `nslookup` resolves the storage FQDN to a `10.10.3.x` private IP

---

## 5. Key Takeaways

| Concept | Remember |
|---------|----------|
| Subnet sizing | 5 IPs reserved per subnet; App Service VNet Integration subnet must be **delegated** and ideally `/26` |
| NSG priority | Lower number wins; first match short-circuits — order matters more than count |
| Service Tags | Use `Internet`, `AzureCloud`, `Storage.<region>` instead of hard-coded IP ranges |
| Private Endpoint vs VNet Integration | Inbound (PE) vs outbound (VI) — they solve opposite problems and are often used together |
| Private DNS Zone | Required for Private Endpoint to actually be used — without it, DNS still returns the public IP |
| Disable public access | Adding a Private Endpoint does **not** close the public door — do it explicitly (`--public-network-access Disabled`) |
| `WEBSITE_VNET_ROUTE_ALL=1` | Route **all** App Service outbound through the VNet, including DNS (otherwise PE DNS is ignored) |
| Peering | Non-transitive, no overlapping CIDRs — plan IP space before you create anything |

---

**← [Day 7: Blob Storage + Key Vault](./day7-blob-keyvault.md)**
**→ [Day 9: CI/CD + Monitoring](./day9-cicd-monitoring.md)**
