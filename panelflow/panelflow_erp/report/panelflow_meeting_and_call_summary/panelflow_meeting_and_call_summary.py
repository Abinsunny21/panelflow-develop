import frappe
from frappe import _
from frappe.utils import add_days, getdate


def execute(filters=None):
    filters = frappe._dict(filters or {})
    categories = ("Meeting", "Call")
    statuses = ("Open", "Completed")
    conditions = [
        ["event_category", "in", categories],
        ["status", "in", statuses],
    ]
    if filters.from_date and filters.to_date and getdate(filters.from_date) > getdate(filters.to_date):
        frappe.throw(_("From Date must be on or before To Date."))
    if filters.from_date:
        conditions.append(["starts_on", ">=", getdate(filters.from_date)])
    if filters.to_date:
        conditions.append(["starts_on", "<", add_days(getdate(filters.to_date), 1)])
    for field in ("event_category", "status", "owner"):
        if filters.get(field):
            conditions.append([field, "=", filters[field]])

    columns = [
        dict(fieldname="event", label=_("Event"), fieldtype="Link", options="Event", width=105),
        dict(fieldname="event_category", label=_("Activity"), fieldtype="Data", width=95),
        dict(fieldname="subject", label=_("Subject"), fieldtype="Data", width=240),
        dict(fieldname="starts_on", label=_("Starts On"), fieldtype="Datetime", width=165),
        dict(fieldname="status", label=_("Status"), fieldtype="Data", width=110),
        dict(fieldname="owner", label=_("Event Owner"), fieldtype="Link", options="User", width=180),
        dict(fieldname="reference_doctype", label=_("Linked Type"), fieldtype="Data", width=110),
        dict(fieldname="reference_docname", label=_("Linked Record"), fieldtype="Dynamic Link",
             options="reference_doctype", width=190),
    ]
    events = frappe.get_list(
        "Event", filters=conditions, fields=["name as event", "event_category", "subject",
                                            "starts_on", "status", "owner"],
        order_by="starts_on asc, name asc", limit_page_length=0,
    )
    if not events:
        return columns, []

    event_names = [row.event for row in events]
    references = {"Lead", "Opportunity"}
    if filters.reference_doctype:
        references.intersection_update([filters.reference_doctype])
    links = frappe.get_all(
        "Event Participants",
        filters={"parent": ["in", event_names], "parenttype": "Event",
                 "parentfield": "event_participants", "reference_doctype": ["in", list(references)]},
        fields=["parent", "reference_doctype", "reference_docname"], order_by="idx asc",
    ) if references else []

    visible = {}
    for doctype in references:
        names = {link.reference_docname for link in links if link.reference_doctype == doctype}
        if names and frappe.has_permission(doctype, "read"):
            visible[doctype] = set(frappe.get_list(
                doctype, filters={"name": ["in", list(names)]}, pluck="name", limit_page_length=0,
            ))

    by_event = {}
    for link in links:
        if link.reference_docname in visible.get(link.reference_doctype, ()):
            by_event.setdefault(link.parent, {})[(link.reference_doctype, link.reference_docname)] = None

    counts = {status: {category: 0 for category in categories} for status in statuses}
    rows = []
    for event in events:
        if event.event in by_event:
            counts[event.status][event.event_category] += 1
        for doctype, name in by_event.get(event.event, {}):
            rows.append(dict(event, reference_doctype=doctype, reference_docname=name))
    chart = {
        "type": "bar",
        "height": 240,
        "data": {
            "labels": [_(category) for category in categories],
            "datasets": [
                {"name": _(status), "values": [counts[status][category] for category in categories]}
                for status in statuses
            ],
        },
    }
    return columns, rows, None, chart if rows else None
