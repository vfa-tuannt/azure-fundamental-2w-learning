############################################
# Storage Account — LRS, StorageV2, private-only
#
# Public network access is OFF. The only ingress is the blob Private
# Endpoint in snet-pe, whose A record lands in the blob Private DNS
# zone (linked to the workload VNet by the network module).
############################################

resource "azurerm_storage_account" "this" {
  name                = var.storage_account_name
  resource_group_name = var.resource_group_name
  location            = var.location

  account_tier             = "Standard"
  account_replication_type = "LRS"
  account_kind             = "StorageV2"
  min_tls_version          = "TLS1_2"

  # Tighten public surface — private endpoint is the only ingress.
  public_network_access_enabled   = false
  allow_nested_items_to_be_public = false
  is_hns_enabled                  = false # no hierarchical namespace
  shared_access_key_enabled       = true  # required for connection-string-based clients

  tags = var.tags
}

############################################
# Containers
############################################

resource "azurerm_storage_container" "this" {
  for_each = toset(var.container_names)

  name                  = each.value
  storage_account_id    = azurerm_storage_account.this.id
  container_access_type = "private"
}

############################################
# Private Endpoint (blob sub-resource)
############################################

resource "azurerm_private_endpoint" "blob" {
  name                = "pe-${var.storage_account_name}-blob"
  location            = var.location
  resource_group_name = var.resource_group_name
  subnet_id           = var.subnet_pe_id

  private_service_connection {
    name                           = "psc-${var.storage_account_name}-blob"
    private_connection_resource_id = azurerm_storage_account.this.id
    subresource_names              = ["blob"]
    is_manual_connection           = false
  }

  private_dns_zone_group {
    name                 = "default"
    private_dns_zone_ids = [var.blob_private_dns_zone_id]
  }

  tags = var.tags
}
