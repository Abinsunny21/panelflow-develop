import frappe
from urllib.parse import urlencode

no_cache = 1

def get_context(context):
    # Give native password, OTP and OAuth flows the same safe portal default.
    # If the user came from another protected internal URL, keep that target.
    request = frappe.local.request
    if not request.args.get("redirect-to"):
        args = request.args.to_dict(flat=False)
        args["redirect-to"] = ["/panelflow/workspace"]
        frappe.local.flags.redirect_location = f"{request.path}?{urlencode(args, doseq=True)}"
        raise frappe.Redirect

    # Reuse Frappe v15's native login setup and security behavior.
    from frappe.www.login import get_context as native_login_context
    native_login_context(context)
    context.app_name = "PanelFlow ERP"
    context.title = "Sign in to PanelFlow"
    return context
