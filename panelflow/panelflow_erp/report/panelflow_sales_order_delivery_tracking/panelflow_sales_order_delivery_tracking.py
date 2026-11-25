import frappe  # pyright: ignore[reportMissingImports]
from frappe import _  # pyright: ignore[reportMissingImports]
from frappe.utils import flt, getdate  # pyright: ignore[reportMissingImports]


DELIVERY_STATUSES = (
    "Pending",
    "Partially Delivered",
    "Fully Delivered",
)


def execute(filters=None):
    filters = frappe._dict(filters or {})
    validate_filters(filters)

    if not frappe.has_permission("Sales Order", "read"):
        frappe.throw(
            _("You do not have permission to read Sales Orders."),
            frappe.PermissionError,
        )

    conditions = {
        "company": filters.company,
        "docstatus": 1,
        "transaction_date": [
            "between",
            [filters.from_date, filters.to_date],
        ],
    }

    if filters.get("customer"):
        conditions["customer"] = filters.customer

    if filters.get("sales_order"):
        conditions["name"] = filters.sales_order

    # Apply the current user's document and user permissions.
    order_names = frappe.get_list(
        "Sales Order",
        filters=conditions,
        pluck="name",
        order_by="transaction_date desc, name desc",
        limit_page_length=0,
    )

    data = []

    for name in order_names:
        order = frappe.get_doc("Sales Order", name)
        order.check_permission("read")

        for item in order.items:
            if (
                filters.get("item_code")
                and item.item_code != filters.item_code
            ):
                continue

            precision = item.precision("qty")
            ordered = flt(item.qty, precision)
            delivered = flt(item.delivered_qty, precision)
            pending = max(
                flt(ordered - delivered, precision), 0
            )

            if pending == 0:
                delivery_status = "Fully Delivered"
            elif delivered > 0:
                delivery_status = "Partially Delivered"
            else:
                delivery_status = "Pending"

            if (
                filters.get("delivery_status")
                and delivery_status != filters.delivery_status
            ):
                continue

            data.append(
                {
                    "order_date": order.transaction_date,
                    "sales_order": order.name,
                    "customer": order.customer,
                    "order_status": order.status,
                    "item_row": item.idx,
                    "item_code": item.item_code,
                    "uom": item.uom,
                    "ordered_qty": ordered,
                    "delivered_qty": delivered,
                    "pending_qty": pending,
                    "delivery_status": delivery_status,
                    "delivery_date": item.delivery_date,
                    "warehouse": item.warehouse,
                }
            )

    message = _(
        "Quantities are in each order item's UOM. Delivered quantity "
        "comes from ERPNext's Sales Order item tracking. Pending quantity "
        "is ordered minus delivered, with a minimum of zero. Closed and "
        "on-hold orders remain visible with their actual delivery progress; "
        "their remaining quantity is not necessarily an instruction to ship. "
        "Draft and cancelled orders are excluded."
    )

    return get_columns(), data, message


def validate_filters(filters):
    for fieldname in ("company", "from_date", "to_date"):
        if not filters.get(fieldname):
            frappe.throw(
                _("{0} is required.").format(
                    fieldname.replace("_", " ").title()
                )
            )

    if getdate(filters.from_date) > getdate(filters.to_date):
        frappe.throw(_("From Date cannot be after To Date."))

    if (
        filters.get("delivery_status")
        and filters.delivery_status not in DELIVERY_STATUSES
    ):
        frappe.throw(_("Invalid Delivery Status."))


def get_columns():
    def column(fieldname, label, fieldtype, width, options=None):
        result = {
            "fieldname": fieldname,
            "label": _(label),
            "fieldtype": fieldtype,
            "width": width,
        }
        if options:
            result["options"] = options
        return result

    return [
        column("order_date", "Order Date", "Date", 110),
        column(
            "sales_order", "Sales Order",
            "Link", 160, "Sales Order"
        ),
        column(
            "customer", "Customer",
            "Link", 190, "Customer"
        ),
        column("order_status", "Order Status", "Data", 155),
        column("item_row", "Item Row", "Int", 80),
        column(
            "item_code", "Item",
            "Link", 150, "Item"
        ),
        column("uom", "UOM", "Link", 90, "UOM"),
        column("ordered_qty", "Ordered Qty", "Float", 115),
        column("delivered_qty", "Delivered Qty", "Float", 115),
        column("pending_qty", "Pending Qty", "Float", 115),
        column(
            "delivery_status", "Delivery Status",
            "Data", 170
        ),
        column("delivery_date", "Delivery Date", "Date", 115),
        column(
            "warehouse", "Warehouse",
            "Link", 160, "Warehouse"
        ),
    ]