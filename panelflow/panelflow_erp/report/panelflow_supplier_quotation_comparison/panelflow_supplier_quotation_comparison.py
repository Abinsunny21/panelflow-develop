from collections import defaultdict

import frappe  # type: ignore[reportMissingImports]
from frappe import _  # type: ignore[reportMissingImports]
from frappe.utils import cint, flt, getdate, today  # type: ignore[reportMissingImports]


def execute(filters=None):
    filters = frappe._dict(filters or {})
    validate_filters(filters)

    if not frappe.has_permission("Supplier Quotation", "read"):
        frappe.throw(
            _("You do not have permission to read Supplier Quotations."),
            frappe.PermissionError,
        )

    currency = frappe.get_cached_value(
        "Company", filters.company, "default_currency"
    )

    rows = get_rows(filters, currency)
    mark_lowest_cost(rows)

    rows.sort(
        key=lambda row: (
            row["item_code"],
            row["stock_uom"],
            row["stock_qty"],
            row["request_for_quotation"] or "",
            row["evaluated_rate"] is None,
            row["evaluated_rate"] or 0,
            row["supplier"],
            row["quotation"],
        )
    )

    message = _(
        "Evaluated cost uses proportional allocation of the quotation's "
        "payable total by item net value. Allocated taxes/charges are not "
        "item-specific tax calculations. Other adjustments reconcile the "
        "allocation to Grand Total, excluding rounding adjustment. "
        "Lowest cost compares the same item, stock UOM, stock quantity "
        "and RFQ. Expired offers are never marked lowest. "
        "Missing delivery dates are not inferred from quotation expiry."
    )

    return get_columns(), rows, message


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


def get_rows(filters, currency):
    conditions = {
        "company": filters.company,
        "docstatus": 1,
        "transaction_date": [
            "between",
            [filters.from_date, filters.to_date],
        ],
    }

    if filters.get("supplier"):
        conditions["supplier"] = filters.supplier

    # get_list respects the current user's document permissions.
    names = frappe.get_list(
        "Supplier Quotation",
        filters=conditions,
        pluck="name",
        limit_page_length=0,
    )

    rows = []
    current_date = getdate(today())

    for name in names:
        quotation = frappe.get_doc("Supplier Quotation", name)
        quotation.check_permission("read")

        expired = bool(
            quotation.valid_till
            and getdate(quotation.valid_till) < current_date
        )

        if expired and not cint(filters.get("include_expired")):
            continue

        # Calculate allocation using ALL rows before applying item/RFQ
        # filters. Filtering must not change an item's allocated cost.
        net_total = sum(
            flt(item.base_net_amount) for item in quotation.items
        )
        taxes_total = flt(quotation.base_total_taxes_and_charges)
        payable_total = flt(quotation.base_grand_total)

        other_adjustments = payable_total - net_total - taxes_total

        allocation_available = (
            net_total > 0
            and payable_total >= 0
            and flt(quotation.conversion_rate) > 0
            and all(
                flt(item.base_net_amount) >= 0
                for item in quotation.items
            )
        )

        for item in quotation.items:
            if (
                filters.get("item_code")
                and item.item_code != filters.item_code
            ):
                continue

            if (
                filters.get("request_for_quotation")
                and item.request_for_quotation
                != filters.request_for_quotation
            ):
                continue

            stock_qty = flt(item.stock_qty)
            net_amount = flt(item.base_net_amount)

            allocated_tax = None
            allocated_adjustment = None
            evaluated_amount = None
            evaluated_rate = None

            if allocation_available and stock_qty > 0:
                proportion = net_amount / net_total
                allocated_tax = taxes_total * proportion
                allocated_adjustment = other_adjustments * proportion

                evaluated_amount = (
                    net_amount + allocated_tax + allocated_adjustment
                )
                evaluated_rate = evaluated_amount / stock_qty

            rows.append(
                {
                    "item_code": item.item_code,
                    "supplier": quotation.supplier,
                    "quotation": quotation.name,
                    "quotation_date": quotation.transaction_date,
                    "request_for_quotation": item.request_for_quotation,
                    "qty": flt(item.qty),
                    "uom": item.uom,
                    "stock_qty": stock_qty,
                    "stock_uom": item.stock_uom,
                    "quote_currency": quotation.currency,
                    "quoted_rate": flt(item.rate),
                    "company_currency": currency,
                    "net_amount": net_amount,
                    "allocated_tax": allocated_tax,
                    "allocated_adjustment": allocated_adjustment,
                    "evaluated_amount": evaluated_amount,
                    "evaluated_rate": evaluated_rate,
                    "expected_delivery_date": item.expected_delivery_date,
                    "lead_time_days": item.lead_time_days,
                    "valid_till": quotation.valid_till,
                    "expired": expired,
                    "lowest": 0,
                    "evaluation": (
                        _("Expired")
                        if expired
                        else (
                            _("Comparable")
                            if evaluated_rate is not None
                            else _("Allocation unavailable")
                        )
                    ),
                }
            )

    return rows


