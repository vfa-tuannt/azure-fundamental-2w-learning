############################################
# Azure Key Vault — RBAC mode, private-only, purge-protected
#
# IMPORTANT: a vault with the configured name may already exist in
# soft-deleted state from earlier manual portal work. The root provider
# is configured with `recover_soft_deleted_key_vaults = true`, so this
# resource will RECOVER the existing vault on apply instead of failing
# with a name-conflict.
############################################

data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "this" {
  name                = var.vault_name
  location            = var.location
  resource_group_name = var.resource_group_name
  tenant_id           = data.azurerm_client_config.current.tenant_id

  sku_name = "standard"

  # RBAC mode (NOT legacy access policies).
  rbac_authorization_enabled = true

  # Selected-networks mode: the vault is reachable ONLY via the Private
  # Endpoint and from the explicit IPs in `allowed_admin_ips`. The
  # default action is Deny — everything not in the allowlist is
  # blocked. Keep `allowed_admin_ips` empty in production.
  public_network_access_enabled = true

  network_acls {
    bypass         = "AzureServices"
    default_action = "Deny"
    ip_rules       = var.allowed_admin_ips
  }

  # Soft-delete + purge protection — per the proposal's security posture.
  soft_delete_retention_days = var.soft_delete_retention_days
  purge_protection_enabled   = true

  tags = var.tags
}

############################################
# Private Endpoint (vault sub-resource)
############################################

resource "azurerm_private_endpoint" "vault" {
  name                = "pe-${var.vault_name}"
  location            = var.location
  resource_group_name = var.resource_group_name
  subnet_id           = var.subnet_pe_id

  private_service_connection {
    name                           = "psc-${var.vault_name}"
    private_connection_resource_id = azurerm_key_vault.this.id
    subresource_names              = ["vault"]
    is_manual_connection           = false
  }

  private_dns_zone_group {
    name                 = "default"
    private_dns_zone_ids = [var.vault_private_dns_zone_id]
  }

  tags = var.tags
}
