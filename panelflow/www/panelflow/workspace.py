import frappe
from urllib.parse import urlencode

no_cache = 1

def get_context(context):
    if frappe.session.user == "Guest":
        frappe.redirect("/panelflow/login?" + urlencode({"redirect-to": "/panelflow/workspace"}))
    if frappe.db.get_value("User", frappe.session.user, "user_type") != "System User":
        frappe.throw("PanelFlow is available to staff accounts.", frappe.PermissionError)
    context.no_cache = 1
    context.title = "PanelFlow ERP"
    context.user = frappe.session.user
    context.csrf_token = frappe.sessions.get_csrf_token()
    return context