def mark_lowest_cost(rows):
    groups = defaultdict(list)

    for row in rows:
        if row["expired"] or row["evaluated_rate"] is None:
            continue

        key = (
            row["item_code"],
            row["stock_uom"],
            row["stock_qty"],
            row["request_for_quotation"] or "",
        )
        groups[key].append(row)

    for offers in groups.values():
        suppliers = {row["supplier"] for row in offers}

        if len(suppliers) < 2:
            for row in offers:
                row["evaluation"] = _("No competing supplier")
            continue

        # Six decimal places prevent float noise from breaking ties.
        minimum = min(
            flt(row["evaluated_rate"], 6) for row in offers
        )

        for row in offers:
            if flt(row["evaluated_rate"], 6) == minimum:
                row["lowest"] = 1
                row["evaluation"] = _("Lowest evaluated cost")


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
        column("item_code", "Item", "Link", 130, "Item"),
        column("supplier", "Supplier", "Link", 190, "Supplier"),
        column(
            "quotation", "Supplier Quotation",
            "Link", 190, "Supplier Quotation"
        ),
        column("quotation_date", "Quotation Date", "Date", 115),
        column(
            "request_for_quotation", "RFQ",
            "Link", 160, "Request for Quotation"
        ),
        column("qty", "Quoted Qty", "Float", 100),
        column("uom", "Quoted UOM", "Link", 100, "UOM"),
        column("stock_qty", "Stock Qty", "Float", 100),
        column("stock_uom", "Stock UOM", "Link", 100, "UOM"),
        column(
            "quote_currency", "Quote Currency",
            "Link", 110, "Currency"
        ),
        column(
            "quoted_rate", "Quoted Rate",
            "Currency", 130, "quote_currency"
        ),
        column(
            "company_currency", "Company Currency",
            "Link", 120, "Currency"
        ),
        column(
            "net_amount", "Net Amount",
            "Currency", 140, "company_currency"
        ),
        column(
            "allocated_tax", "Allocated Taxes / Charges",
            "Currency", 190, "company_currency"
        ),
        column(
            "allocated_adjustment", "Allocated Other Adjustment",
            "Currency", 200, "company_currency"
        ),
        column(
            "evaluated_amount", "Allocated Payable Amount",
            "Currency", 190, "company_currency"
        ),
        column(
            "evaluated_rate", "Evaluated Cost / Stock Unit",
            "Currency", 200, "company_currency"
        ),
        column(
            "expected_delivery_date", "Expected Delivery Date",
            "Date", 160
        ),
        column("lead_time_days", "Lead Time (Days)", "Int", 125),
        column("valid_till", "Valid Till", "Date", 110),
        column("evaluation", "Evaluation", "Data", 200),
    ]