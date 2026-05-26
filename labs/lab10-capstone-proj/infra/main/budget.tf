############################################
# Subscription-level monthly budget + email alerts
#
# Matches the manual portal setup from task 1.12.1.
# $32 = 80% of the original $40 ceiling. Heads up: Premium ACR (~$50/mo)
# alone will trip the 80% threshold on this budget — that's the intended
# "you're now spending real money" signal during this learning project.
#
# Notifications fire at 80% AND 100% of the amount. Both go to the
# `alert_email` Terraform variable.
############################################

data "azurerm_subscription" "current" {}

resource "azurerm_consumption_budget_subscription" "monthly" {
  name            = local.naming.budget
  subscription_id = data.azurerm_subscription.current.id

  amount     = 32
  time_grain = "Monthly"

  time_period {
    # Must be the first day of a month at 00:00 UTC. A past date is
    # fine — the budget tracks the *current* month each cycle.
    start_date = "2026-05-01T00:00:00Z"
  }

  notification {
    enabled        = true
    threshold      = 80
    operator       = "GreaterThan"
    threshold_type = "Actual"
    contact_emails = [var.alert_email]
  }

  notification {
    enabled        = true
    threshold      = 100
    operator       = "GreaterThan"
    threshold_type = "Actual"
    contact_emails = [var.alert_email]
  }
}
