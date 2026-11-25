app_name = "panelflow"
app_title = "PanelFlow ERP"
app_publisher = "Abin"
app_description = "	Integrated Electrical Panel Manufacturing and Business Management System"
app_email = "abinsunny216@gmail.com"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "panelflow",
# 		"logo": "/assets/panelflow/logo.png",
# 		"title": "PanelFlow ERP",
# 		"route": "/panelflow",
# 		"has_permission": "panelflow.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/panelflow/css/panelflow.css"
# app_include_js = "/assets/panelflow/js/panelflow.js"

# include js, css files in header of web template
# web_include_css = "/assets/panelflow/css/panelflow.css"
# web_include_js = "/assets/panelflow/js/panelflow.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "panelflow/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "panelflow/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "panelflow.utils.jinja_methods",
# 	"filters": "panelflow.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "panelflow.install.before_install"
# after_install = "panelflow.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "panelflow.uninstall.before_uninstall"
# after_uninstall = "panelflow.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "panelflow.utils.before_app_install"
# after_app_install = "panelflow.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "panelflow.utils.before_app_uninstall"
# after_app_uninstall = "panelflow.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "panelflow.notifications.get_notification_config"

# Awesome Bar
# -----------
# Extra search results: list of dicts with label, description, route, index.
# route: ["List", "ToDo"], "/desk/docs/some/page", or "https://example.com"
# awesomebar_search = ["panelflow.search.awesomebar_results"]

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

doc_events = {
    "Sales Order": {
        "before_naming": "panelflow.sales_order.set_customer_group_series",
        "on_submit": "panelflow.material_planning.notify_purchasing",
    },

    "Lead": {
        "validate": "panelflow.lead.validate_mobile",
    },
}

# Scheduled Tasks
# ---------------

scheduler_events = {
# 	"all": [
# 		"panelflow.tasks.all"
# 	],
    "daily": [
        "panelflow.lead_reminders.send_due_reminders"
        ],
# 	"hourly": [
# 		"panelflow.tasks.hourly"
# 	],
# 	"weekly": [
# 		"panelflow.tasks.weekly"
# 	],
# 	"monthly": [
# 		"panelflow.tasks.monthly"
# 	],
}

# Testing
# -------

# before_tests = "panelflow.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "panelflow.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "panelflow.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["panelflow.utils.before_request"]
# after_request = ["panelflow.utils.after_request"]

# Job Events
# ----------
# before_job = ["panelflow.utils.before_job"]
# after_job = ["panelflow.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"panelflow.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

fixtures = [
    {
        "dt": "Custom Field",
        "filters": [
            ["dt", "=", "Customer Group"],
            ["fieldname", "=", "custom_panelflow_sales_order_prefix"],
        ],
    },
]

# Public web portal routes. Desk remains the default for authenticated System Users.
website_route_rules = [
    {"from_route": "/panelflow", "to_route": "panelflow"},
]
