frappe.query_reports["PanelFlow Sales Order Delivery Tracking"] = {
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
            fieldname: "customer",
            label: __("Customer"),
            fieldtype: "Link",
            options: "Customer",
        },
        {
            fieldname: "sales_order",
            label: __("Sales Order"),
            fieldtype: "Link",
            options: "Sales Order",
            get_query() {
                return {
                    filters: {
                        docstatus: 1,
                        company: frappe.query_report.get_filter_value(
                            "company"
                        ),
                    },
                };
            },
        },
        {
            fieldname: "item_code",
            label: __("Item"),
            fieldtype: "Link",
            options: "Item",
        },
        {
            fieldname: "delivery_status",
            label: __("Delivery Status"),
            fieldtype: "Select",
            options: [
                "",
                "Pending",
                "Partially Delivered",
                "Fully Delivered",
            ],
        },
    ],

    formatter(value, row, column, data, default_formatter) {
        const formatted = default_formatter(
            value, row, column, data
        );

        if (!data || column.fieldname !== "delivery_status") {
            return formatted;
        }

        const colors = {
            "Pending": "var(--orange-600)",
            "Partially Delivered": "var(--blue-600)",
            "Fully Delivered": "var(--green-600)",
        };

        const color = colors[data.delivery_status];
        if (!color) {
            return formatted;
        }

        return (
            `<span style="color:${color};font-weight:600">` +
            formatted +
            "</span>"
        );
    },
};