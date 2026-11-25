"""Configuration-driven Sales Order numbering."""

import re

import frappe  # type: ignore[reportMissingImports]
from frappe import _  # type: ignore[reportMissingImports]


def set_customer_group_series(doc, method=None):
    """Read the Customer Group prefix before Frappe assigns a name."""

    # Preserve the original series and Frappe's amendment numbering.
    if doc.get("amended_from"):
        original = frappe.get_doc("Sales Order", doc.amended_from)
        original.check_permission("read")
        doc.naming_series = original.naming_series
        return

    if not doc.get("customer"):
        frappe.throw(_("Select a Customer before saving the Sales Order."))

    customer = frappe.get_doc("Customer", doc.customer)
    customer.check_permission("read")

    if not customer.customer_group:
        frappe.throw(
            _("Set a Customer Group for Customer {0}.").format(customer.name)
        )

    group = frappe.get_doc("Customer Group", customer.customer_group)
    group.check_permission("read")

    prefix = (group.get("custom_panelflow_sales_order_prefix") or "").strip()

    if not prefix:
        frappe.throw(
            _(
                "Configure the PanelFlow Sales Order Prefix "
                "on Customer Group {0}."
            ).format(group.name)
        )

    # Prevent naming-series tokens and separators in the configured prefix.
    if not re.fullmatch(r"[A-Z][A-Z0-9]*", prefix):
        frappe.throw(
            _(
                "The Sales Order prefix on Customer Group {0} must "
                "start with an uppercase letter and contain only "
                "uppercase letters and digits."
            ).format(group.name)
        )

    # Four-digit sequence matches the assignment's numbering format.
    doc.naming_series = f"{prefix}-.####"