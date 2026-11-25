"""Permission-aware read APIs for the PanelFlow operational portal.

Every record list uses Frappe's permission-filtered APIs. Writes continue through
Frappe's standard document and workflow endpoints so stock/accounting lifecycle
hooks are preserved.
"""

import json
from urllib.parse import quote

import frappe
from frappe import _
from frappe.utils import get_url


WORKSPACES = {
    "Sales and CRM": [
        ("Customer", "Customers"),
        ("Lead", "Leads"), ("Opportunity", "Opportunities"),
        ("Quotation", "Quotations"), ("Sales Order", "Sales Orders"),
        ("Delivery Note", "Delivery Notes"), ("Sales Invoice", "Sales Invoices"),
        ("Event", "Meetings and Calls"), ("ToDo", "Follow-ups"),
    ],
    "Purchase": [
        ("Supplier", "Suppliers"),
        ("Item", "Items"),
        ("Material Request", "Material Requests"),
        ("Request for Quotation", "Requests for Quotation"),
        ("Supplier Quotation", "Supplier Quotations"),
        ("Purchase Order", "Purchase Orders"),
        ("Purchase Receipt", "Purchase Receipts"),
        ("Purchase Invoice", "Purchase Invoices"),
        ("Bin", "Warehouse Stock"),
    ],
    "Stock and Manufacturing": [
        ("Item", "Items"),
        ("BOM", "Bills of Materials"), ("Work Order", "Work Orders"),
        ("Stock Entry", "Stock Entries"), ("Delivery Note", "Delivery Notes"),
        ("Bin", "Warehouse Stock"),
    ],
    "Accounts": [
        ("Sales Invoice", "Sales Invoices"), ("Purchase Invoice", "Purchase Invoices"),
        ("Payment Entry", "Payment Entries"),
    ],
}

DOCTYPE_TITLES = {
    "Customer": ["customer_name", "customer_group", "territory", "customer_type"],
    "Supplier": ["supplier_name", "supplier_group", "supplier_type", "country"],
    "Item": ["item_name", "item_group", "stock_uom", "is_stock_item"],
    "Sales Invoice": ["customer", "posting_date", "due_date", "grand_total", "outstanding_amount", "status"],
    "Purchase Invoice": ["supplier", "posting_date", "due_date", "grand_total", "outstanding_amount", "status"],
    "Sales Order": ["customer", "transaction_date", "delivery_date", "grand_total", "status", "per_delivered"],
    "Purchase Order": ["supplier", "transaction_date", "schedule_date", "grand_total", "status", "per_received"],
    "Quotation": ["party_name", "transaction_date", "valid_till", "grand_total", "status", "workflow_state"],
    "Supplier Quotation": ["supplier", "transaction_date", "valid_till", "grand_total", "status"],
    "Lead": ["lead_name", "company_name", "status", "source", "territory", "owner"],
    "Opportunity": ["party_name", "sales_stage", "opportunity_amount", "expected_closing", "status"],
    "Purchase Receipt": ["supplier", "posting_date", "status", "per_billed"],
    "Delivery Note": ["customer", "posting_date", "status", "per_billed"],
    "Material Request": ["transaction_date", "material_request_type", "status"],
    "Work Order": ["production_item", "qty", "produced_qty", "status", "planned_start_date"],
    "Stock Entry": ["stock_entry_type", "posting_date", "status"],
    "Event": ["subject", "event_category", "starts_on", "status", "owner"],
    "ToDo": ["description", "date", "status", "allocated_to", "reference_type", "reference_name"],
    "BOM": ["item", "quantity", "is_active", "is_default"],
    "Payment Entry": ["party_type", "party", "posting_date", "paid_amount", "status"],
    "Bin": ["item_code", "warehouse", "actual_qty", "ordered_qty", "projected_qty"],
    "Request for Quotation": ["transaction_date", "status", "schedule_date"],
}

REPORT_WORKSPACES = {
    "CRM": "Sales and CRM",
    "Selling": "Sales and CRM",
    "Buying": "Purchase",
    "Stock": "Stock and Manufacturing",
    "Manufacturing": "Stock and Manufacturing",
    "Accounts": "Accounts",
}

