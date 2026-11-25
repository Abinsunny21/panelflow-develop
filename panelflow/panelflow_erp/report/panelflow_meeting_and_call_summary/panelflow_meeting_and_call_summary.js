frappe.query_reports["PanelFlow Meeting and Call Summary"] = {
    onload(report) {
        if (frappe.model.can_read("Event")) {
            report.page.add_inner_button(
                __("Open Event List"),
                () => frappe.set_route("List", "Event", "List"),
                __("Actions")
            );
        }
    },
    filters: [
        {fieldname: "from_date", label: __("From Date"), fieldtype: "Date",
            default: frappe.datetime.month_start()},
        {fieldname: "to_date", label: __("To Date"), fieldtype: "Date",
            default: frappe.datetime.month_end()},
        {fieldname: "event_category", label: __("Activity"), fieldtype: "Select",
            options: ["", "Meeting", "Call"]},
        {fieldname: "status", label: __("Status"), fieldtype: "Select",
            options: ["", "Open", "Completed"]},
        {fieldname: "owner", label: __("Event Owner"), fieldtype: "Link", options: "User"},
        {fieldname: "reference_doctype", label: __("Linked Type"), fieldtype: "Select",
            options: ["", "Lead", "Opportunity"]},
    ],
};
