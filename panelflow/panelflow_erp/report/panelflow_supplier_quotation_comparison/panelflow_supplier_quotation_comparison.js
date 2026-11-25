frappe.query_reports["PanelFlow Supplier Quotation Comparison"] = {
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
            default: frappe.datetime.add_months(
                frappe.datetime.get_today(), -1
            ),
            reqd: 1,
        },
        {
            fieldname: "to_date",
            label: __("To Date"),
            fieldtype: "Date",
            default: frappe.datetime.get_today(),
            reqd: 1,
        },
        {
            fieldname: "item_code",
            label: __("Item"),
            fieldtype: "Link",
            options: "Item",
        },
        {
            fieldname: "supplier",
            label: __("Supplier"),
            fieldtype: "Link",
            options: "Supplier",
        },
        {
            fieldname: "request_for_quotation",
            label: __("Request for Quotation"),
            fieldtype: "Link",
            options: "Request for Quotation",
        },
        {
            fieldname: "include_expired",
            label: __("Include Expired"),
            fieldtype: "Check",
            default: 0,
        },
    ],

    formatter(value, row, column, data, default_formatter) {
        const formatted = default_formatter(
            value, row, column, data
        );

        if (
            data &&
            data.lowest &&
            ["evaluated_rate", "evaluation"].includes(column.fieldname)
        ) {
            return (
                '<span style="color:var(--green-600);font-weight:600">' +
                formatted +
                "</span>"
            );
        }

        if (
            data &&
            data.expired &&
            column.fieldname === "evaluation"
        ) {
            return (
                '<span style="color:var(--red-600)">' +
                formatted +
                "</span>"
            );
        }

        return formatted;
    },
};