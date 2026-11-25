# PanelFlow portal traceability

Scope follows the user's project request. The attached PDF is marked proposed and pending management approval; it provides architectural context, not additional implementation instructions.

## Authorization and navigation

The portal resolves visible workspaces, DocTypes, reports, records, notification links, and workflow transitions from the active Frappe user and installed permissions. It does not infer actions from a title or email address. Workflow writes use Frappe's `apply_workflow`; reports use the installed Query Report API. Complex document operations open the exact standard Desk form so ERPNext mapping, taxes, stock, and accounting logic remain native.

| Requirement / existing feature | Permitted users (live site configuration) | Portal page/action | Acceptance check |
|---|---|---|---|
| Quotation approval workflow and threshold | Sales User for configured draft submission; Sales Manager for manager transitions; effective workflow permissions decide actual action | Sales and CRM → Quotation → record → current workflow actions | Verified installed workflow, threshold 100,000, and native transition list wiring. Write transition remains pending non-admin browser check. |
| Sales Order item delivery tracking | Users with Sales Order read/report permission; custom report roles include Sales User, Sales Manager, System Manager | Sales Order detail and `PanelFlow Sales Order Delivery Tracking` | COR-0001 reconciled: 10 ordered, 6 delivered, 4 pending. |
| Overdue Sales Invoice reminders | Sales User and any user with invoice/report access; notification recipients are configured as Sales User | Overview queue; actual current-user Notification Logs in bell | Dashboard invoice queue and notification read path are permission-filtered. Reading the portal does not create alerts. |
| Sales Return eligibility validation | Users permitted to create Sales Invoices/Returns under ERPNext permissions | Open the original invoice/return form in Desk; use standard return mapping | Not write-tested in portal; native validation remains on the standard ERPNext form. |
| Monthly salesperson target and achievement | Accounts Manager, Accounts User, Employee Self Service, Sales Manager, Sales User as installed report roles | Reports → `PanelFlow Salesperson Target` | Ran via installed report runner; current output showed ₹600,000 target and ₹500,000 achieved (83.33%). Credit-note month/achievement interpretation is pending mentor decision. |
| Tiered Purchase Order approvals | Purchase User, Purchase Manager, System Manager according to configured transitions and effective permissions; senior/manager distinctions preserved | Purchase → Purchase Order → record → current workflow actions | Installed state graph/thresholds inspected: manager 100,000; senior 500,000. Action write remains pending non-admin browser check. |
| Pending receipt tracking | Users with Purchase Order / Purchase Receipt read permission | Overview needs-attention and filtered Purchase Order/Receipt lists; exact record opens | Live pending receipt queue shown. |
| Supplier quotation comparison | Purchase User, Purchase Manager, System Manager per report metadata | Reports → `PanelFlow Supplier Quotation Comparison` | Ran through installed report runner. Tax/freight evaluation decision remains pending mentor review. |
| Supplier invoice dues and ageing | Users permitted to run Accounts Payable reports and read linked Purchase Invoices | Accounts → invoice lists and Accounts Payable / Summary reports | Accounts Payable and Summary ran with installed filters; default data produced no matching rows. |
| Partial and cumulative Purchase Receipt validation | Purchase User or other users with standard Purchase Receipt create/submit permissions | Open mapped Purchase Receipt form from the order in Desk | Existing ERPNext validation/mapping retained; write path not exercised in the portal session. |
| Lead territory/source assignment with fallback | Users with Lead read/write permissions; assignment rules target their configured users | Sales and CRM → Leads; assignment is performed by existing server rules | Active rules and fallback inspected. Assignment write test pending. |
| Duplicate Lead detection | Users with Lead create permission | Create Lead through Desk; standard server validation/hooks apply | Existing implementation preserved; write test pending. |
| Lead follow-up reminders | Users with ToDo/Lead visibility and configured recipients | Overview own follow-ups; Leads and ToDo lists | Read lists use `frappe.get_list`; exact reminder write not exercised. |
| Opportunity stage tracking | Sales User and Sales Manager per installed report roles | Sales and CRM → Opportunities; `PanelFlow Opportunity Stage Tracking` | Custom report ran and returned current stage data. |
| Meeting and Call Summary | Sales User and Sales Manager per installed report roles | Reports → `PanelFlow Meeting and Call Summary`; Event list | Report ran with current rows EV00002/EV00001. |
| BOM material planning and alert behavior | Sales Order readers for shortage view; purchasing users receive existing Frappe bell alerts | Sales Order detail → read-only component shortage table | COR-0001 shortage reconciled against current calculation. The supplied flow's alert hook is only triggered by Sales Order submit; portal reads never trigger alerts. Fully-covered/no-alert case remains deferred. |

## Report catalog

The five custom report names are unchanged. The catalog additionally exposes enabled relevant standard reports, including Purchase Order Analysis, Accounts Payable, Accounts Payable Summary, BOM Stock Report, and prepared Stock Balance, only where the signed-in user passes installed report permission checks. The first four were run through Frappe's report engine. Stock Balance is flagged as prepared; generation/rebuild state was not triggered during verification to avoid queuing a site job.

## Verification boundary

Automated permission checks were performed for the available Sales User, Sales Manager, Purchase User, Senior Purchase, and Purchase Manager profiles, including allowed and cross-module denied list/report access. Browser interaction was performed only in the available Administrator session. No role credentials were supplied, so non-admin sign-in, logout, workflow writes, and record-level user-to-user isolation still need browser evidence. See the handover document for the exact checks to close.
