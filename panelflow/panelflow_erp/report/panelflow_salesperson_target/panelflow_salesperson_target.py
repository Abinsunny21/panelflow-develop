import frappe
from frappe import _
from frappe.utils import flt, get_first_day, get_last_day, getdate

from erpnext.accounts.utils import get_fiscal_year
from erpnext.accounts.doctype.monthly_distribution.monthly_distribution import get_percentage
from erpnext.selling.report.sales_partner_target_variance_based_on_item_group.item_group_wise_sales_target_variance import get_item_group_parent_child_map


def execute(filters=None):
    filters = frappe._dict(filters or {})
    if not filters.company or not filters.month:
        frappe.throw(_("Select a company and a month."))

    frappe.get_doc("Company", filters.company).check_permission("read")
    month = getdate(filters.month)
    fiscal_year, start, end = get_fiscal_year(month, company=filters.company)
    people = frappe.get_list("Sales Person", pluck="name", limit_page_length=0,
                             filters={"name": filters.sales_person} if filters.sales_person else {})
    targets = frappe.get_all("Target Detail", filters={
        "parenttype": "Sales Person", "parent": ["in", people], "fiscal_year": fiscal_year,
    }, fields=["parent", "item_group", "distribution_id", "target_amount"],
        order_by="parent, idx") if people else []

    invoice_names = frappe.get_list("Sales Invoice", filters={
        "company": filters.company, "docstatus": 1,
        "posting_date": ["between", [max(get_first_day(month), start), min(get_last_day(month), end)]],
    }, pluck="name", limit_page_length=0) if targets else []

    amounts = {}
    if invoice_names:
        item = frappe.qb.DocType("Sales Invoice Item")
        team = frappe.qb.DocType("Sales Team")
        from frappe.query_builder.functions import Sum

        amounts = {(person, group): flt(amount) for person, group, amount in (
            frappe.qb.from_(item).join(team).on(
                (team.parent == item.parent) & (team.parenttype == "Sales Invoice")
                & (team.parentfield == "sales_team")
            ).select(team.sales_person, item.item_group,
                     Sum(item.base_net_amount * team.allocated_percentage / 100))
            .where(item.parent.isin(invoice_names) & team.sales_person.isin(people))
            .groupby(team.sales_person, item.item_group).run()
        )}

    descendants = get_item_group_parent_child_map()
    rows = []
    for target in targets:
        distribution = frappe.get_cached_doc("Monthly Distribution", target.distribution_id)
        planned = flt(target.target_amount) * get_percentage(distribution, month, 1) / 100
        groups = descendants.get(target.item_group, [])
        achieved = sum(amount for (person, group), amount in amounts.items()
                       if person == target.parent and
                       (not target.item_group or group == target.item_group or group in groups))
        rows.append(dict(sales_person=target.parent, item_group=target.item_group,
                         target=planned, achieved=achieved, variance=achieved-planned,
                         achievement=100 * achieved / planned if planned else None,
                         currency=frappe.get_cached_value("Company", filters.company, "default_currency")))

    columns = [
        dict(fieldname="sales_person", label=_("Sales Person"), fieldtype="Link", options="Sales Person", width=190),
        dict(fieldname="item_group", label=_("Item Group"), fieldtype="Link", options="Item Group", width=150),
    ]
    for field, label in [("target", _("Monthly Target")), ("achieved", _("Net Sales Achieved")), ("variance", _("Variance"))]:
        columns.append(dict(fieldname=field, label=label, fieldtype="Currency", options="currency", width=160))
    columns.append(dict(fieldname="achievement", label=_("Achievement (%)"), fieldtype="Percent", precision=2, width=150))
    return columns, rows
