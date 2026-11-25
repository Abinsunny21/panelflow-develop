import frappe  # type: ignore[import-not-found]
from frappe import _  # type: ignore[import-not-found]
from frappe.utils import get_link_to_form  # type: ignore[import-not-found]


def mobile_digits(value):
    return "".join(filter(str.isdigit, value or ""))


def validate_mobile(doc, method=None):
    digits = mobile_digits(doc.mobile_no)
    if not digits:
        return

    # Allow unrelated edits to Leads that already shared a number.
    previous = doc.get_doc_before_save()
    if previous and mobile_digits(previous.mobile_no) == digits:
        return

    leads = frappe.get_all(
        "Lead",
        filters={"mobile_no": ["is", "set"]},
        fields=["name", "mobile_no"],
        order_by="creation asc",
    )

    for lead in leads:
        if lead.name == doc.name or mobile_digits(lead.mobile_no) != digits:
            continue

        message = _("This mobile number is already used by another Lead.")
        if frappe.has_permission("Lead", "read", doc=lead.name):
            message = _("This mobile number is already used by {0}.").format(
                get_link_to_form("Lead", lead.name)
            )
        frappe.throw(message, title=_("Duplicate Mobile Number"))