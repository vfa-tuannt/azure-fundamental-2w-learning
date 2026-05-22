terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "azurerm" {
  features {}
}

variable "location" {
  type    = string
  default = "japaneast"
}

# 6-char random suffix to make the storage account name globally unique
resource "random_string" "suffix" {
  length  = 6
  upper   = false
  special = false
}

resource "azurerm_resource_group" "tfstate" {
  name     = "rg-skillplatform-tfstate"
  location = var.location

  tags = {
    project   = "skillplatform"
    env       = "prod"
    managedBy = "terraform"
  }
}

resource "azurerm_storage_account" "tfstate" {
  name                     = "stskillpltfstate${random_string.suffix.result}"
  resource_group_name      = azurerm_resource_group.tfstate.name
  location                 = azurerm_resource_group.tfstate.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  account_kind             = "StorageV2"
  min_tls_version          = "TLS1_2"

  # Blob soft-delete OFF — state files are managed by Terraform, not soft-delete
  blob_properties {
    delete_retention_policy {
      days = 1
    }
  }

  shared_access_key_enabled = true

  tags = azurerm_resource_group.tfstate.tags
}

resource "azurerm_storage_container" "tfstate" {
  name                  = "tfstate"
  storage_account_id    = azurerm_storage_account.tfstate.id
  container_access_type = "private"
}

output "tfstate_storage_account" {
  value       = azurerm_storage_account.tfstate.name
  description = "Storage account name to paste into infra/main/backend.tf"
}

output "tfstate_resource_group" {
  value = azurerm_resource_group.tfstate.name
}