REPORT_DOCTYPE_WORKSPACES = {
    "Customer": "Sales and CRM",
    "Lead": "Sales and CRM",
    "Opportunity": "Sales and CRM",
    "Quotation": "Sales and CRM",
    "Sales Order": "Sales and CRM",
    "Delivery Note": "Sales and CRM",
    "Event": "Sales and CRM",
    "ToDo": "Sales and CRM",
    "Supplier": "Purchase",
    "Material Request": "Purchase",
    "Request for Quotation": "Purchase",
    "Supplier Quotation": "Purchase",
    "Purchase Order": "Purchase",
    "Purchase Receipt": "Purchase",
    "Item": "Stock and Manufacturing",
    "BOM": "Stock and Manufacturing",
    "Work Order": "Stock and Manufacturing",
    "Stock Entry": "Stock and Manufacturing",
    "Bin": "Stock and Manufacturing",
    "Sales Invoice": "Accounts",
    "Purchase Invoice": "Accounts",
    "Payment Entry": "Accounts",
}


def _system_user():
    if frappe.session.user == "Guest":
        frappe.throw(_("Please sign in to use PanelFlow."), frappe.PermissionError)
    if frappe.db.get_value("User", frappe.session.user, "user_type") != "System User":
        frappe.throw(_("PanelFlow is available to staff accounts."), frappe.PermissionError)


@frappe.whitelist(methods=["GET"])
@frappe.read_only()
def get_bootstrap():
    _system_user()
    user = frappe.session.user
    roles = set(frappe.get_roles(user))
    default_company = frappe.defaults.get_user_default("Company") or _single_permitted_company()
    fiscal_year = frappe.get_attr("erpnext.accounts.utils.get_fiscal_year")(
        date=frappe.utils.today(), company=default_company, boolean=True
    )
    workspaces = []
    for title, entries in WORKSPACES.items():
        allowed = [
            {"doctype": doctype, "label": label, "supports_docstatus": bool(frappe.get_meta(doctype).is_submittable)}
            for doctype, label in entries
            if frappe.has_permission(doctype, "read", user=user)
        ]
        if allowed:
            workspaces.append({"name": title, "records": allowed})

    reports = []
    from frappe.desk.query_report import get_report_doc

    for report in frappe.get_all(
        "Report", filters={"disabled": 0},
        fields=["name", "ref_doctype", "module", "report_type", "prepared_report"],
        order_by="module asc, name asc", limit_page_length=0,
    ):
        try:
            permitted_report = get_report_doc(report.name)
        except frappe.PermissionError:
            continue

        module = report.module or permitted_report.module or "Other"
        workspace = REPORT_WORKSPACES.get(module) or REPORT_DOCTYPE_WORKSPACES.get(report.ref_doctype)
        if not workspace and report.ref_doctype:
            doctype_module = frappe.get_meta(report.ref_doctype).module
            workspace = REPORT_WORKSPACES.get(doctype_module)
        if not workspace:
            continue
        reports.append({
            "name": report.name, "doctype": report.ref_doctype, "module": module,
            "report_type": report.report_type, "prepared": bool(report.prepared_report),
            "workspace": workspace,
        })

    return {
        "user": user,
        "full_name": frappe.db.get_value("User", user, "full_name") or user,
        "default_company": default_company,
        "default_currency": frappe.defaults.get_user_default("Currency") or "",
        "today": frappe.utils.today(),
        "current_fiscal_year": list(fiscal_year[0]) if fiscal_year else [],
        "companies": frappe.get_list("Company", pluck="name", limit_page_length=0) if frappe.has_permission("Company", "read") else [],
        "roles": sorted(roles),
        "workspaces": workspaces,
        "reports": reports,
        "can_search": bool(frappe.has_permission("Lead", "read") or frappe.has_permission("Sales Order", "read")),
    }


def _single_permitted_company():
    if not frappe.has_permission("Company", "read"):
        return ""
    companies = frappe.get_list("Company", pluck="name", limit_page_length=0)
    return companies[0] if len(companies) == 1 else ""


