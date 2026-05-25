# Day 5 — Databases: Azure SQL & PostgreSQL

> **Goal:** Provision a managed relational database, secure it with firewall + Entra ID auth, connect an app to it, and understand the scaling, backup, and replication options.
> **Time budget:** Theory 2 h · Hands-on 3 h
> **AWS analogy:** Amazon RDS (SQL Server / PostgreSQL / MySQL)

---

## 1. Concepts

### 1.1 The Azure Managed Database Landscape

Azure splits managed relational databases by engine, then by deployment model.

```
Managed Relational Databases
  ├── Azure SQL family            (Microsoft SQL Server engine)
  │     ├── Azure SQL Database        ← single DB or elastic pool, PaaS
  │     ├── Azure SQL Managed Instance ← near-100% SQL Server compatibility
  │     └── SQL Server on Azure VMs    ← IaaS, you manage OS + patching
  │
  ├── Azure Database for PostgreSQL
  │     └── Flexible Server          ← current recommended deployment
  │
  └── Azure Database for MySQL
        └── Flexible Server          ← current recommended deployment
```

| Option | When to use | AWS equivalent |
|--------|-------------|----------------|
| **Azure SQL Database** | New cloud-native apps using SQL Server | RDS for SQL Server (single DB) |
| **Azure SQL Managed Instance** | Lift-and-shift from on-prem SQL Server (needs cross-DB queries, SQL Agent, CLR) | RDS Custom for SQL Server |
| **SQL Server on VM** | Need full OS access (custom installs, kernel tuning) | EC2 with SQL Server AMI |
| **PostgreSQL Flexible Server** | New cloud-native PostgreSQL workloads | RDS for PostgreSQL |
| **MySQL Flexible Server** | New cloud-native MySQL workloads | RDS for MySQL |

> **Default for greenfield:** start with **Azure SQL Database (single DB)** or **PostgreSQL Flexible Server**. Pick managed instance only if you have legacy SQL Server features you can't remove.

---

### 1.2 Azure SQL Database — Single DB vs Elastic Pool

```
Single Database                    Elastic Pool
─────────────────                  ───────────────────────────
  ┌──────────────┐                   ┌──────────────────────────┐
  │  DB  S0      │                   │  Pool (eDTU / vCore)     │
  │  fixed DTU/  │                   │  ┌──────┐ ┌──────┐ ┌────┐│
  │  vCore       │                   │  │ DB-A │ │ DB-B │ │ …  ││
  └──────────────┘                   │  └──────┘ └──────┘ └────┘│
                                     └──────────────────────────┘
  one DB, fixed price                multiple DBs share a budget
```

- **Single DB**: predictable cost, predictable performance. Good for one app.
- **Elastic Pool**: many DBs with **uncorrelated** spikes share a resource budget — cheaper if no two DBs peak at the same time (multi-tenant SaaS).

---

### 1.3 Purchasing Models — DTU vs vCore

| Model | Unit | Pros | Cons |
|-------|------|------|------|
| **DTU** | A blended CPU/memory/IO score | Simple ("just pick S0/S1/S2") | Opaque; can't scale CPU and storage independently |
| **vCore** | CPU cores + memory + storage as separate dials | Maps to on-prem sizing; supports Hyperscale & serverless | More knobs to choose |

**vCore tiers:**

| Tier | When to use |
|------|------------|
| **General Purpose** | Most workloads — balanced compute + Premium SSD storage |
| **Business Critical** | Low-latency OLTP, in-memory OLTP, local NVMe |
| **Hyperscale** | Multi-TB databases, very fast restore, up to 100 TB |
| **Serverless** | Bursty workloads — auto-pauses when idle, scales CPU on demand |

> **Default recommendation:** vCore, General Purpose, **Serverless** for dev/test and bursty workloads. Move to provisioned compute when load becomes steady and predictable.

---

### 1.4 PostgreSQL Flexible Server vs Single Server

