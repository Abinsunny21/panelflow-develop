import frappe

no_cache = 1

def get_context(context):
    context.no_header = True
    context.signed_in = frappe.session.user != "Guest"
    return context