@frappe.whitelist(methods=["GET"])
@frappe.read_only()
def get_overview():
    """Small live counters and actionable queues, all permission filtered."""
    _system_user()
    user = frappe.session.user
    roles = set(frappe.get_roles(user))
    cards = []
    queues = []
    charts = []
    specs = [
        ("Quotation", {"docstatus": 0}, "Quotations in progress"),
        ("Sales Order", {"docstatus": 1}, "Submitted Sales Orders"),
        ("Purchase Order", {"docstatus": 0}, "Draft Purchase Orders"),
        ("Purchase Receipt", {"docstatus": 0}, "Draft receipts"),
        ("Work Order", {"docstatus": 1}, "Submitted Work Orders"),
    ]
    for doctype, filters, label in specs:
        if frappe.has_permission(doctype, "read", user=user):
            names = frappe.get_list(doctype, filters=filters, pluck="name", limit_page_length=1000)
            cards.append({"label": label, "value": len(names), "doctype": doctype, "filters": filters})

    if frappe.has_permission("Sales Order", "read", user=user):
        orders = frappe.get_list("Sales Order", filters={"docstatus": 1}, fields=["per_delivered"], limit_page_length=1000)
        delivery = {"Delivered": 0, "In progress": 0, "Not started": 0}
        for order in orders:
            progress = float(order.per_delivered or 0)
            delivery["Delivered" if progress >= 100 else "In progress" if progress > 0 else "Not started"] += 1
        charts.append({"title": _("Sales Order delivery status"), "unit": _("orders"),
                       "items": [{"label": label, "value": value} for label, value in delivery.items()]})

    if frappe.has_permission("Opportunity", "read", user=user):
        opportunities = frappe.get_list("Opportunity", fields=["sales_stage"], limit_page_length=1000)
        stages = {}
        for opportunity in opportunities:
            stage = opportunity.sales_stage or _("Unassigned")
            stages[stage] = stages.get(stage, 0) + 1
        if stages:
            charts.append({"title": _("Opportunity pipeline by stage"), "unit": _("opportunities"),
                           "items": [{"label": label, "value": value}
                                     for label, value in sorted(stages.items(), key=lambda item: (-item[1], item[0]))[:8]]})

    if frappe.has_permission("ToDo", "read", user=user):
        todos = frappe.get_list("ToDo", filters={"allocated_to": user, "status": "Open", "date": ["<=", frappe.utils.today()]},
                               fields=["name", "description", "date", "reference_type", "reference_name"],
                               order_by="date asc", page_length=10)
        for row in todos:
            queues.append({"title": frappe.utils.strip_html(row.description or "").strip() or _("Follow-up"), "subtitle": f"{row.date} · {row.reference_name or ''}",
                           "doctype": "ToDo", "name": row.name, "kind": "Follow-up"})

    if frappe.has_permission("Sales Invoice", "read", user=user):
        overdue = frappe.get_list("Sales Invoice", filters={"docstatus": 1, "due_date": ["<", frappe.utils.today()],
                                                             "outstanding_amount": [">", 0]},
                                  fields=["name", "customer", "due_date", "outstanding_amount"],
                                  order_by="due_date asc", page_length=10)
        for row in overdue:
            queues.append({"title": row.name, "subtitle": f"Overdue · {row.customer} · due {row.due_date}",
                           "doctype": "Sales Invoice", "name": row.name, "kind": _("Customer invoice")})

    if frappe.has_permission("Purchase Order", "read", user=user):
        receipts = frappe.get_list("Purchase Order", filters={"docstatus": 1, "per_received": ["<", 100]},
                                   fields=["name", "supplier", "schedule_date", "per_received"],
                                   order_by="schedule_date asc", page_length=10)
        for row in receipts:
            queues.append({"title": row.name, "subtitle": f"{row.supplier} · {row.per_received or 0:g}% received", 
                           "doctype": "Purchase Order", "name": row.name, "kind": _("Pending receipt")})

    for doctype, label in (("Quotation", _("Quotations awaiting my approval")),
                           ("Purchase Order", _("Purchase Orders awaiting my action"))):
        if not frappe.has_permission(doctype, "read", user=user):
            continue
        names = frappe.get_list(doctype, filters={"docstatus": 0}, pluck="name", limit_page_length=200)
        for name in names:
            doc = frappe.get_doc(doctype, name)
            if not doc.get("workflow_state") or "pending" not in doc.workflow_state.lower():
                continue
            try:
                from frappe.model.workflow import get_transitions
                actions = get_transitions(doc)
            except Exception:
                actions = []
            if any(action.action.lower() in {"approve", "reject", "recommend approval"} for action in actions):
                queues.append({"title": name, "subtitle": f"{doc.workflow_state} · {doc.get('party_name') or doc.get('supplier') or ''}",
                               "doctype": doctype, "name": name, "kind": label})
    return {"cards": cards, "queues": queues[:30], "charts": charts}


