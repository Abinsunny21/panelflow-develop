
import frappe  # pyright: ignore[reportMissingImports]
from frappe.utils import today  # pyright: ignore[reportMissingImports]


def send_due_reminders():
    tasks = frappe.get_all(
        "ToDo",
        filters={
            "reference_type": "Lead",
            "status": "Open",
            "date": ["<=", today()],
            "allocated_to": ["is", "set"],
        },
        fields=["name", "reference_name", "allocated_to", "date"],
    )

    for task in tasks:
        if not task.reference_name:
            continue

        lead_status = frappe.db.get_value("Lead", task.reference_name, "status")
        if not lead_status or lead_status in ("Converted", "Closed", "Do Not Contact"):
            continue

        subject = f"Lead follow-up due {task.date}: {task.reference_name}"
        reminder = {
            "for_user": task.allocated_to,
            "document_type": "ToDo",
            "document_name": task.name,
            "subject": subject,
            "type": "Alert",
        }

        if not frappe.db.exists("Notification Log", reminder):
            frappe.get_doc({"doctype": "Notification Log", **reminder}).insert(
                ignore_permissions=True
            )