**Flexible Server** is the current generation — use it for everything new.

| Feature | Flexible Server |
|---------|-----------------|
| Compute | Burstable (B-series), General Purpose (D-series), Memory Optimized (E-series) |
| HA | Optional **Zone-Redundant HA** (sync replica in another AZ) |
| VNet | Private access (VNet-injected) or public with firewall |
| Maintenance | You pick the maintenance window |
| Read replicas | Up to 5 async read replicas |
| pgBouncer | Built-in connection pooling |

> "Single Server" is the legacy SKU — being retired. Don't pick it for new work.

---

### 1.5 Connection Pooling — Why You Need It

A typical Node.js/Python app opens 1 connection per request. At 500 concurrent requests, that's 500 DB connections — most databases collapse around 100–300. Solution: **pooling**.

| Database | Pooling layer |
|----------|---------------|
| **Azure SQL Database** | Use the SDK's built-in pool (`ConnectionPooling=true` in connection string, default in most drivers) |
| **PostgreSQL Flexible Server** | Enable **built-in pgBouncer** on the server, or run pgBouncer/PgCat as a sidecar |

> Symptom of no pooling: `too many clients already` error spikes during traffic peaks even though CPU is idle.

---

### 1.6 Firewall and Network Access

Three options, in increasing order of security:

```
Public + firewall IPs      ← convenient, allow your office/laptop CIDR
Public + Service Endpoint  ← only specific subnets can reach the public IP
Private access / PE        ← server has only a private IP; no public surface
```

| Setting | Where it applies |
|---------|------------------|
| **Server-level firewall rule** | Applies to all DBs on that logical server |
| **Database-level firewall rule** | Per-DB (SQL Database only); narrower scope |
| **"Allow Azure services"** rule | A toggle that opens to ALL Azure tenants — usually a bad idea, prefer specific rules |

> **Rule:** for dev, public + your IP. For production, **always** private access (Day 8 — Private Endpoint / VNet injection).

---

### 1.7 Authentication

| Method | Use case |
|--------|----------|
| **SQL Authentication** (username/password) | Local accounts, app service connections |
| **Entra ID Authentication** | Humans + apps via tokens, central IAM, MFA, group-based access |
| **Managed Identity** (for apps) | App Service / Functions authenticate to DB **without storing a password** |

> Production goal: app uses a **Managed Identity** assigned a least-privilege Entra ID role on the database. No connection-string passwords anywhere.

---

### 1.8 Backup, Restore, and Replication

| Feature | What it does | Recovery target |
|---------|--------------|-----------------|
| **Point-in-time restore (PITR)** | Restore the DB to any second within the retention window (default 7 days, max 35) | Same region, new DB name |
| **Geo-restore** | Restore from geo-redundant backup to **another region** | Cross-region |
| **Active geo-replication** (SQL DB) | Up to 4 readable secondary DBs in other regions, async | RTO seconds, RPO seconds |
| **Auto-failover groups** | Group of DBs that fail over together with DNS endpoint | DNS endpoint stays the same |
| **Read replicas** (PostgreSQL/MySQL) | Async replicas for read scaling | Read-only |
| **Zone-Redundant HA** (PostgreSQL) | Sync replica in another AZ | Auto failover, no data loss |

> **Min viable DR for production:** geo-redundant backup ON (default) + auto-failover group → recover from a regional outage in minutes.

---

## 2. ✏️ Practice Quiz

**Q1.** Your app uses heavy stored procedures, SQL Agent jobs, and cross-database queries. You're moving from on-prem SQL Server to Azure. Single Azure SQL Database, Managed Instance, or SQL Server on VM?
<details><summary>Answer</summary>
**Azure SQL Managed Instance.** It supports SQL Agent jobs, cross-database queries, CLR, and Service Broker — features that Azure SQL Database (single DB) does not. SQL Server on VM works but you take on OS patching and HA yourself; Managed Instance is the PaaS sweet spot for lift-and-shift.
</details>

