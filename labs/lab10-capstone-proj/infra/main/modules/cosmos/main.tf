############################################
# Azure Cosmos DB — Serverless, Core (SQL) API
#
# - Capacity mode Serverless via `EnableServerless` capability.
# - Public network access OFF; only ingress is the Private Endpoint
#   in snet-pe (and the resulting A record in the documents zone).
# - One database `skillplatform` with two containers; the activity
#   container has a composite (userId ASC, createdAt DESC) index to
#   serve per-user time-ordered reads cheaply.
############################################

resource "azurerm_cosmosdb_account" "this" {
  name                = var.account_name
  location            = var.location
  resource_group_name = var.resource_group_name

  offer_type = "Standard"
  kind       = "GlobalDocumentDB"

  # Serverless capacity mode.
  capabilities {
    name = "EnableServerless"
  }

  # Single-region primary; no multi-region writes (cheaper, simpler).
  geo_location {
    location          = var.location
    failover_priority = 0
  }

  consistency_policy {
    consistency_level = "Session"
  }

  public_network_access_enabled = false

  # We rely on the Private Endpoint for network access; do NOT enable
  # VNet filter (which would require subnet rules + service endpoints).
  is_virtual_network_filter_enabled = false

  tags = var.tags
}

############################################
# SQL database + containers
############################################

resource "azurerm_cosmosdb_sql_database" "this" {
  name                = var.database_name
  resource_group_name = var.resource_group_name
  account_name        = azurerm_cosmosdb_account.this.name
  # Serverless: no throughput.
}

resource "azurerm_cosmosdb_sql_container" "activity_events" {
  name                  = "activity_events"
  resource_group_name   = var.resource_group_name
  account_name          = azurerm_cosmosdb_account.this.name
  database_name         = azurerm_cosmosdb_sql_database.this.name
  partition_key_paths   = ["/userId"]
  partition_key_version = 2

  indexing_policy {
    indexing_mode = "consistent"

    # Composite index that satisfies:
    #   SELECT * FROM c WHERE c.userId = @uid ORDER BY c.createdAt DESC
    # Cheap RU cost, supports the `GET /activity/me` hot path.
    composite_index {
      index {
        path  = "/userId"
        order = "ascending"
      }
      index {
        path  = "/createdAt"
        order = "descending"
      }
    }
  }
}

resource "azurerm_cosmosdb_sql_container" "submission_events" {
  name                  = "submission_events"
  resource_group_name   = var.resource_group_name
  account_name          = azurerm_cosmosdb_account.this.name
  database_name         = azurerm_cosmosdb_sql_database.this.name
  partition_key_paths   = ["/submissionId"]
  partition_key_version = 2
}

############################################
# Private Endpoint (Sql sub-resource)
############################################

resource "azurerm_private_endpoint" "cosmos" {
  name                = "pe-${var.account_name}"
  location            = var.location
  resource_group_name = var.resource_group_name
  subnet_id           = var.subnet_pe_id

  private_service_connection {
    name                           = "psc-${var.account_name}"
    private_connection_resource_id = azurerm_cosmosdb_account.this.id
    subresource_names              = ["Sql"]
    is_manual_connection           = false
  }

  private_dns_zone_group {
    name                 = "default"
    private_dns_zone_ids = [var.cosmos_private_dns_zone_id]
  }

  tags = var.tags
}
