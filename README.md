# PanelFlow ERP

PanelFlow ERP is a Frappe application for an electrical-panel manufacturing
business. It extends ERPNext v15 with Sales, Purchase, CRM, inventory-planning,
reporting, and portal features while keeping ERPNext documents and Frappe
permissions as the system of record.

> **Project status:** The supplied requirements document describes a broader
> proposed ERP solution than the custom code currently in this repository.
> This README separates implemented app features from site configuration and
> requirements that remain proposed or incomplete. Workflows, roles, and
> assignment rules configured directly in a Frappe site may not be represented
> in version-controlled app files.

## Project overview

The business has Sales, Purchase, Manufacturing, Service, HR, and Management
teams. PanelFlow is intended to connect customer demand to procurement and
production, while using standard ERPNext modules for transactions, stock,
accounting, and employee processes.

The application currently contains:

- Server-side Sales Order and Lead customizations.
- Material-shortage calculation and Purchase User alerts when a Sales Order is
  submitted.
- Daily reminders for due Lead follow-up ToDos.
- Five custom operational reports.
- A permission-aware web portal for supported workspaces, records, search,
  reports, and actions.
- A PanelFlow Settings DocType for approval-limit values.

The requirements brief also proposes Asset/Maintenance, Attendance/Payroll,
Sales reward points, expanded dashboards, and additional validations/reports.
Those are not all implemented by this app; see
[Requirements coverage](#requirements-coverage).

## Business goals and usefulness

PanelFlow aims to help the business:

- Track customer demand from Lead and Quotation through Sales Order,
  delivery, and invoicing.
- Identify raw-material shortages against BOM requirements before purchase
  and production work is planned.
- Coordinate Purchase and Manufacturing through shared ERPNext records and
  notifications.
- Give each team a focused view of its permitted documents, queues, and
  reports.
- Reduce duplicate data entry by retaining standard ERPNext document
  mappings, validations, stock updates, and accounting logic.
- Keep the standard Frappe Desk available for administration and work that
  needs its complete native interface.

## Proposed system

The proposed solution is built on these layers:

1. **ERPNext standard modules** provide CRM, Selling, Buying, Stock,
   Manufacturing, Accounts, and (where installed) Asset and HR functionality.
2. **PanelFlow app code** adds targeted validations, numbering rules,
   shortage calculations, reminders, reports, and portal integration.
3. **Frappe site configuration** defines roles, User Permissions, workflows,
   assignment rules, approval states, and report access.
4. **PanelFlow web portal** presents supported daily work in a responsive
   interface without replacing Desk or the underlying document lifecycle.

Prefer standard ERPNext configuration before adding custom code. The app should
not create separate copies of ERPNext transactions or grant access based only
on a role label in the browser.

### End-to-end business workflows

#### Sales to delivery

1. Sales creates and maintains a Lead, Opportunity, and Quotation in ERPNext.
2. The configured Quotation workflow routes quotations for approval when
   required.
3. After customer acceptance, an authorized user creates a Sales Order using
   the standard ERPNext mapping.
4. PanelFlow sets the order's naming series from the Customer Group prefix.
5. On Sales Order submission, PanelFlow compares open demand, finished stock,
   BOM component requirements, and on-order quantities. It sends a
   Notification Log alert to eligible Purchase Users when components are short.
6. ERPNext users plan production and deliveries using BOMs, Work Orders,
   Delivery Notes, and the Sales Order delivery-tracking report.
7. Sales Invoices, returns, and collections continue through standard
   ERPNext documents and accounting rules.

#### Procurement

1. Purchase Users review shortage alerts and determine which items to procure.
2. The team uses standard Material Requests, Requests for Quotation, Supplier
   Quotations, Purchase Orders, Purchase Receipts, and Purchase Invoices.
3. The Supplier Quotation Comparison report supports comparison of submitted
   quotations.
4. Purchase Order approval and receipt behavior depend on active site
   workflows and ERPNext validations.

PanelFlow calculates and reports shortages; it does not automatically create
Purchase Orders or block Work Order creation when materials are unavailable.

#### CRM and follow-up

1. Leads can be assigned through configured Frappe Assignment Rules.
2. PanelFlow checks normalized mobile digits to identify duplicate Leads.
3. Sales users record follow-ups as ToDos and meetings/calls as Events.
4. The daily scheduler notifies the assigned user about an overdue open Lead
   follow-up when the Lead remains active.
5. Users review Opportunities by stage and CRM activity through the custom
   reports.

Lead assignment rules are site configuration; the app does not implement a
separate territory/source assignment engine.

#### Manufacturing, service, and people operations

ERPNext BOMs, stock records, and Work Orders support standard manufacturing
planning. The app's shortage calculation helps identify material gaps but does
not enforce a production-start gate or provide a custom production quantity
control system.

The source requirements also describe factory Asset records, maintenance every
90 days, attendance, production-only overtime, payroll summaries, and
salesperson collection reward points. These are future scope for PanelFlow's
custom implementation. They may use standard ERPNext features or separately
installed Frappe applications, but this repository does not currently implement
those functions.

## Current functionality

### Core custom logic

- **Sales Order numbering:** A Customer Group can store a
  `PanelFlow Sales Order Prefix` (`custom_panelflow_sales_order_prefix`).
  New Sales Orders use that prefix with a four-digit naming series. Prefixes
  must start with an uppercase letter and contain only uppercase letters and
  digits. Amendments retain the original naming series.
- **Lead duplicate check:** Mobile values are normalized to digits and checked
  against existing Leads. Unrelated edits to an existing duplicate are
  allowed. The validation links to the matching Lead only when the current user
  may read it. Email-based duplicate detection is not implemented.
- **Material planning:** For submitted Sales Orders, the app calculates
  unfulfilled demand, allocates available finished stock while accounting for
  other open Sales Orders, explodes BOM requirements, and compares component
  demand with warehouse on-hand and on-order quantities.
- **Purchase shortage alerts:** Shortages create Notification Log alerts for
  enabled Purchase Users who have permission for the order's company.
  Administrator is not added as a shortage-alert recipient. Reading a Sales
  Order does not trigger an alert.
- **Lead follow-up reminders:** The daily scheduler creates a reminder for an
  overdue, open ToDo linked to an active Lead. Existing matching notifications
  are not duplicated.
- **PanelFlow Settings:** The System Manager-only single DocType stores
  quotation, Purchase Manager, and Purchase Senior limit values. Defaults are
  100,000, 100,000, and 500,000; values must be finite and positive, and the
  senior purchase limit must be greater than the manager limit.

The settings values are stored and validated by the app. Approval routing,
states, role assignments, and conditions are governed by active Frappe
Workflow configuration; the settings DocType does not itself create or alter a
workflow.

### Portal and Desk

The portal is available at `/panelflow/workspace`, with sign-in at
`/panelflow/login`. It provides Overview, Sales and CRM, Purchase, Stock and
Manufacturing, Accounts, Search, Reports, record lists/details, supported
forms, and Notification Log views.

Workspaces, document types, reports, records, and actions are filtered using
Frappe permissions. Search uses the existing Frappe DocType search API for
types made available to the signed-in user. Create/edit/submit/cancel and
workflow actions are checked against the corresponding permission or current
workflow transitions. Server-side authorization remains authoritative.

The standard Desk remains available at `/app`. Portal-specific CSS and
JavaScript are loaded by the portal page and do not replace the Desk theme or
business logic.

### Custom reports

The app defines these Script Reports:

| Report | Purpose |
|---|---|
| PanelFlow Meeting and Call Summary | Summarizes recorded meeting and call activity. |
| PanelFlow Opportunity Stage Tracking | Reports Opportunities by sales stage and related values. |
| PanelFlow Sales Order Delivery Tracking | Tracks ordered, delivered, and pending quantities. |
| PanelFlow Salesperson Target | Compares salesperson targets and sales achievement. |
| PanelFlow Supplier Quotation Comparison | Compares Supplier Quotations. |

The portal can also expose relevant standard ERPNext reports when the current
user is permitted to run them. Reports are loaded and executed through Frappe's
report APIs and definitions.

## Requirements coverage

The table below describes the current custom-app scope. “Site configured”
means the behavior depends on Workflow, Assignment Rule, role, or other
configuration stored on a Frappe site and is not necessarily installed by app
code.

| Requirement from the brief | Current status |
|---|---|
| Customer categories and type-based Sales Order numbers | The app provides a Customer Group prefix field and numbering hook. Configure Government, Corporate, Retail (or the required groups) and their prefixes on the site. |
| Quotation approval by value | Uses Frappe Workflow/site configuration. PanelFlow Settings stores limit values but does not automatically create or route a workflow. Verify the active workflow against the required thresholds. |
| Sales Order delivery tracking | Custom report implemented. |
| Overdue Sales Invoice reminder | The portal Overview can show overdue submitted invoices with outstanding balances. An automatic invoice reminder notification is not implemented by this app. |
| Sales Return reference and quantity validation | Use standard ERPNext return mapping and validation. No additional PanelFlow return-eligibility validator is implemented. |
| Salesperson target/achievement | Custom report implemented. Confirm the business treatment of returns/credit notes before relying on net-sales totals. |
| Purchase Order approval by value | Uses site-configured Frappe Workflows. Approval thresholds/settings are stored, but routing must be configured and verified on the site. |
| Pending Purchase Order receipts | Portal queues and standard ERPNext reports support operational tracking. A dedicated custom item-level pending-receipt report is not included. |
| Supplier Quotation comparison | Custom report implemented. Confirm how taxes, freight, and evaluated rates should affect the lowest-quote decision. |
| Purchase Invoice due-date/outstanding tracker | Standard Accounts Payable reports are available to permitted users. A separate custom ageing tracker is not included. |
| Excess Purchase Receipt quantity validation | Relies on standard ERPNext behavior and mapped forms; no additional PanelFlow validator is implemented. |
| Lead assignment by territory/source | Can use configured Frappe Assignment Rules. A custom PanelFlow assignment engine is not included. |
| Due Lead follow-up reminders | Daily scheduler implementation included. |
| Opportunity stage tracking | Custom report implemented. |
| Duplicate Lead detection | Normalized mobile-number check implemented. Email duplicate detection is not included. |
| Meeting and call activity summary | Custom report implemented. |
| BOM-based raw-material shortage visibility and Purchase notification | Implemented for submitted Sales Orders; this does not automatically create Purchase Orders or block production. |
| Work Order planned/in-progress/completed dashboard | Standard Work Orders remain available; the requested consolidated production dashboard is not implemented as a custom feature. |
| Asset register and maintenance | The brief covers CNC machines, compressors, and testing equipment, with maintenance every 90 days and alerts for upcoming work. Not implemented in this app. |
| Attendance and payroll | The brief covers daily attendance for Production, Sales, and Administration; overtime for Production employees; basic salary, overtime, and attendance-deduction calculations; and department-wise monthly payroll summaries. Not implemented in this app. |
| Salesperson reward points based on collections | Not implemented in this app. The brief's rule is below ₹50,000: 1 point per ₹10,000; ₹50,000–₹1,00,000: 8 points; above ₹1,00,000: 15 points. |
| Management dashboard | The brief requests total Sales Orders, pending purchases, production status, assets due for maintenance, employee count, monthly payroll cost, and salesperson reward points. The portal Overview provides selected order, sales, purchasing, CRM, and follow-up views; the full cross-department dashboard is not implemented. |

The requirements brief asks for a proposed solution and timeline before
implementation approval. No approved project schedule is recorded in this
repository; do not treat the future-scope items above as delivered features.

## User access and configuration

- Portal users must be enabled Frappe **System Users**.
- Assign standard Frappe roles, DocType permissions, User Permissions, report
  roles, and workflow transitions for each team.
- Configure active Workflows for Quotation and Purchase Order approvals.
- Configure Customer Groups and set an uppercase prefix for each group that
  requires custom Sales Order numbering (for example `GOV`, `COR`, and `RET`).
- Configure BOMs, item warehouses, default/source warehouses, and stock levels
  for material planning.
- Assign Lead follow-up ToDos and enable the Frappe scheduler for daily
  reminders.
- Configure Frappe Assignment Rules if Leads should be assigned by territory
  or source.
- For Asset and HR/payroll requirements, select and configure the appropriate
  standard ERPNext/Frappe modules before planning PanelFlow custom work.

## Code map

| Path | Responsibility |
|---|---|
| `panelflow/hooks.py` | Sales Order/Lead document events, daily reminder scheduler, custom-field fixture, and portal route rule. |
| `panelflow/sales_order.py` | Customer Group-based Sales Order naming series. |
| `panelflow/lead.py` | Duplicate Lead mobile validation. |
| `panelflow/material_planning.py` | Finished-stock allocation, BOM shortage calculation, and Purchase User alerts. |
| `panelflow/lead_reminders.py` | Daily notifications for due Lead follow-up ToDos. |
| `panelflow/portal.py` | Permission-filtered portal bootstrap, Overview, record reads, notifications, and report access helpers. |
| `panelflow/public/js/portal.js` | Portal routing, lists, records, search, reports, notifications, and permission-aware actions. |
| `panelflow/public/js/workspaces.js` | Sales, Purchase, Stock/Manufacturing, and Accounts workspaces. |
| `panelflow/public/js/forms.js` | Metadata-driven forms, ERPNext document mappings, and permission checks. |
| `panelflow/public/css/portal.css` | Portal-only styling and responsive layout. |
| `panelflow/www/panelflow/` | Website landing, login, and authenticated workspace pages. |
| `panelflow/panelflow_erp/doctype/` | PanelFlow Settings DocType and validation. |
| `panelflow/panelflow_erp/report/` | Five custom Script Reports and their definitions. |
| `panelflow/fixtures/custom_field.json` | Customer Group Sales Order prefix field. |

## Technical requirements

- Frappe Framework **v15** and ERPNext **v15** installed in the same Bench.
- Python **3.10 or later**. The project CI currently uses Python 3.10.
- A database and Redis services supported by the installed Frappe Bench. CI
  currently tests with MariaDB 10.6 and Redis.
- Node.js 18 and Yarn for the asset-build path used in CI; use versions
  compatible with the installed Bench for local builds.
- An installed Frappe site and users/roles configured for the desired
  functionality.

Frappe and ERPNext are managed by Bench. The app declares no additional Python
runtime dependencies in `pyproject.toml`.

## Installation

From an existing Bench:

```bash
cd ~/frappe-bench
bench get-app <repository-url> --branch develop
bench --site <site-name> install-app panelflow
bench --site <site-name> migrate
bench build --apps panelflow
bench --site <site-name> clear-cache
```

Replace `<repository-url>` and `<site-name>` with the repository URL and Frappe
site name. Skip `bench get-app` if the app source is already in the Bench.

After installation:

1. Confirm the `panelflow` app is installed on the site.
2. Configure roles, User Permissions, Workflows, reports, and Assignment Rules.
3. Add Customer Group prefixes and configure the required BOM/warehouse data.
4. Open `/panelflow/login` and use `/panelflow/workspace` for portal work.
5. Use `/app` for the standard Frappe Desk.

## Development and validation

Run the app tests:

```bash
bench --site <site-name> run-tests --app panelflow
```

Build portal assets after changing JavaScript or CSS:

```bash
bench build --apps panelflow
```

Install and run the repository's pre-commit checks:

```bash
pip install pre-commit
pre-commit install
pre-commit run --all-files
```

GitHub Actions runs the app test suite and configured lint/security checks.
See `.github/workflows/ci.yml` and `.github/workflows/linter.yml` for details.

## Conclusion

PanelFlow is a targeted ERPNext extension for connecting Sales, Purchasing,
CRM, inventory planning, and manufacturing visibility. Its current custom
features complement ERPNext rather than replace it. The attached requirements
also include Asset/Maintenance, HR/payroll, reward points, and broader
management reporting; these need separate implementation planning, approval,
and acceptance testing before they can be considered part of the delivered
system.

## License

MIT. See [`license.txt`](license.txt).