**Q2.** A SaaS platform has 200 customer databases. Most are idle, but 10% peak at random times during the day. What pricing structure fits?
<details><summary>Answer</summary>
**Elastic Pool.** Buy a single budget of eDTUs/vCores, every DB shares it, and the spikes (being uncorrelated) average out. Cheaper than 200 single DBs each sized for peak. Set min/max per-DB capacity so no single tenant can starve the others.
</details>

**Q3.** Your Node.js App Service shows `too many clients already` against PostgreSQL during traffic spikes. The DB CPU is at 20%. What do you change?
<details><summary>Answer</summary>
Enable **connection pooling**:
- On PostgreSQL Flexible Server, turn on the built-in **pgBouncer** (`pgbouncer.enabled = true`).
- In the app, point to the pgBouncer port (6432) and lower the per-instance pool size.
The DB itself is fine — you're exhausting `max_connections`, not CPU. App Service scale-out multiplies the problem, so without pooling every new instance adds N more connections.
</details>

**Q4.** Production app stores `DATABASE_URL` in App Service settings, with the password in plaintext. What's the better pattern?
<details><summary>Answer</summary>
**Managed Identity + Entra ID authentication** to the database. No password is stored anywhere — App Service requests a short-lived token from Entra ID and the DB validates it. Failing that, use a **Key Vault reference** in the App Setting so the password is fetched at runtime (Day 7 covers Key Vault references).
</details>

**Q5.** What's the difference between **Point-in-Time Restore** and **Geo-Restore**?
<details><summary>Answer</summary>
- **PITR** — recover the DB to any second within the retention window (7–35 days), in the **same region**. Used for "oops, we deleted a table" style mistakes.
- **Geo-Restore** — restore from a geo-replicated backup snapshot to **another region**. Used when an entire region is down. RPO ≈ 1 hour (last replicated snapshot); RTO depends on DB size.
Use PITR for accidents, Geo-Restore for regional disasters. For tighter RTO/RPO, layer **auto-failover groups** on top.
</details>

---

## 3. 🔬 Hands-on Lab

You'll provision both an **Azure SQL Database (Serverless)** and a **PostgreSQL Flexible Server**, connect to each from your laptop, run a migration, and explore backup/scale settings. Pick whichever maps to your work — both labs are independent.

### Prerequisites

