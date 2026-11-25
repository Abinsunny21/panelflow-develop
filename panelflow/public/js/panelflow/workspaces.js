/**
 * PanelFlow Portal — Role-aware workspace dashboards.
 * Renders complete, visually rich dashboards for Sales/CRM, Purchase, Stock/Manufacturing,
 * and Accounts based on the user's actual effective permissions.
 */
(function () {
  "use strict";

  window.PanelFlowWorkspace = async function renderWorkspace(name) {
    function toPlainText(html) {
    if (!html) return "";
    const tmp = document.createElement("div");
    tmp.innerHTML = String(html);
    return (tmp.textContent || tmp.innerText || "").replace(/\s+/g, " ").trim();
  }

  const { call, state, esc, linkFor, listLink } = window.PanelFlowPortal;

    const workspace = state.boot?.workspaces?.find((w) => w.name === name);
    if (!workspace) return;

    const main    = document.getElementById("pf-main");
    const allowed = new Set(workspace.records.map((r) => r.doctype));
    const roles   = new Set(state.boot?.roles || []);
    const today   = new Date().toLocaleDateString("en-CA");

    const money = (value, currency = "INR") =>
      new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value || 0));

    const pct = (value) => Number(value || 0).toFixed(1) + "%";

    const query = async (doctype, fields, filters = {}) => {
      if (!allowed.has(doctype)) return [];
      try {
        const rows = [];
        for (let start = 0; ; start += 100) {
          const page = await call("frappe.client.get_list", {
            doctype,
            fields,
            filters,
            limit_start: start,
            limit_page_length: 100,
            order_by: "modified desc",
          });
          rows.push(...page);
          if (page.length < 100) break;
        }
        return rows;
      } catch (_) {
        return [];
      }
    };

    const queue = (title, doctype, rows, describe, filters = {}) => {
      const items = rows.slice(0, 8);
      return `
<section class="pf-panel pf-inbox" aria-label="${esc(title)}">
  <div class="pf-panel-head">
    <strong>${esc(title)}</strong>
    <a href="${esc(listLink(doctype, filters))}">View all (${rows.length}) →</a>
  </div>
  ${items.length
    ? items.map((row) => `
      <a class="pf-row-link" href="${esc(linkFor(doctype, row.name))}">
        <span>
          <b class="pf-row-title">${esc(row.name)}</b>
          <span class="pf-row-sub">${esc(toPlainText(describe(row)))}</span>
        </span>
        <span class="pf-count">Open →</span>
      </a>`).join("")
    : `<div class="pf-empty"><span class="pf-empty-icon">✓</span>No pending items in this queue.</div>`}
</section>`;
    };

    const chart = (title, doctype, rows, field, filters = {}, visualType = "vbar") => {
      const counts = {};
      rows.forEach((row) => {
        counts[row[field] || "Unassigned"] = (counts[row[field] || "Unassigned"] || 0) + 1;
      });
      const entries = Object.entries(counts);
      const total   = rows.length;
      const max     = Math.max(1, ...Object.values(counts));
      const colors  = ["#3D1A47", "#6B1A3A", "#B8963E", "#2D7A4F", "#1A5A8B", "#5A2870", "#A0620A"];

      if (!entries.length) {
        return `<div class="pf-chart-card"><h2>${esc(title)}</h2><div class="pf-empty">No items recorded.</div></div>`;
      }

      if (visualType === "vbar" || visualType === true) {
        return `
<div class="pf-chart-card" aria-label="${esc(title)} bar chart">
  <h2>
    <span>${esc(title)}</span>
    <span class="pf-chart-badge">${total} Total</span>
  </h2>
  <div class="pf-vbar-chart">
    ${entries.map(([label, value], idx) => {
      const heightPct = Math.max(8, Math.round((value / max) * 100));
      const col = colors[idx % colors.length];
      return `
      <a class="pf-vbar-col" href="${esc(listLink(doctype, { ...filters, [field]: label }))}" title="${esc(label)}: ${value}">
        <span class="pf-vbar-val">${value}</span>
        <div class="pf-vbar-fill-wrap">
          <div class="pf-vbar-fill" style="height:${heightPct}%;background:${col};"></div>
        </div>
        <span class="pf-vbar-label">${esc(label)}</span>
      </a>`;
    }).join("")}
  </div>
</div>`;
      }

      const conic = entries.reduce((acc, [, v], idx) => {
        const deg = (v / total) * 360;
        acc.parts.push(`${colors[idx % colors.length]} ${acc.start}deg ${acc.start + deg}deg`);
        acc.start += deg;
        return acc;
      }, { parts: [], start: 0 }).parts;

      return `
<div class="pf-chart-card" aria-label="${esc(title)} chart">
  <h2>
    <span>${esc(title)}</span>
    <span class="pf-chart-badge">${total} Total</span>
  </h2>
  <div class="pf-chart-content">
    <div class="pf-donut" style="background:conic-gradient(${conic.join(",")})" aria-hidden="true">
      <span>${total}<small>records</small></span>
    </div>
    <div class="pf-chart-rows">
      ${entries.map(([label, value], idx) => `
      <a class="pf-chart-row" href="${esc(listLink(doctype, { ...filters, [field]: label }))}" aria-label="${esc(label)}: ${value}">
        <b>${esc(label)}</b>
        <div class="pf-chart-bar-wrap">
          <span class="pf-chart-bar" style="width:${Math.max(value ? 4 : 0, Math.round(100 * value / max))}%;background:${colors[idx % colors.length]}"></span>
        </div>
        <span>${value}</span>
      </a>`).join("")}
    </div>
  </div>
</div>`;
    };

    document.getElementById("pf-current-title").textContent = name;

    main.innerHTML = `
<div class="pf-page-head">
  <div>
    <div class="pf-eyebrow">Operational Workspace</div>
    <h1>${esc(name)}</h1>
  </div>
  <div style="display:flex;gap:12px;align-items:center;">
    <select id="pf-workspace-switch" class="pf-select" aria-label="Switch workspace">
      ${state.boot.workspaces.map((w) => `<option${w.name === name ? " selected" : ""}>${esc(w.name)}</option>`).join("")}
    </select>
  </div>
</div>
<div id="pf-workspace-body" class="pf-loading">Loading operational queues…</div>`;

    document.getElementById("pf-workspace-switch").onchange = (event) => {
      location.hash = "#/workspace/" + encodeURIComponent(event.target.value);
    };

    const host = document.getElementById("pf-workspace-body");
    const sections = [];

    try {
      // ── Quick Creation Toolbar for Permitted Documents ───────────────────────
      const creationItems = [];
      for (const record of workspace.records) {
        if (record.doctype === "Bin") continue;
        try {
          const perm = await call("frappe.client.has_permission", {
            doctype: record.doctype, docname: "", perm_type: "create"
          });
          if (perm?.has_permission) {
            creationItems.push(record);
          }
        } catch (_) {}
      }

      if (creationItems.length) {
        sections.push(`
<div class="pf-panel" style="padding:18px 24px;margin-bottom:8px;">
  <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--pf-gold);margin-bottom:12px;">Quick Document Creation</div>
  <div style="display:flex;flex-wrap:wrap;gap:10px;">
    ${creationItems.map(item => `
      <a class="pf-btn primary" href="#/new/${encodeURIComponent(item.doctype)}" style="text-decoration:none;">
        + New ${esc(item.doctype)}
      </a>
    `).join("")}
  </div>
</div>`);
      }

      // ======================================================================
      // SALES AND CRM WORKSPACE
      // ======================================================================
      if (name === "Sales and CRM") {
        const isSalesManager = roles.has("Sales Manager");

        if (isSalesManager) {
          const quotations = await query("Quotation", ["name", "party_name", "grand_total", "workflow_state", "valid_till", "docstatus"]);
          const pending = quotations.filter((q) => q.docstatus === 0 && /pending/i.test(q.workflow_state || ""));
          sections.push(queue("Quotations Awaiting Manager Decision", "Quotation", pending,
            (row) => `${row.party_name || "Customer"} · ${money(row.grand_total)} · ${row.workflow_state || "Pending Approval"}`,
            { docstatus: 0 }
          ));

          const opps = await query("Opportunity", ["name", "party_name", "sales_stage", "opportunity_amount", "status", "owner"]);
          sections.push(`<div class="pf-chart-grid">${chart("Pipeline by Stage", "Opportunity", opps, "sales_stage", {}, true)}${chart("Pipeline by Salesperson", "Opportunity", opps, "owner", {}, false)}</div>`);
        } else {
          const leads = await query("Lead", ["name", "lead_name", "company_name", "status", "source", "owner"]);
          const myLeads = leads.filter((l) => !["Converted", "Lost"].includes(l.status));
          sections.push(queue("My Active Leads", "Lead", myLeads,
            (row) => `${row.lead_name || row.company_name || ""} · ${row.status || "Lead"} · ${row.source || "Direct"}`,
            {}
          ));
        }

        const todos = await query("ToDo", ["name", "description", "date", "status", "reference_type", "reference_name", "allocated_to"],
          { allocated_to: state.boot.user, status: "Open" }
        );
        const overdueTodos = todos.filter((t) => t.date && t.date <= today);
        sections.push(queue("My Scheduled Follow-ups & Reminders", "ToDo", overdueTodos,
          (row) => `${row.description || "Follow up"} · due ${row.date || "today"}${row.reference_name ? " (" + row.reference_name + ")" : ""}`,
          { allocated_to: state.boot.user, status: "Open" }
        ));

        const events = await query("Event", ["name", "subject", "starts_on", "event_category", "status"], { status: "Open" });
        sections.push(queue("Scheduled Meetings & Calls", "Event", events.slice(0, 8),
          (row) => `${row.subject} · ${row.event_category || "Meeting"} · ${row.starts_on ? row.starts_on.slice(0, 16) : ""}`,
          { status: "Open" }
        ));

        const [orders, invoices] = await Promise.all([
          query("Sales Order", ["name", "customer", "grand_total", "delivery_date", "per_delivered", "docstatus", "status"],
            { docstatus: 1, per_delivered: ["<", 100] }),
          query("Sales Invoice", ["name", "customer", "outstanding_amount", "due_date", "docstatus"],
            { docstatus: 1, outstanding_amount: [">", 0], due_date: ["<", today] }),
        ]);

        sections.push(`<div class="pf-work-queues">
          ${queue("Pending Order Deliveries", "Sales Order", orders,
            (row) => `${row.customer} · ${pct(row.per_delivered)} delivered · due ${row.delivery_date || "—"}`,
            { docstatus: 1, per_delivered: ["<", 100] })}
          ${queue("Overdue Customer Invoices", "Sales Invoice", invoices,
            (row) => `${row.customer} · ${money(row.outstanding_amount)} outstanding · due ${row.due_date}`,
            { docstatus: 1, outstanding_amount: [">", 0] })}
        </div>`);

      // ======================================================================
      // PURCHASE WORKSPACE
      // ======================================================================
      } else if (name === "Purchase") {
        const isPurchaseManager = roles.has("Purchase Manager");
        const isSeniorPurchase  = roles.has("Senior Purchase User") || roles.has("Purchase Master Manager");

        let shortageNotices = [];
        try {
          const notices = await call("panelflow.portal.get_notifications", { limit: 50 });
          shortageNotices = notices.filter((n) => /material planning|shortage/i.test(n.subject || ""));
        } catch (_) {}

        sections.push(`
<section class="pf-panel" aria-label="Material shortages">
  <div class="pf-panel-head">
    <strong>Material Shortage & Requirement Alerts</strong>
    <span class="pf-row-sub">Triggered by Sales Orders</span>
  </div>
  ${shortageNotices.length
    ? shortageNotices.slice(0, 5).map((notice) => {
        const text = String(notice.email_content || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "");
        const dest  = notice.document_type && notice.document_name
          ? `#/record/${encodeURIComponent(notice.document_type)}/${encodeURIComponent(notice.document_name)}`
          : null;
        return `
<div class="pf-shortage-group">
  <b>${esc(notice.document_name || notice.subject || "")}</b>
  <pre>${esc(text.trim())}</pre>
  ${dest ? `<a class="pf-btn primary" href="${esc(dest)}" style="margin-top:8px;">Inspect ${esc(notice.document_type)} →</a>` : ""}
</div>`;
      }).join("")
    : `<div class="pf-empty"><span class="pf-empty-icon">✓</span>No active material shortage alerts. Stock covers planned orders.</div>`}
</section>`);

        const [orders, invoices, offers] = await Promise.all([
          query("Purchase Order", ["name", "supplier", "grand_total", "workflow_state", "docstatus", "per_received", "status", "schedule_date"]),
          query("Purchase Invoice", ["name", "supplier", "outstanding_amount", "due_date", "docstatus"],
            { docstatus: 1, outstanding_amount: [">", 0] }),
          query("Supplier Quotation", ["name", "supplier", "grand_total", "valid_till", "docstatus"],
            { docstatus: 1 }),
        ]);

        if (isPurchaseManager || isSeniorPurchase) {
          const approvals = [];
          for (const row of orders.filter((r) => r.docstatus === 0 && /pending/i.test(r.workflow_state || ""))) {
            try {
              const doc = await call("panelflow.portal.get_record", { doctype: "Purchase Order", name: row.name });
              if (doc.portal_transitions?.some((t) => /approve|reject/i.test(t.action))) {
                approvals.push(row);
              }
            } catch (_) {}
          }
          sections.push(queue("Purchase Orders Awaiting My Approval", "Purchase Order", approvals,
            (row) => `${row.supplier || ""} · ${money(row.grand_total)} · ${row.workflow_state || "Pending Approval"}`,
            { docstatus: 0 }
          ));
        }

        const pending = orders.filter((r) => r.docstatus === 1 && Number(r.per_received) < 100);
        sections.push(`<div class="pf-chart-grid">
          ${chart("Procurement Orders by Status", "Purchase Order", orders, "status", {}, true)}
          ${queue("Outstanding Supplier Receipts", "Purchase Order", pending,
            (row) => `${row.supplier || ""} · ${pct(row.per_received)} received · due ${row.schedule_date || "—"}`,
            { docstatus: 1, per_received: ["<", 100] })}
        </div>`);

        sections.push(`<div class="pf-work-queues">
          ${queue("Active Supplier Quotations", "Supplier Quotation", offers,
            (row) => `${row.supplier || ""} · ${money(row.grand_total)} · valid till ${row.valid_till || "—"}`,
            { docstatus: 1 })}
          ${queue("Supplier Outstanding Dues", "Purchase Invoice", invoices,
            (row) => `${row.supplier || ""} · ${money(row.outstanding_amount)} · due ${row.due_date || "—"}`,
            { docstatus: 1, outstanding_amount: [">", 0] })}
        </div>`);

      // ======================================================================
      // STOCK AND MANUFACTURING WORKSPACE
      // ======================================================================
      } else if (name === "Stock and Manufacturing") {
        const workOrders = await query("Work Order",
          ["name", "production_item", "qty", "produced_qty", "status", "planned_start_date", "docstatus"],
          { docstatus: 1 }
        );

        sections.push(`
<section class="pf-panel" aria-label="Production progress">
  <div class="pf-panel-head">
    <strong>Production Progress & Work Order Status</strong>
    <a href="${esc(listLink("Work Order", { docstatus: 1 }))}">View all (${workOrders.length}) →</a>
  </div>
  ${workOrders.length
    ? workOrders.slice(0, 10).map((row) => {
        const prog = row.qty ? Math.round((Number(row.produced_qty) / Number(row.qty)) * 100) : 0;
        return `
<a class="pf-row-link" href="${esc(linkFor("Work Order", row.name))}">
  <span>
    <b class="pf-row-title">${esc(row.name)}</b>
    <span class="pf-row-sub">${esc(row.production_item || "")} · ${esc(row.status || "")}</span>
  </span>
  <span style="text-align:right;min-width:140px">
    <b style="font-size:12px">${Number(row.produced_qty || 0)} / ${Number(row.qty || 0)} Units (${prog}%)</b>
    <progress value="${Number(row.produced_qty || 0)}" max="${Number(row.qty || 1)}" style="width:100%;height:6px;display:block;margin-top:5px;accent-color:var(--pf-plum)" aria-label="${prog}% complete"></progress>
  </span>
</a>`;
      }).join("")
    : `<div class="pf-empty"><span class="pf-empty-icon">🏭</span>No active Work Orders in progress.</div>`}
</section>`);

        sections.push(`<div class="pf-chart-grid">
          ${chart("Work Orders by State", "Work Order", workOrders, "status", { docstatus: 1 }, true)}
          ${queue("In-Process Assemblies", "Work Order", workOrders.filter((r) => r.status === "In Process"),
            (row) => `${row.production_item || ""} · start: ${row.planned_start_date || "—"}`,
            { docstatus: 1, status: "In Process" })}
        </div>`);

        if (allowed.has("Bin")) {
          const bins = await query("Bin", ["name", "item_code", "warehouse", "actual_qty", "ordered_qty", "projected_qty"]);
          const low  = bins.filter((b) => Number(b.actual_qty) < 0 || (Number(b.projected_qty) < 0));
          sections.push(`
<section class="pf-panel" aria-label="Stock alerts">
  <div class="pf-panel-head">
    <strong>Warehouse Inventory & Low Stock Alerts</strong>
    <a href="${esc(listLink("Bin", {}))}">View Warehouse Stock →</a>
  </div>
  ${low.length
    ? `<div class="pf-table-wrap">
        <table class="pf-table">
          <thead><tr><th>Item Code</th><th>Warehouse</th><th>On Hand Qty</th><th>Projected Qty</th><th>Action</th></tr></thead>
          <tbody>${low.slice(0, 15).map((b) => `<tr>
            <td><a href="${esc(linkFor("Bin", b.name))}"><strong>${esc(b.item_code)}</strong></a></td>
            <td>${esc(b.warehouse)}</td>
            <td style="color:${Number(b.actual_qty) < 0 ? "var(--pf-danger)" : "inherit"};font-weight:600">${Number(b.actual_qty).toLocaleString("en-IN")}</td>
            <td style="color:${Number(b.projected_qty) < 0 ? "var(--pf-danger)" : "inherit"};font-weight:600">${Number(b.projected_qty).toLocaleString("en-IN")}</td>
            <td><a class="pf-btn" href="#/new/Material%20Request" style="padding:4px 10px;font-size:11px;">Raise Req</a></td>
          </tr>`).join("")}</tbody>
        </table>
      </div>`
    : `<div class="pf-empty"><span class="pf-empty-icon">✓</span>All warehouse inventory levels are healthy.</div>`}
</section>`);
        }

      // ======================================================================
      // ACCOUNTS WORKSPACE
      // ======================================================================
      } else if (name === "Accounts") {
        const [salesInvs, purchInvs] = await Promise.all([
          query("Sales Invoice", ["name", "customer", "posting_date", "due_date", "grand_total", "outstanding_amount", "status"],
            { docstatus: 1, outstanding_amount: [">", 0] }),
          query("Purchase Invoice", ["name", "supplier", "posting_date", "due_date", "grand_total", "outstanding_amount", "status"],
            { docstatus: 1, outstanding_amount: [">", 0] }),
        ]);

        sections.push(`<div class="pf-work-queues">
          ${queue("Overdue Receivable Invoices", "Sales Invoice", salesInvs.filter((i) => i.due_date && i.due_date < today),
            (row) => `${row.customer || ""} · ${money(row.outstanding_amount)} · due ${row.due_date}`,
            { docstatus: 1, outstanding_amount: [">", 0] })}
          ${queue("Overdue Payable Invoices", "Purchase Invoice", purchInvs.filter((i) => i.due_date && i.due_date < today),
            (row) => `${row.supplier || ""} · ${money(row.outstanding_amount)} · due ${row.due_date}`,
            { docstatus: 1, outstanding_amount: [">", 0] })}
        </div>`);
      }

      // ======================================================================
      // COMPREHENSIVE DOCUMENT DIRECTORY
      // ======================================================================
      sections.push(`
<section>
  <div class="pf-section-head">
    <h2>Document Registers & Records</h2>
    <span>Click any document type to browse existing records or create new entries</span>
  </div>
  <div class="pf-document-directory">
    ${workspace.records.map((record) => `
    <div class="pf-document-link">
      <div>
        <a href="${esc(listLink(record.doctype))}">
          <b>${esc(record.label)}</b>
          <small>Open register →</small>
        </a>
      </div>
      <div style="display:flex;gap:6px;">
        <a class="pf-btn" href="${esc(listLink(record.doctype))}" style="font-size:11px;padding:6px 10px;">Browse</a>
        ${record.doctype !== "Bin" ? `<a class="pf-btn primary" href="#/new/${encodeURIComponent(record.doctype)}" style="font-size:11px;padding:6px 10px;">+ New</a>` : ""}
      </div>
    </div>`).join("")}
  </div>
</section>`);

      host.className = "pf-workspace-sections";
      host.innerHTML = sections.join("");

    } catch (error) {
      host.className = "";
      host.innerHTML = `<div class="pf-error">${esc(error.message)}</div>`;
    }
  };

})();
