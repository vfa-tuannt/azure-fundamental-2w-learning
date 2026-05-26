############################################
# Key Vault secrets
#
# Per infra-secrets/spec.md "Required secrets populated", the vault
# holds these 9 secrets exactly. Two of them (cosmos-connection-string,
# appinsights-connection-string) depend on resources that haven't been
# created yet (sections 1.9 and 1.11) — those are left as commented
# stubs and will be uncommented in their respective tasks.
#
# All resources `depends_on` the deployer_kv_admin role assignment so
# the apply order is: vault → IAM grant → secrets. Without the explicit
# dep, Terraform may race the role assignment and the secret writes,
# resulting in a 403 on the first apply.
############################################

# 64-char random string used as the shared HMAC between the scanner
# Function and the NestJS /internal/submissions/:id/invalidate route.
resource "random_password" "scanner_shared_secret" {
  length  = 64
  special = false
}

locals {
  kv_secrets = {
    "database-url"                = module.postgres.database_url
    "storage-connection-string"   = module.storage.primary_connection_string
    "cosmos-connection-string"    = module.cosmos.primary_connection_string
    "google-client-id"            = var.google_client_id
    "google-client-secret"        = var.google_client_secret
    "jwt-private-key"             = var.jwt_private_key
    "jwt-public-key"              = var.jwt_public_key
    "scanner-shared-secret"       = random_password.scanner_shared_secret.result
  }
}

resource "azurerm_key_vault_secret" "this" {
  for_each = local.kv_secrets

  name         = each.key
  value        = each.value
  key_vault_id = module.key_vault.vault_id

  depends_on = [
    azurerm_role_assignment.deployer_kv_admin,
  ]
}

############################################
# TODO: enable after Application Insights module exists (section 1.11)
############################################

# resource "azurerm_key_vault_secret" "appinsights_connection_string" {
#   name         = "appinsights-connection-string"
#   value        = module.observability.appinsights_connection_string
#   key_vault_id = module.key_vault.vault_id
#
#   depends_on = [azurerm_role_assignment.deployer_kv_admin]
# }
