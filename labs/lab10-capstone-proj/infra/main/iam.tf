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
# TODO: enable after compute resources exist (sections 2.1, 3.1, 3.4)
#
# Each compute resource gets a system-assigned managed identity that
# needs `Key Vault Secrets User` on the vault to resolve the
# `@Microsoft.KeyVault(SecretUri=...)` app-setting references.
#
# Un-comment each block when the matching module is wired in:
############################################

# resource "azurerm_role_assignment" "app_service_kv_secrets_user" {
#   scope                = module.key_vault.vault_id
#   role_definition_name = "Key Vault Secrets User"
#   principal_id         = module.app_service.principal_id
# }

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
