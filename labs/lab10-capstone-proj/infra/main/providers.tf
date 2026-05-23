provider "azurerm" {
  features {
    key_vault {
      # Don't auto-purge on destroy — purge-protected vaults need manual purge
      purge_soft_deleted_secrets_on_destroy = false
      recover_soft_deleted_key_vaults       = true
    }
    resource_group {
      # Prevent accidental destroy of a non-empty RG
      prevent_deletion_if_contains_resources = false
    }
  }
}

provider "random" {}