- Azure CLI logged in (`az login`)
- `sqlcmd` for SQL (`brew install sqlcmd`) and/or `psql` for Postgres (`brew install postgresql`)
- Your public IP (we'll need it for firewall): `curl -s https://api.ipify.org`

---

### Step 1 — Create the Resource Group

```bash
az group create --name rg-learning-day5 --location southeastasia

MY_IP=$(curl -s https://api.ipify.org)
echo "Your public IP: $MY_IP"
```

---

### Lab A — Azure SQL Database (Serverless)

#### A.1 Create the logical server and DB

```bash
SQL_SERVER="sql-learning-<YOUR_ALIAS>"   # globally unique
SQL_ADMIN="sqladmin"
SQL_PASSWORD="$(openssl rand -base64 24)Aa1!"  # meets complexity rules
echo "SAVE THIS PASSWORD: $SQL_PASSWORD"

az sql server create \
  --name "$SQL_SERVER" \
  --resource-group rg-learning-day5 \
  --location southeastasia \
  --admin-user "$SQL_ADMIN" \
  --admin-password "$SQL_PASSWORD"

# Serverless tier — pauses after 60 min of inactivity, scales 0.5–2 vCores
az sql db create \
  --name TasksDb \
  --resource-group rg-learning-day5 \
  --server "$SQL_SERVER" \
  --edition GeneralPurpose \
  --family Gen5 \
  --compute-model Serverless \
  --min-capacity 0.5 \
  --capacity 2 \
  --auto-pause-delay 60 \
  --backup-storage-redundancy Local
```

#### A.2 Open the firewall for your IP

```bash
az sql server firewall-rule create \
  --resource-group rg-learning-day5 \
  --server "$SQL_SERVER" \
  --name AllowMyIp \
  --start-ip-address "$MY_IP" \
  --end-ip-address "$MY_IP"
```

> **Don't** use `0.0.0.0–0.0.0.0` — that's the "Allow all Azure services" trick which exposes the DB to every Azure tenant globally.

#### A.3 Connect and create a table

```bash
sqlcmd -S "${SQL_SERVER}.database.windows.net" \
  -d TasksDb \
  -U "$SQL_ADMIN" \
  -P "$SQL_PASSWORD" \
  -Q "CREATE TABLE tasks (id INT IDENTITY PRIMARY KEY, title NVARCHAR(200), status NVARCHAR(50), created_at DATETIME2 DEFAULT GETUTCDATE());"

sqlcmd -S "${SQL_SERVER}.database.windows.net" \
  -d TasksDb \
  -U "$SQL_ADMIN" \
  -P "$SQL_PASSWORD" \
  -Q "INSERT INTO tasks (title, status) VALUES ('Learn Azure SQL', 'pending'); SELECT * FROM tasks;"
```

#### A.4 Get connection strings for your app

```bash
# ADO.NET / .NET
az sql db show-connection-string \
  --name TasksDb \
  --server "$SQL_SERVER" \
  --client ado.net

# Node.js (mssql driver)
az sql db show-connection-string \
  --name TasksDb \
  --server "$SQL_SERVER" \
  --client jdbc
```

#### A.5 Try Entra ID authentication (optional but recommended)

```bash
# Set yourself as the Entra ID admin on the server
MY_UPN=$(az account show --query user.name -o tsv)
MY_OID=$(az ad signed-in-user show --query id -o tsv)

az sql server ad-admin create \
  --resource-group rg-learning-day5 \
  --server "$SQL_SERVER" \
  --display-name "$MY_UPN" \
  --object-id "$MY_OID"

# Connect with Entra ID — no password
sqlcmd -S "${SQL_SERVER}.database.windows.net" \
  -d TasksDb \
  -G   # interactive Entra ID auth
```

---

### Lab B — PostgreSQL Flexible Server

#### B.1 Create the server (public, with firewall)

```bash
PG_SERVER="pg-learning-<YOUR_ALIAS>"   # globally unique
PG_ADMIN="pgadmin"
PG_PASSWORD="$(openssl rand -base64 24)Aa1!"
echo "SAVE THIS PASSWORD: $PG_PASSWORD"

az postgres flexible-server create \
  --name "$PG_SERVER" \
  --resource-group rg-learning-day5 \
  --location southeastasia \
  --admin-user "$PG_ADMIN" \
  --admin-password "$PG_PASSWORD" \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32 \
  --version 16 \
  --public-access "$MY_IP" \
  --yes
```

> `--public-access "$MY_IP"` whitelists only your IP. Use `--public-access None` and set up Private Endpoint (Day 8) for production.

#### B.2 Enable built-in pgBouncer (connection pooling)

```bash
az postgres flexible-server parameter set \
  --resource-group rg-learning-day5 \
  --server-name "$PG_SERVER" \
  --name pgbouncer.enabled \
  --value true

# Default pool mode is "transaction" — best for most app frameworks
az postgres flexible-server parameter set \
  --resource-group rg-learning-day5 \
  --server-name "$PG_SERVER" \
  --name pgbouncer.pool_mode \
  --value transaction

# pgBouncer listens on port 6432 (regular Postgres on 5432)
```

#### B.3 Create a DB and connect

```bash
az postgres flexible-server db create \
  --resource-group rg-learning-day5 \
  --server-name "$PG_SERVER" \
  --database-name tasksdb

PGPASSWORD="$PG_PASSWORD" psql \
  "host=${PG_SERVER}.postgres.database.azure.com port=5432 dbname=tasksdb user=${PG_ADMIN} sslmode=require" \
  -c "CREATE TABLE tasks (id SERIAL PRIMARY KEY, title TEXT, status TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
      INSERT INTO tasks (title, status) VALUES ('Learn Postgres', 'pending');
      SELECT * FROM tasks;"
```

Now try the **pooled** port:

```bash
PGPASSWORD="$PG_PASSWORD" psql \
  "host=${PG_SERVER}.postgres.database.azure.com port=6432 dbname=tasksdb user=${PG_ADMIN} sslmode=require" \
  -c "SELECT 1;"
```

> In your app's connection string, point to **6432** in production. Lower `pool_size` per-instance since pgBouncer handles the upstream pool to Postgres.

#### B.4 Scale up (vertical) and add a read replica

```bash
# Scale the compute tier (downtime: a few seconds while the VM is replaced)
az postgres flexible-server update \
  --resource-group rg-learning-day5 \
  --name "$PG_SERVER" \
  --sku-name Standard_D2s_v3 \
  --tier GeneralPurpose

# Add a read replica in another region for read scaling / DR
az postgres flexible-server replica create \
  --replica-name "${PG_SERVER}-replica" \
  --resource-group rg-learning-day5 \
  --source-server "$PG_SERVER" \
  --location eastasia
```

---

### Step 4 — Explore Backups (both engines)

```bash
# SQL Database — list restorable point-in-time database
az sql db show \
  --name TasksDb \
  --resource-group rg-learning-day5 \
  --server "$SQL_SERVER" \
  --query "{earliestRestoreDate:earliestRestoreDate, retention:currentBackupStorageRedundancy}"

# Restore PITR to a new DB (don't overwrite the source)
az sql db restore \
  --dest-name TasksDb_Restored \
  --name TasksDb \
  --resource-group rg-learning-day5 \
  --server "$SQL_SERVER" \
  --time "$(date -u -v-5M +%Y-%m-%dT%H:%M:%S)"   # 5 minutes ago

# PostgreSQL — same idea
az postgres flexible-server restore \
  --resource-group rg-learning-day5 \
  --name "${PG_SERVER}-restored" \
  --source-server "$PG_SERVER" \
  --restore-time "$(date -u -v-5M +%Y-%m-%dT%H:%M:%SZ)"
```

---

### Cleanup

```bash
az group delete --name rg-learning-day5 --yes --no-wait
```

---

## 4. ✅ Checkpoint

- [ ] `TasksDb` exists on `${SQL_SERVER}` in Serverless (auto-pause 60 min)
- [ ] Firewall rule allows only your laptop IP (no `0.0.0.0–0.0.0.0`)
- [ ] `sqlcmd` connects and `SELECT * FROM tasks` returns the seed row
- [ ] Entra ID admin set on the SQL server; `-G` interactive login works
- [ ] PostgreSQL Flexible Server reachable on both 5432 (direct) and 6432 (pgBouncer)
- [ ] `pgbouncer.enabled = true` confirmed via parameter list
- [ ] PITR restore created a new database without affecting the source

---

## 5. Key Takeaways

| Concept | Remember |
|---------|----------|
| Default greenfield pick | Azure SQL Database (Serverless) or PostgreSQL Flexible Server |
| DTU vs vCore | Use **vCore** — clearer, supports Serverless and Hyperscale |
| Elastic Pool | Multi-tenant SaaS with uncorrelated peaks; not for a single hot DB |
| Connection pooling | App-side pool for SQL; **pgBouncer** built-in for Postgres |
| Firewall | One rule per known IP; never use "Allow all Azure services" in production |
| Auth in production | **Managed Identity + Entra ID** — no passwords in app config |
| PITR vs Geo-Restore | Same region within retention vs cross-region from geo-backup |
| Auto-failover groups | Wrap DBs for region-failover with a stable DNS endpoint |

---

**← [Day 4: Azure Container Apps](./day4-container-apps.md)**
**→ [Day 6: API Management](../week2/day6-api-management.md)**
