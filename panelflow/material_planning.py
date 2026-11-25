from collections import defaultdict
from html import escape

import frappe  # type: ignore[import-not-found]
from frappe.utils import flt  # type: ignore[import-not-found]


def free_finished_stock(order, item_code, warehouse):
    """Give existing open customer demand first use of the warehouse balance."""
    if not warehouse:
        return 0
    so = frappe.qb.DocType("Sales Order")
    line = frappe.qb.DocType("Sales Order Item")
    other_lines = (
        frappe.qb.from_(so).join(line).on(line.parent == so.name)
        .select(line.qty, line.delivered_qty, line.conversion_factor)
        .where((so.docstatus == 1) & (so.name != order.name)
               & (so.company == order.company) & (so.status != "Closed")
               & (line.item_code == item_code) & (line.warehouse == warehouse)
               & (line.delivered_by_supplier == 0))
    ).run(as_dict=True)
    committed = sum(open_stock_qty(row) for row in other_lines)
    on_hand = frappe.db.get_value("Bin", {"item_code": item_code, "warehouse": warehouse}, "actual_qty")
    return max(0, flt(on_hand) - committed)


def open_stock_qty(row):
    return max(0, flt(row.qty) - flt(row.delivered_qty)) * (flt(row.conversion_factor) or 1)


def preview(order_name):
    return calculate_shortages(frappe.get_doc("Sales Order", order_name))


def calculate_shortages(order):
    finished_stock = {}
    demand = defaultdict(float)
    for line in order.items:
        if not line.bom_no or line.delivered_by_supplier:
            continue
        key = (line.item_code, line.warehouse)
        if key not in finished_stock:
            finished_stock[key] = free_finished_stock(order, *key)
        pending = open_stock_qty(line)
        covered = min(pending, finished_stock[key])
        finished_stock[key] -= covered
        if covered == pending:
            continue
        bom = frappe.get_cached_doc("BOM", line.bom_no)
        for part in bom.exploded_items:
            warehouse = part.source_warehouse or frappe.db.get_value(
                "Item Default",
                {"parenttype": "Item", "parent": part.item_code, "company": order.company},
                "default_warehouse",
            )
            demand[(part.item_code, warehouse, part.stock_uom)] += (
                (pending - covered) * part.stock_qty / bom.quantity
            )

    rows = []
    for (item, warehouse, uom), required in demand.items():
        if not warehouse:
            rows.append(dict(item=item, warehouse=None, uom=uom, on_hand=None, on_order=None, shortage=None))
            continue
        stock = frappe.db.get_value("Bin", {"item_code": item, "warehouse": warehouse},
                                    ["actual_qty", "ordered_qty"], as_dict=True) or {}
        on_hand = flt(stock.get("actual_qty"), 6)
        on_order = flt(stock.get("ordered_qty"), 6)
        shortage = flt(required - on_hand - on_order, 6)
        if shortage > 0:
            rows.append(dict(item=item, warehouse=warehouse, uom=uom,
                             required=flt(required, 6), on_hand=on_hand,
                             on_order=on_order, shortage=shortage))
    return rows


def notify_purchasing(doc, method=None):
    if doc.docstatus != 1:
        return
    rows = calculate_shortages(doc)
    if not rows:
        return
    members = frappe.get_all("Has Role", filters={"parenttype": "User", "role": "Purchase User"}, pluck="parent")
    if not members:
        return
    users = frappe.get_all("User", filters={"enabled": 1, "user_type": "System User",
                                            "name": ["in", members]}, pluck="name")
    details = []
    for row in rows:
        item = escape(row["item"])
        if row["warehouse"]:
            details.append(f'{item}: {row["shortage"]:g} {escape(row["uom"])} short in {escape(row["warehouse"])}')
        else:
            details.append(f"{item}: configure a source warehouse to calculate shortage")
    subject = f"Material planning for {doc.name}"
    for user in users:
        if user == "Administrator" or not frappe.has_permission("Company", doc=doc.company, user=user):
            continue
        fields = dict(for_user=user, document_type="Sales Order", document_name=doc.name,
                      type="Alert", subject=subject)
        if not frappe.db.exists("Notification Log", fields):
            frappe.get_doc(dict(doctype="Notification Log", email_content="<br>".join(details),
                                **fields)).insert(ignore_permissions=True)
