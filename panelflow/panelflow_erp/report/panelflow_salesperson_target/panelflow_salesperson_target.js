frappe.query_reports["PanelFlow Salesperson Target"] = {
    filters: [
        {
            fieldname: "company", label: __("Company"), fieldtype: "Link",
            options: "Company", reqd: 1, default: frappe.defaults.get_user_default("Company")
        },
        {
            fieldname: "month", label: __("Month (select any date)"), fieldtype: "Date",
            reqd: 1, default: frappe.datetime.get_today()
        },
        {
            fieldname: "sales_person", label: __("Sales Person"), fieldtype: "Link",
            options: "Sales Person"
        }
    ]
};
