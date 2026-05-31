############################################
# IAM / RBAC role assignments
#
# This file holds every `azurerm_role_assignment` in the stack so the
# permissions surface is auditable in one place. Naming convention:
#   <principal>_<resource>_<role-short>
############################################

# Whoever is running `terraform apply` (a human via `az login` OR the
# OIDC-federated CI/CD service principal). Both need write access to
# manage Key Vault secrets — the human for initial setup, the SP for
# rotation via CI/CD later.
data "azurerm_client_config" "current" {}

resource "azurerm_role_assignment" "deployer_kv_admin" {
  scope                = module.key_vault.vault_id
  role_definition_name = "Key Vault Administrator"
  principal_id         = data.azurerm_client_config.current.object_id

  description = "Grants the terraform-apply identity full secret/key/certificate management on the vault. Needed for the azurerm_key_vault_secret resources in task 1.8.8 to succeed."
}

############################################
# App Service (NestJS) — managed-identity grants
#
# - Key Vault Secrets User: required so the @Microsoft.KeyVault(...) app
#   settings resolve at runtime. After the first apply the App Service
#   must be restarted once for the references to flip from "unresolved"
#   to green (task 2.1.9).
# - Storage Blob Data Contributor: required for the submissions/reports
#   container access from NestJS (SAS issuance and direct blob ops).
# - Cosmos DB Built-in Data Contributor (data-plane): required to
#   read/write activity_events and submission_events. This is a Cosmos
#   data-plane role, so it is assigned via azurerm_cosmosdb_sql_role_-
#   assignment, NOT azurerm_role_assignment. The built-in role
#   definition GUID `00000000-0000-0000-0000-000000000002` is fixed by
#   Azure across every account.
############################################

resource "azurerm_role_assignment" "app_service_kv_secrets_user" {
  scope                = module.key_vault.vault_id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = module.app_service.principal_id

  description = "Allows the NestJS App Service MI to resolve @Microsoft.KeyVault(...) app-setting references at runtime."
}

resource "azurerm_role_assignment" "app_service_storage_blob_data_contributor" {
  scope                = module.storage.storage_account_id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = module.app_service.principal_id

  description = "Allows the NestJS App Service MI to read/write blobs in the submissions and reports containers."
}

resource "azurerm_cosmosdb_sql_role_assignment" "app_service_cosmos_data_contributor" {
  resource_group_name = azurerm_resource_group.workload.name
  account_name        = module.cosmos.account_name
  scope               = module.cosmos.account_id
  role_definition_id  = "${module.cosmos.account_id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002"
  principal_id        = module.app_service.principal_id
}

############################################
# TODO: enable after the remaining compute resources exist (sections
# 3.1, 3.4). Both will follow the same KV-Secrets-User pattern:
############################################

# resource "azurerm_role_assignment" "function_app_kv_secrets_user" {
#   scope                = module.key_vault.vault_id
#   role_definition_name = "Key Vault Secrets User"
#   principal_id         = module.functions.principal_id
# }

# resource "azurerm_role_assignment" "container_app_kv_secrets_user" {
#   scope                = module.key_vault.vault_id
#   role_definition_name = "Key Vault Secrets User"
#   principal_id         = module.container_apps.thumbnail_principal_id
# }
