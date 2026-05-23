terraform {
  backend "azurerm" {
    resource_group_name  = "rg-skillplatform-tfstate"
    storage_account_name = "stskillpltfstatee2bfke"
    container_name       = "tfstate"
    key                  = "skillplatform-prod.tfstate"
  }
}
