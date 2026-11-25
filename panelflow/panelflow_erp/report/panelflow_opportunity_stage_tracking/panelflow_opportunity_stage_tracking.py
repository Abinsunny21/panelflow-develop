from collections import defaultdict
from decimal import Decimal

import frappe
from frappe import _
from frappe.utils import getdate


def execute(filters=None):
    filters = frappe._dict(filters or {})
    if filters.from_date and filters.to_date and getdate(filters.from_date) > getdate(filters.to_date):
        frappe.throw(_("From Date must be on or before To Date."))

    conditions = []
    for field in ("company", "sales_stage", "opportunity_owner"):
        if filters.get(field):
            conditions.append([field, "=", filters[field]])
    if filters.from_date:
        conditions.append(["transaction_date", ">=", filters.from_date])
    if filters.to_date:
        conditions.append(["transaction_date", "<=", filters.to_date])

    columns = [
        dict(fieldname="name", label=_("Opportunity"), fieldtype="Link", options="Opportunity", width=180),
        dict(fieldname="transaction_date", label=_("Opportunity Date"), fieldtype="Date", width=125),
        dict(fieldname="opportunity_from", label=_("Party Type"), fieldtype="Data", width=100),
        dict(fieldname="party_name", label=_("Party"), fieldtype="Dynamic Link", options="opportunity_from", width=185),
        dict(fieldname="sales_stage", label=_("Sales Stage"), fieldtype="Link", options="Sales Stage", width=145),
        dict(fieldname="opportunity_owner", label=_("Opportunity Owner"), fieldtype="Link", options="User", width=180),
        dict(fieldname="expected_closing", label=_("Expected Closing Date"), fieldtype="Date", width=155),
        dict(fieldname="currency", label=_("Currency"), fieldtype="Link", options="Currency", width=90),
        dict(fieldname="opportunity_amount", label=_("Opportunity Value"), fieldtype="Currency", options="currency", width=145),
    ]
    rows = frappe.get_list(
        "Opportunity",
        fields=[column["fieldname"] for column in columns],
        filters=conditions,
        order_by="sales_stage asc, transaction_date desc, name asc",
        limit_page_length=0,
    )

    totals = defaultdict(Decimal)
    for row in rows:
        key = (row.sales_stage or _("Unspecified stage"), row.currency)
        totals[key] += Decimal(str(row.opportunity_amount or 0))

    summary = [
        dict(label=stage, value=float(amount), datatype="Currency", currency=currency)
        for (stage, currency), amount in totals.items()
    ]
    return columns, rows, None, None, summary
