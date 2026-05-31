############################################
# App Service Plan + Linux Web App
#
# - Plan: B1 (Basic) Linux, single instance, no auto-scale in v1.
# - App: Node 24 LTS runtime, system-assigned managed identity, VNet
#   integrated into snet-app with "route all outbound through VNet" ON
#   so traffic to Postgres/Cosmos/Storage/KeyVault Private Endpoints
#   stays on the workload VNet.
# - Health probe at /health; unhealthy instances evicted from the LB
#   pool after a 2-minute window (task 2.1.4 / infra-app-service spec).
# - HTTPS only; HTTP traffic is rejected by the platform.
# - All eight secrets come from Key Vault via @Microsoft.KeyVault refs;
#   the KV-Secrets-User grant lives in the root iam.tf so the role
#   assignment surface stays in one auditable file.
############################################

resource "azurerm_service_plan" "this" {
  name                = var.plan_name
  location            = var.location
  resource_group_name = var.resource_group_name

  os_type  = "Linux"
  sku_name = "B1"

  tags = var.tags
}

resource "azurerm_linux_web_app" "this" {
  name                = var.app_name
  location            = var.location
  resource_group_name = var.resource_group_name
  service_plan_id     = azurerm_service_plan.this.id

  https_only = true

  identity {
    type = "SystemAssigned"
  }

  # VNet integration — outbound from the app lands in snet-app, which
  # has the route table needed to reach the Private Endpoints in snet-pe.
  virtual_network_subnet_id = var.subnet_id

  site_config {
    application_stack {
      node_version = "24-lts"
    }

    # Route ALL outbound traffic (not just RFC1918) through the VNet.
    vnet_route_all_enabled = true

    # B1 plan can idle out otherwise — keep the NestJS process warm so
    # the /health probe is meaningful and cold-start doesn't tank p95.
    always_on = true

    health_check_path                 = "/health"
    health_check_eviction_time_in_min = 2

    ftps_state = "Disabled"
  }

  app_settings = local.app_settings

  tags = var.tags
}

############################################
# App settings
#
# Eight Key Vault references (one per secret in kv-secrets.tf) plus
# four plain values. KV refs use the un-versioned SecretUri form so the
# App Service runtime always resolves the LATEST version — secret
# rotation does not require an app-settings redeploy.
############################################

locals {
  kv_ref = {
    database_url         = "@Microsoft.KeyVault(SecretUri=${var.key_vault_uri}secrets/database-url)"
    storage_conn         = "@Microsoft.KeyVault(SecretUri=${var.key_vault_uri}secrets/storage-connection-string)"
    cosmos_conn          = "@Microsoft.KeyVault(SecretUri=${var.key_vault_uri}secrets/cosmos-connection-string)"
    google_client_id     = "@Microsoft.KeyVault(SecretUri=${var.key_vault_uri}secrets/google-client-id)"
    google_client_secret = "@Microsoft.KeyVault(SecretUri=${var.key_vault_uri}secrets/google-client-secret)"
    jwt_private_key      = "@Microsoft.KeyVault(SecretUri=${var.key_vault_uri}secrets/jwt-private-key)"
    appinsights_conn     = "@Microsoft.KeyVault(SecretUri=${var.key_vault_uri}secrets/appinsights-connection-string)"
    scanner_secret       = "@Microsoft.KeyVault(SecretUri=${var.key_vault_uri}secrets/scanner-shared-secret)"
  }

  app_settings = {
    DATABASE_URL                          = local.kv_ref.database_url
    AZURE_STORAGE_CONNECTION_STRING       = local.kv_ref.storage_conn
    COSMOS_CONNECTION_STRING              = local.kv_ref.cosmos_conn
    GOOGLE_CLIENT_ID                      = local.kv_ref.google_client_id
    GOOGLE_CLIENT_SECRET                  = local.kv_ref.google_client_secret
    JWT_PRIVATE_KEY                       = local.kv_ref.jwt_private_key
    APPLICATIONINSIGHTS_CONNECTION_STRING = local.kv_ref.appinsights_conn
    SCANNER_SHARED_SECRET                 = local.kv_ref.scanner_secret

    NODE_ENV              = "production"
    PORT                  = "8080"
    CORS_ORIGIN           = var.cors_origin
    THUMBNAIL_SERVICE_URL = var.thumbnail_service_url
  }
}
