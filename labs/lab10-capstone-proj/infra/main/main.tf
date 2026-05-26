############################################
# Workload resource group
#
# NOTE: This RG was created manually in task 1.4.1. Before the first
# `terraform apply`, import it into state with:
#
#   terraform import azurerm_resource_group.workload \
#     /subscriptions/<sub-id>/resourceGroups/rg-skillplatform-prod
#
# Find the subscription ID via:  az account show --query id -o tsv
############################################

resource "azurerm_resource_group" "workload" {
  name     = local.naming.rg
  location = var.location
  tags     = local.tags
}

############################################
# Network (VNet, 4 subnets, 3 NSGs + associations) — Day 8 hands-on
############################################

module "network" {
  source = "./modules/network"

  location            = var.location
  resource_group_name = azurerm_resource_group.workload.name
  tags                = local.tags

  naming = {
    vnet     = local.naming.vnet
    snet_app = local.naming.snet_app
    snet_pe  = local.naming.snet_pe
    snet_db  = local.naming.snet_db
    snet_aca = local.naming.snet_aca
    nsg_app  = local.naming.nsg_app
    nsg_pe   = local.naming.nsg_pe
    nsg_db   = local.naming.nsg_db
  }
}

############################################
# Azure Database for PostgreSQL — Flexible Server (VNet-injected)
############################################

module "postgres" {
  source = "./modules/postgres"

  location            = var.location
  resource_group_name = azurerm_resource_group.workload.name
  server_name         = local.naming.psql
  tags                = local.tags

  admin_user     = var.pg_admin_user
  admin_password = var.pg_admin_password

  delegated_subnet_id = module.network.subnet_db_id
  private_dns_zone_id = module.network.private_dns_zone_ids["postgres"]
}

############################################
# Storage Account (private) + submissions/reports containers
############################################

module "storage" {
  source = "./modules/storage"

  location             = var.location
  resource_group_name  = azurerm_resource_group.workload.name
  storage_account_name = local.naming.storage
  tags                 = local.tags

  subnet_pe_id             = module.network.subnet_pe_id
  blob_private_dns_zone_id = module.network.private_dns_zone_ids["blob"]
}

############################################
# Key Vault (RBAC mode, purge-protected, private-only)
#
# NOTE: a vault named `kv-skillplatform-prod` exists in soft-deleted state
# from earlier portal work. `recover_soft_deleted_key_vaults = true` in
# providers.tf causes this apply to recover the soft-deleted vault rather
# than try to create a new one (which would 409 — the name is reserved
# during the 90-day soft-delete window).
############################################

module "key_vault" {
  source = "./modules/key_vault"

  location            = var.location
  resource_group_name = azurerm_resource_group.workload.name
  vault_name          = local.naming.kv
  tags                = local.tags

  subnet_pe_id              = module.network.subnet_pe_id
  vault_private_dns_zone_id = module.network.private_dns_zone_ids["vault"]

  allowed_admin_ips = var.allowed_admin_ips
}

############################################
# Cosmos DB (Serverless, SQL API) — activity + submission events
############################################

module "cosmos" {
  source = "./modules/cosmos"

  location            = var.location
  resource_group_name = azurerm_resource_group.workload.name
  account_name        = local.naming.cosmos
  tags                = local.tags

  subnet_pe_id               = module.network.subnet_pe_id
  cosmos_private_dns_zone_id = module.network.private_dns_zone_ids["cosmos"]
}

############################################
# Azure Container Registry (Premium, private)
#
# NOTE: Premium SKU (~$50/mo) is required for Private Endpoints. This
# pushes total monthly cost above the original $40 budget — adjust the
# subscription budget alert if you want to keep alerts meaningful.
############################################

module "acr" {
  source = "./modules/acr"

  location            = var.location
  resource_group_name = azurerm_resource_group.workload.name
  registry_name       = local.naming.acr
  tags                = local.tags

  subnet_pe_id            = module.network.subnet_pe_id
  acr_private_dns_zone_id = module.network.private_dns_zone_ids["acr"]
}
