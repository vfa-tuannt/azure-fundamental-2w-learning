############################################
# Azure Database for PostgreSQL — Flexible Server
#
# VNet-injected (private access) mode:
#   - delegated_subnet_id pins the server's NIC into snet-db
#   - private_dns_zone_id resolves the server FQDN to its private IP
#   - public_network_access_enabled is implicit FALSE in VNet mode
#
# The Private DNS zone VNet link MUST exist before this resource is
# created (otherwise Azure rejects the create). The link is owned by
# the network module — we wire it in as an explicit dependency.
############################################

resource "azurerm_postgresql_flexible_server" "this" {
  name                = var.server_name
  resource_group_name = var.resource_group_name
  location            = var.location

  version = var.postgres_version

  administrator_login    = var.admin_user
  administrator_password = var.admin_password

  sku_name                     = var.sku_name
  storage_mb                   = var.storage_mb
  backup_retention_days        = var.backup_retention_days
  geo_redundant_backup_enabled = false

  delegated_subnet_id = var.delegated_subnet_id
  private_dns_zone_id = var.private_dns_zone_id

  # In VNet-injected mode the API rejects any public access setting.
  # azurerm 4.x defaults this to `true`, so we MUST set it to false here
  # to avoid a 400 ConflictingPublicNetworkAccessAndVirtualNetworkConfiguration.
  public_network_access_enabled = false

  zone = var.zone

  tags = var.tags

  lifecycle {
    # Azure occasionally rebalances flexible servers across zones;
    # ignore that to keep plans clean.
    ignore_changes = [zone]
  }
}

resource "azurerm_postgresql_flexible_server_database" "skillplatform" {
  name      = var.database_name
  server_id = azurerm_postgresql_flexible_server.this.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}
