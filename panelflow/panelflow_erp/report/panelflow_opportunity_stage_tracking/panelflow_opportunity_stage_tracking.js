frappe.query_reports["PanelFlow Opportunity Stage Tracking"] = {
    filters: [
        {
            fieldname: "company",
            label: __("Company"),
            fieldtype: "Link",
            options: "Company",
            default: frappe.defaults.get_user_default("Company"),
            reqd: 1,
        },
        {
            fieldname: "from_date",
            label: __("From Date"),
            fieldtype: "Date",
            default: frappe.datetime.month_start(),
        },
        {
            fieldname: "to_date",
            label: __("To Date"),
            fieldtype: "Date",
            default: frappe.datetime.get_today(),
        },
        {
            fieldname: "opportunity_owner",
            label: __("Opportunity Owner"),
            fieldtype: "Link",
            options: "User",
        },
        {
            fieldname: "sales_stage",
            label: __("Sales Stage"),
            fieldtype: "Link",
            options: "Sales Stage",
        },
    ],
};