@frappe.whitelist(methods=["GET"])
@frappe.read_only()
def get_records(doctype: str, search: str = "", page: int = 1, filters=None):
    _system_user()
    if doctype not in DOCTYPE_TITLES:
        frappe.throw(_("This document type is not available in the portal."), frappe.PermissionError)
    if not frappe.has_permission(doctype, "read"):
        frappe.throw(_("You do not have permission to read {0}.").format(doctype), frappe.PermissionError)
    if isinstance(filters, str):
        filters = json.loads(filters or "{}")
    filters = frappe._dict(filters or {})
    search = (search or "").strip()[:100]
    page = max(1, min(int(page or 1), 10000))
    fields = [f for f in DOCTYPE_TITLES[doctype] if frappe.get_meta(doctype).has_field(f)]
    fields = ["name", "modified", "docstatus"] + fields
    search_fields = [f for f in fields if frappe.get_meta(doctype).get_field(f) and
                     frappe.get_meta(doctype).get_field(f).fieldtype in ("Data", "Link", "Select")]
    conditions = []
    for field, value in filters.items():
        if field in fields and value not in (None, ""):
            conditions.append([doctype, field, "=", value])
    or_filters = []
    if search:
        or_filters.append([doctype, "name", "like", f"%{search}%"])
        or_filters.extend([doctype, field, "like", f"%{search}%"] for field in search_fields[:2])
    rows = frappe.get_list(
        doctype, fields=fields, filters=conditions, or_filters=or_filters,
        order_by="modified desc", start=(page - 1) * 50, page_length=50,
    )
    return {"rows": rows, "page": page, "has_more": len(rows) == 50, "fields": fields}


@frappe.whitelist(methods=["GET"])
@frappe.read_only()
def get_record(doctype: str, name: str):
    _system_user()
    if doctype not in DOCTYPE_TITLES or not frappe.has_permission(doctype, "read"):
        frappe.throw(_("You do not have permission to read this record."), frappe.PermissionError)
    doc = frappe.get_doc(doctype, name)
    doc.check_permission("read")
    doc.apply_fieldlevel_read_permissions()
    result = doc.as_dict()
    result["portal_transitions"] = []
    if frappe.db.exists("Workflow", {"document_type": doctype, "is_active": 1}):
        from frappe.model.workflow import get_transitions
        result["portal_transitions"] = [
            {"action": row.action, "next_state": row.next_state}
            for row in get_transitions(doc)
        ]
    if doctype == "Sales Order":
        result["material_shortages"] = frappe.get_attr("panelflow.portal.get_material_shortages")(name)
    return result


@frappe.whitelist(methods=["GET"])
@frappe.read_only()
def get_material_shortages(sales_order: str):
    _system_user()
    order = frappe.get_doc("Sales Order", sales_order)
    order.check_permission("read")
    return frappe.get_attr("panelflow.material_planning.calculate_shortages")(order)


@frappe.whitelist(methods=["GET"])
@frappe.read_only()
def get_notifications(limit: int = 25):
    _system_user()
    if not frappe.has_permission("Notification Log", "read"):
        return []
    rows = frappe.get_list(
        "Notification Log", filters={"for_user": frappe.session.user},
        fields=["name", "subject", "email_content", "document_type", "document_name", "read", "creation"],
        order_by="creation desc", page_length=max(1, min(int(limit or 25), 50)),
    )
    for row in rows:
        row.link = None
        if row.document_type and row.document_name and frappe.has_permission(row.document_type, "read"):
            if frappe.db.exists(row.document_type, row.document_name):
                try:
                    frappe.get_doc(row.document_type, row.document_name).check_permission("read")
                    row.link = f"/app/{frappe.scrub(row.document_type)}/{quote(row.document_name)}"
                except frappe.PermissionError:
                    pass
    return rows


@frappe.whitelist(methods=["GET"])
@frappe.read_only()
def available_report(report_name: str):
    _system_user()
    report = frappe.get_doc("Report", report_name)
    from frappe.desk.query_report import get_report_doc

    permitted_report = get_report_doc(report_name)
    return {"name": report.name, "doctype": report.ref_doctype,
            "prepared": bool(report.prepared_report), "filters": permitted_report.filters or []}
