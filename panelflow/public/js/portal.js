/**
 * PanelFlow Portal — Main SPA router, API layer, notifications, search, reports.
 * Carries forward all working API calls from the previous portal.js.
 * Scoped entirely inside the IIFE. No global pollution except window.PanelFlowPortal.
 */
(function () {
  "use strict";

  const root = document.getElementById("pf-portal");
  if (!root) return;

  document.body.classList.add("pf-portal-body");

  // ── Core refs ──────────────────────────────────────────────────────────────
  const csrfNode = document.querySelector('meta[name="csrf-token"]');
  const main     = document.getElementById("pf-main");
  const toastWrap = document.getElementById("pf-toast-wrap");

  // ── State ──────────────────────────────────────────────────────────────────
  const reportMemory  = new Map();  // name → {filters, output}
  const scrollMemory  = new Map();  // hash → scrollY
  let   previousRoute = location.hash;
  window.addEventListener("hashchange", () => {
    scrollMemory.set(previousRoute, window.scrollY);
    previousRoute = location.hash;
  });
  const state = {
    boot:            null,
    activeWorkspace: null,
    listReturn:      "",
    listRows:        [],
    searchTimer:     null,
    reportScript:    null,
  };

  // ── Utilities ──────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);

  function toPlainText(html) {
    if (!html) return "";
    const tmp = document.createElement("div");
    tmp.innerHTML = String(html);
    return (tmp.textContent || tmp.innerText || "").replace(/\s+/g, " ").trim();
  }

  const esc = (value) =>
    String(value == null ? "" : value).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  function prettyLabel(key) {
    return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function fmt(fieldname, value, currency = "INR") {
    if (value == null || value === "") return "—";
    const f = String(fieldname).toLowerCase();
    if (f.includes("amount") || f.includes("total") || f.includes("rate") || f.includes("paid")) {
      return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value));
    }
    if (f.includes("qty") || f.includes("quantity") || f.includes("percent") || f === "per_delivered" || f === "per_received" || f === "per_billed") {
      return Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 }) + (f.includes("percent") || f.startsWith("per_") ? "%" : "");
    }
    if (f === "docstatus") return ["Draft", "Submitted", "Cancelled"][Number(value)] || value;
    return String(value);
  }

  function statusClass(value) {
    if (!value) return "";
    const v = String(value).toLowerCase().replace(/\s+/g, "-");
    return "pf-status pf-status-" + v;
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  function toast(message, isError = false) {
    if (!toastWrap) return;
    const el = document.createElement("div");
    el.className = "pf-toast " + (isError ? "error" : "success");
    el.textContent = message;
    toastWrap.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  // ── Write methods (need CSRF + POST) ──────────────────────────────────────
  const writeMethods = new Set([
    "frappe.model.workflow.apply_workflow",
    "erpnext.controllers.taxes_and_totals.calculate_taxes_and_totals",
    "erpnext.stock.get_item_details.calculate_taxes_and_totals",
    "logout",
    "frappe.desk.doctype.notification_log.notification_log.mark_as_read",
    "frappe.core.doctype.prepared_report.prepared_report.make_prepared_report",
    "frappe.client.save",
    "frappe.client.submit",
    "frappe.client.cancel",
    "frappe.client.delete",
    "erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry",
    "erpnext.crm.doctype.lead.lead.make_opportunity",
    "erpnext.crm.doctype.lead.lead.make_quotation",
    "erpnext.crm.doctype.lead.lead.make_customer",
    "erpnext.crm.doctype.opportunity.opportunity.make_quotation",
    "erpnext.selling.doctype.quotation.quotation.make_sales_order",
    "erpnext.selling.doctype.sales_order.sales_order.make_delivery_note",
    "erpnext.selling.doctype.sales_order.sales_order.make_sales_invoice",
    "erpnext.buying.doctype.request_for_quotation.request_for_quotation.make_supplier_quotation_from_rfq",
    "erpnext.buying.doctype.supplier_quotation.supplier_quotation.make_purchase_order",
    "erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_receipt",
    "erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_invoice",
    "erpnext.stock.doctype.material_request.material_request.make_purchase_order",
    "erpnext.stock.doctype.material_request.material_request.make_request_for_quotation",
    "erpnext.stock.doctype.purchase_receipt.purchase_receipt.make_purchase_invoice",
    "erpnext.stock.doctype.purchase_receipt.purchase_receipt.make_purchase_return",
    "erpnext.stock.doctype.delivery_note.delivery_note.make_sales_invoice",
    "erpnext.stock.doctype.delivery_note.delivery_note.make_sales_return",
    "erpnext.accounts.doctype.sales_invoice.sales_invoice.make_sales_return",
    "erpnext.accounts.doctype.purchase_invoice.purchase_invoice.make_debit_note",
    "erpnext.manufacturing.doctype.work_order.work_order.make_work_order",
    "erpnext.manufacturing.doctype.work_order.work_order.make_stock_entry",
    "run_doc_method",
    "erpnext.stock.get_item_details.get_item_details",
  ]);

  // ── Core API call ─────────────────────────────────────────────────────────
  const call = async (method, args = {}) => {
    const write = writeMethods.has(method);
    const url = new URL(`/api/method/${method}`, window.location.origin);
    const options = {
      method: write ? "POST" : "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: {},
    };
    if (write) {
      options.headers = {
        "Content-Type": "application/json",
        "X-Frappe-CSRF-Token": csrfNode?.content || "",
      };
      options.body = JSON.stringify(args);
    } else {
      Object.entries(args).forEach(([key, value]) =>
        url.searchParams.set(key, typeof value === "object" ? JSON.stringify(value) : String(value))
      );
    }

    const response = await fetch(url, options);

    if (response.status === 401 || response.status === 403) {
      const session = await fetch("/api/method/frappe.auth.get_logged_user", {
        credentials: "same-origin",
      })
        .then((r) => r.json())
        .catch(() => ({}));
      if (!session.message || session.message === "Guest") {
        location.replace(
          "/panelflow/login?redirect-to=" +
          encodeURIComponent("/panelflow/workspace" + location.hash)
        );
        throw new Error("Session expired. Please sign in again.");
      }
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.exc) {
      let message =
        payload._server_messages ||
        payload.exception ||
        payload.message ||
        `Request failed (${response.status})`;
      try {
        const parsed = JSON.parse(message);
        message = parsed.map((entry) => JSON.parse(entry).message).join(" ");
      } catch (_) {}
      throw new Error(String(message).replace(/<[^>]*>/g, " ").trim());
    }
    return payload.message;
  };

  // ── Frappe shims for installed report filter scripts ──────────────────────
  window.frappe = window.frappe || {};
  window.frappe.query_reports = window.frappe.query_reports || {};
  window.frappe.datetime = window.frappe.datetime || {};
  const getToday = () => state.boot?.today || new Date().toISOString().slice(0, 10);
  const formatDate = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  window.frappe.datetime.get_today = window.frappe.datetime.get_today || getToday;
  window.frappe.datetime.now_date = window.frappe.datetime.now_date || getToday;
  window.frappe.datetime.month_start = window.frappe.datetime.month_start || (() => `${getToday().slice(0, 7)}-01`);
  window.frappe.datetime.month_end = window.frappe.datetime.month_end || (() => {
    const [year, month] = getToday().split("-").map(Number);
    return formatDate(new Date(year, month, 0));
  });
  window.frappe.datetime.add_months = window.frappe.datetime.add_months || ((date, months) => {
    const [year, month, day] = String(date || getToday()).slice(0, 10).split("-").map(Number);
    const target = new Date(year, month - 1 + months, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(day, lastDay));
    return formatDate(target);
  });
  window.frappe.db = window.frappe.db || {};
  window.frappe.db.get_list = (doctype, args = {}) =>
    call("frappe.client.get_list", { doctype, ...args });
  window.frappe.defaults = window.frappe.defaults || {};
  const getDefault = window.frappe.defaults.get_default;
  window.frappe.defaults.get_user_default = (key) =>
    String(key).toLowerCase() === "company"
      ? (state.boot?.default_company || "")
      : String(key).toLowerCase() === "currency"
        ? (state.boot?.default_currency || "")
        : "";
  window.frappe.defaults.get_default = (key) => {
    const normalized = String(key).toLowerCase();
    if (normalized === "company") return state.boot?.default_company || "";
    if (normalized === "currency") return state.boot?.default_currency || "";
    return typeof getDefault === "function" ? getDefault.call(window.frappe.defaults, key) : "";
  };
  window.__ = window.__ || ((value) => value);
  window.erpnext = window.erpnext || {};
  window.erpnext.utils = window.erpnext.utils || {};
  window.erpnext.utils.get_fiscal_year = (date, withDates = false, boolean = false) => {
    const fiscalYear = state.boot?.current_fiscal_year || [];
    const targetDate = String(date || getToday()).slice(0, 10);
    if (fiscalYear.length === 3 && targetDate >= fiscalYear[1] && targetDate <= fiscalYear[2]) {
      return withDates ? fiscalYear : fiscalYear[0];
    }
    return boolean ? false : "";
  };
  window.erpnext.utils.add_dimensions = (name, index) => {
    (state.reportDimensions ||= []).push(
      call("erpnext.accounts.doctype.accounting_dimension.accounting_dimension.get_dimensions").then(
        (result) => {
          for (const dim of result[0] || []) {
            if (!frappe.query_reports[name].filters.some((f) => f.fieldname === dim.fieldname)) {
              frappe.query_reports[name].filters.splice(index++, 0, {
                fieldname: dim.fieldname,
                label: dim.label,
                fieldtype: "MultiSelectList",
                options: dim.document_type,
              });
            }
          }
        }
      )
    );
  };
  window.erpnext.utils.add_inventory_dimensions = (name, index) => {
    (state.reportDimensions ||= []).push(
      call("erpnext.stock.doctype.inventory_dimension.inventory_dimension.get_inventory_dimensions").then(
        (result) => {
          for (const dim of result || []) {
            if (!frappe.query_reports[name].filters.some((f) => f.fieldname === dim.fieldname)) {
              frappe.query_reports[name].filters.splice(index++, 0, {
                fieldname: dim.fieldname,
                label: dim.label,
                fieldtype: "Link",
                options: dim.document_type,
              });
            }
          }
        }
      )
    );
  };

  // ── Link helpers ──────────────────────────────────────────────────────────
  const linkFor = (doctype, name) =>
    `#/record/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`;

  const listLink = (doctype, filters = {}) => {
    const params = new URLSearchParams({ filters: JSON.stringify(filters) });
    return `#/list/${encodeURIComponent(doctype)}?${params}`;
  };

  // ── Detail view renderer ──────────────────────────────────────────────────
  function renderRecord(doc, doctype) {
    const fields = Object.keys(doc).filter(
      (k) =>
        !k.startsWith("_") &&
        !["modified_by", "creation", "idx", "doctype"].includes(k) &&
        !Array.isArray(doc[k]) &&
        typeof doc[k] !== "object"
    );
    const transitions = doc.portal_transitions || [];
    const shortages   = doc.material_shortages || [];

    const topFields = ["name", "status", "workflow_state", "docstatus"];
    const ordered   = [...topFields.filter((f) => f in doc), ...fields.filter((f) => !topFields.includes(f))];

    const dtPretty = prettyLabel(doctype);

    return `
<div class="pf-page-head">
  <div>
    <div class="pf-eyebrow">${esc(dtPretty)}</div>
    <h1>${esc(doc.name || "")}</h1>
  </div>
  <div class="pf-page-head-actions">
    <a class="pf-btn" href="#/list/${encodeURIComponent(doctype)}">← Back to list</a>
    ${transitions.length ? `<div class="pf-flow-actions" id="pf-flow-transition-btns"></div>` : ""}
  </div>
</div>

<div class="pf-panel">
  <div class="pf-panel-head">
    <strong>${esc(doc.name || "")}</strong>
    ${doc.workflow_state ? `<span class="pf-flow-state">${esc(doc.workflow_state)}</span>` : doc.status ? `<span class="${statusClass(doc.status)}">${esc(doc.status)}</span>` : ""}
  </div>

  <dl class="pf-detail-grid">
    ${ordered
      .filter((f) => doc[f] != null && doc[f] !== "")
      .map((f) => `
      <div>
        <dt>${esc(prettyLabel(f))}</dt>
        <dd>${esc(fmt(f, doc[f]))}</dd>
      </div>`)
      .join("")}
  </dl>

  ${transitions.length ? `
  <div class="pf-flow-actions" id="pf-workflow-actions">
    ${transitions.map((t) => `
    <button
      class="pf-btn primary"
      data-action="${esc(t.action)}"
      data-next="${esc(t.next_state)}"
    >${esc(t.action)}</button>`).join("")}
  </div>` : ""}

  <div class="pf-flow-actions" id="pf-mapping-actions"></div>
</div>

${shortages.length ? `
<div class="pf-panel">
  <div class="pf-panel-head">
    <strong>Material shortages</strong>
    <span class="pf-row-sub">${shortages.length} item${shortages.length !== 1 ? "s" : ""} short</span>
  </div>
  <div class="pf-table-wrap">
    <table class="pf-table">
      <thead><tr>
        <th>Item</th><th>Required</th><th>Available</th><th>Short</th>
      </tr></thead>
      <tbody>
        ${shortages.map((row) => `<tr>
          <td>${esc(row.item_code || row.item)}</td>
          <td>${esc(fmt("qty", row.required_qty))}</td>
          <td>${esc(fmt("qty", row.actual_qty))}</td>
          <td style="color:var(--pf-danger);font-weight:600">${esc(fmt("qty", row.shortage_qty))}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>
</div>` : ""}

${(doc.items && doc.items.length) ? `
<div class="pf-panel">
  <div class="pf-panel-head"><strong>Items</strong></div>
  <div class="pf-table-wrap">
    <table class="pf-table">
      <thead><tr>
        <th>Item</th><th>Qty</th><th>UOM</th><th>Rate</th><th>Amount</th>
      </tr></thead>
      <tbody>
        ${doc.items.map((row) => `<tr>
          <td>${esc(row.item_name || row.item_code || "")}</td>
          <td>${esc(fmt("qty", row.qty))}</td>
          <td>${esc(row.uom || "")}</td>
          <td>${esc(fmt("rate", row.rate, doc.currency))}</td>
          <td>${esc(fmt("amount", row.amount, doc.currency))}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>
  <div class="pf-summary">
    ${doc.total != null ? `<span><b>Subtotal:</b> ${fmt("amount", doc.total, doc.currency)}</span>` : ""}
    ${doc.grand_total != null ? `<span><b>Grand Total:</b> ${fmt("amount", doc.grand_total, doc.currency)}</span>` : ""}
    ${doc.outstanding_amount != null ? `<span><b>Outstanding:</b> ${fmt("amount", doc.outstanding_amount, doc.currency)}</span>` : ""}
  </div>
</div>` : ""}
`;
  }

  // ── Workflow action wiring ────────────────────────────────────────────────
  async function wireWorkflowActions(doc, doctype) {
    const container = document.getElementById("pf-workflow-actions");
    if (!container) return;
    container.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const action = btn.dataset.action;
        btn.disabled = true;
        btn.textContent = "Applying…";
        try {
          await call("frappe.model.workflow.apply_workflow", {
            doc: JSON.stringify(doc),
            action,
          });
          await renderRecordView(doctype, doc.name);
          toast(`Action "${action}" applied.`);
        } catch (error) {
          toast(error.message, true);
          btn.disabled = false;
          btn.textContent = action;
        }
      });
    });
  }

  // ── Overview ──────────────────────────────────────────────────────────────
  async function renderOverview() {
    main.innerHTML = `<div class="pf-loading">Loading your overview…</div>`;
    try {
      const [data, leadPermission, quotationPermission] = await Promise.all([
        call("panelflow.portal.get_overview"),
        call("frappe.client.has_permission", { doctype: "Lead", docname: "", perm_type: "create" }),
        call("frappe.client.has_permission", { doctype: "Quotation", docname: "", perm_type: "create" }),
      ]);
      const { cards, queues, charts } = data;
      const createButtons = [
        leadPermission?.has_permission && ["Lead", "+ New Lead"],
        quotationPermission?.has_permission && ["Quotation", "+ New Quotation"],
      ].filter(Boolean);
      const createButtonsHtml = createButtons.length
        ? `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            ${createButtons.map(([doctype, label]) => `
              <a class="pf-btn primary" href="#/new/${encodeURIComponent(doctype)}">${label}</a>
            `).join("")}
          </div>`
        : "";

      const cardIcons = {
        "Quotation": "📋",
        "Sales Order": "📦",
        "Purchase Order": "🛒",
        "Purchase Receipt": "📥",
        "Work Order": "🏭"
      };
      const cardColors = ["", "gold", "burgundy", "green"];
      const cardsHtml = cards.length
        ? `<div class="pf-kpi-grid">
            ${cards.map((c, idx) => `
              <a class="pf-kpi-card ${cardColors[idx % cardColors.length]}" href="${listLink(c.doctype, c.filters)}">
                <div class="pf-kpi-top">
                  <span class="pf-kpi-label">${esc(c.label)}</span>
                  <span class="pf-kpi-icon">${cardIcons[c.doctype] || "📊"}</span>
                </div>
                <div class="pf-kpi-value">${esc(c.value)}</div>
                <div class="pf-kpi-sub">
                  <strong>Live queue</strong> · Click to inspect →
                </div>
              </a>`).join("")}
           </div>`
        : "";

      const queuesHtml = queues.length
        ? `<div class="pf-panel">
            <div class="pf-panel-head"><strong>Needs your attention</strong></div>
            ${queues.map((q) => `
              <a class="pf-row-link" href="${linkFor(q.doctype, q.name)}">
                <span>
                  <b class="pf-row-title">${esc(toPlainText(q.title))}</b>
                  <span class="pf-row-sub"><strong style="color:var(--pf-plum)">${esc(q.kind)}</strong> · ${esc(toPlainText(q.subtitle))}</span>
                </span>
                <span class="pf-count">Review →</span>
              </a>`).join("")}
           </div>`
        : `<div class="pf-panel"><div class="pf-empty"><span class="pf-empty-icon">✓</span>Your queue is clear.</div></div>`;

      const chartTargetDoctypes = {
        "Sales Order delivery status": "Sales Order",
        "Opportunity pipeline by stage": "Opportunity"
      };
      const chartFieldFilters = {
        "Sales Order delivery status": "status",
        "Opportunity pipeline by stage": "sales_stage"
      };

      const chartsHtml = charts.length
        ? `<div class="pf-chart-grid">
            ${charts.map((chart) => {
              const total = chart.items.reduce((s, i) => s + i.value, 0) || 1;
              const max   = Math.max(...chart.items.map((i) => i.value), 1);
              const colors = ["#3D1A47", "#6B1A3A", "#B8963E", "#2D7A4F", "#1A5A8B", "#5A2870"];
              const dt = chartTargetDoctypes[chart.title] || "Sales Order";
              const fld = chartFieldFilters[chart.title] || "status";

              return `<div class="pf-chart-card">
                <h2>
                  <span>${esc(chart.title)}</span>
                  <span class="pf-chart-badge">${total} ${esc(chart.unit || "records")}</span>
                </h2>
                <div class="pf-chart-rows" style="display:flex;flex-direction:column;gap:12px;margin-top:14px;">
                  ${chart.items.map((item, idx) => {
                    const widthPct = Math.max(item.value ? 8 : 0, Math.round(100 * item.value / max));
                    const col = colors[idx % colors.length];
                    const targetLink = listLink(dt, { [fld]: item.label });
                    return `
                    <a class="pf-hbar-item" href="${esc(targetLink)}" style="text-decoration:none;display:block;">
                      <div class="pf-hbar-head">
                        <strong>${esc(item.label)}</strong>
                        <span>${esc(item.value)} (${Math.round((item.value / total) * 100)}%)</span>
                      </div>
                      <div class="pf-hbar-track">
                        <div class="pf-hbar-bar" style="width:${widthPct}%;background:${col};"></div>
                      </div>
                    </a>`;
                  }).join("")}
                </div>
              </div>`;
            }).join("")}
          </div>`
        : "";

      $("pf-current-title").textContent = "Overview";
      main.innerHTML = `
<div class="pf-page-head">
  <div>
    <div class="pf-eyebrow">Executive Summary</div>
    <h1>Overview</h1>
    <p>Your accessible queues, active orders and team pipeline at a glance</p>
  </div>
  ${createButtonsHtml}
</div>
<div class="pf-workspace-sections">
  ${cardsHtml}
  ${queuesHtml}
  ${chartsHtml}
</div>`;
    } catch (error) {
      main.innerHTML = `<div class="pf-error">${esc(error.message)}</div>`;
    }
  }

  // ── List view ─────────────────────────────────────────────────────────────
  async function renderList(doctype, filters = {}, search = "", page = 1) {
    $("pf-current-title").textContent = prettyLabel(doctype);
    main.innerHTML = `<div class="pf-loading">Loading ${esc(prettyLabel(doctype))}…</div>`;

    try {
      const canCreate = await call("frappe.client.has_permission", {
        doctype,
        docname: "",
        perm_type: "create",
      }).then((r) => r?.has_permission && doctype !== "Bin").catch(() => false);

      const data = await call("panelflow.portal.get_records", {
        doctype,
        search,
        page,
        filters,
      });

      const { rows, fields, has_more } = data;

      const filterInputs = ["name", "status", "workflow_state"].filter((f) =>
        fields.includes(f)
      );

      main.innerHTML = `
<div class="pf-page-head">
  <div>
    <div class="pf-eyebrow">Documents</div>
    <h1>${esc(prettyLabel(doctype))}</h1>
  </div>
  ${canCreate ? `<button class="pf-btn primary" id="pf-new-doc">+ New ${esc(doctype)}</button>` : ""}
</div>

<div class="pf-panel">
  <div class="pf-list-head" style="padding:14px 20px;border-bottom:1px solid var(--pf-cream);">
    <div class="pf-list-filters">
      <input
        class="pf-list-filter-input"
        id="pf-list-search"
        type="search"
        placeholder="Search…"
        value="${esc(search)}"
        aria-label="Search ${esc(prettyLabel(doctype))}"
      >
    </div>
    <span style="font-size:12px;color:var(--pf-mid)">${rows.length} record${rows.length !== 1 ? "s" : ""}</span>
  </div>

  ${rows.length ? `
  <div class="pf-table-wrap">
    <table class="pf-table">
      <thead><tr>
        ${fields.map((f) => `<th>${esc(prettyLabel(f))}</th>`).join("")}
      </tr></thead>
      <tbody>
        ${rows.map((row) => `<tr data-href="${esc(linkFor(doctype, row.name))}">
          ${fields.map((f) => {
            const v = row[f];
            if (f === "name") return `<td><a href="${esc(linkFor(doctype, v))}">${esc(v)}</a></td>`;
            if (f === "status" || f === "workflow_state") return `<td><span class="${statusClass(v)}">${esc(v || "—")}</span></td>`;
            return `<td>${esc(fmt(f, v))}</td>`;
          }).join("")}
        </tr>`).join("")}
      </tbody>
    </table>
  </div>` : `<div class="pf-empty"><span class="pf-empty-icon">📄</span>No ${esc(prettyLabel(doctype).toLowerCase())} found with these filters.</div>`}

  <div class="pf-pagination">
    <span>Page ${page}</span>
    <div style="display:flex;gap:10px">
      ${page > 1 ? `<button class="pf-btn" id="pf-prev-page">← Previous</button>` : ""}
      ${has_more ? `<button class="pf-btn" id="pf-next-page">Next →</button>` : ""}
    </div>
  </div>
</div>`;

      // Click-row
      main.querySelectorAll("tr[data-href]").forEach((tr) => {
        tr.style.cursor = "pointer";
        tr.addEventListener("click", (e) => {
          if (e.target.tagName === "A") return;
          location.hash = tr.dataset.href;
        });
      });

      // New doc button
      if (canCreate) {
        $("pf-new-doc")?.addEventListener("click", () => {
          state.listReturn = location.hash;
          location.hash = `#/new/${encodeURIComponent(doctype)}`;
        });
      }

      // Search with debounce
      const searchInput = $("pf-list-search");
      let searchTimer;
      searchInput?.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          renderList(doctype, filters, searchInput.value, 1);
        }, 350);
      });

      // Pagination
      $("pf-prev-page")?.addEventListener("click", () => renderList(doctype, filters, search, page - 1));
      $("pf-next-page")?.addEventListener("click", () => renderList(doctype, filters, search, page + 1));

      // Restore scroll
      const savedScroll = scrollMemory.get(location.hash);
      if (savedScroll) window.scrollTo(0, savedScroll);

    } catch (error) {
      main.innerHTML = `<div class="pf-error">${esc(error.message)}</div>`;
    }
  }

  // ── Record (detail) view ──────────────────────────────────────────────────
  async function renderRecordView(doctype, name) {
    $("pf-current-title").textContent = name;
    main.innerHTML = `<div class="pf-loading">Loading ${esc(name)}…</div>`;
    try {
      const doc = await call("panelflow.portal.get_record", { doctype, name });
      main.innerHTML = renderRecord(doc, doctype);
      await wireWorkflowActions(doc, doctype);
    } catch (error) {
      main.innerHTML = `<div class="pf-error">${esc(error.message)}</div>`;
    }
  }

  // ── Report runner ─────────────────────────────────────────────────────────
  async function renderReportView(name) {
    $("pf-current-title").textContent = name;
    main.innerHTML = `<div class="pf-loading">Loading report…</div>`;

    try {
      const info = await call("panelflow.portal.available_report", { report_name: name });
      state.reportDimensions = [];
      const reportScript = await call("frappe.desk.query_report.get_script", { report_name: name });
      if (reportScript.script) {
        const script = document.createElement("script");
        script.textContent = reportScript.script;
        document.head.appendChild(script);
        script.remove();
      }
      await Promise.all(state.reportDimensions);
      const filterDefs =
        window.frappe.query_reports[name]?.filters || reportScript.filters || info.filters || [];

      // Restore memory
      const remembered = reportMemory.get(name) || {};
      const filters = { ...(remembered.filters || {}) };
      const defaultCompany = state.boot.default_company || "";
      if (!filters.company && defaultCompany) filters.company = defaultCompany;

      // Build filter form
      const filtersHtml = filterDefs.map((f) => {
        const defaultValue = typeof f.default === "function" ? f.default() : f.default;
        const val = Object.prototype.hasOwnProperty.call(filters, f.fieldname)
          ? filters[f.fieldname]
          : (defaultValue ?? "");
        const required = f.reqd && f.fieldtype !== "Check" ? " required" : "";
        const label = esc(f.label || f.fieldname);
        const fieldname = esc(f.fieldname);

        if (f.fieldtype === "Select") {
          const rawOptions = typeof f.options === "function" ? f.options() : f.options;
          const options = Array.isArray(rawOptions)
            ? rawOptions.map((option) => Array.isArray(option) ? option[0] : option)
            : String(rawOptions || "").split("\n").filter((option) => option !== "");
          const opts = options.map((option) => {
            const optionValue = String(option ?? "");
            return `<option value="${esc(optionValue)}"${optionValue === String(val) ? " selected" : ""}>${esc(optionValue)}</option>`;
          }).join("");
          return `<label><span>${label}</span><select class="pf-select" data-fieldname="${fieldname}" name="${fieldname}"${required}><option value=""></option>${opts}</select></label>`;
        }
        const type = {
          Date: "date",
          Datetime: "datetime-local",
          Time: "time",
          Int: "number",
          Float: "number",
          Currency: "number",
        }[f.fieldtype] || "text";
        const isCheckbox = f.fieldtype === "Check";
        const isMulti = ["MultiSelectList", "Table MultiSelect"].includes(f.fieldtype);
        const checked = val === true || val === 1 || val === "1";
        const value = Array.isArray(val) ? val.join(", ") : String(val ?? "");
        const displayValue = f.fieldtype === "Datetime" ? value.replace(" ", "T").slice(0, 16) : value;
        const step = ["Float", "Currency"].includes(f.fieldtype) ? ' step="any"' : "";
        const placeholder = isMulti ? ' placeholder="Separate values with commas"' : "";
        return `<label><span>${label}</span><input class="pf-input" type="${isCheckbox ? "checkbox" : type}" data-fieldname="${fieldname}" data-fieldtype="${esc(f.fieldtype)}" name="${fieldname}"${isCheckbox ? (checked ? " checked" : "") : ` value="${esc(displayValue)}"${step}${placeholder}`}${required}></label>`;
      }).join("");

      main.innerHTML = `
<div class="pf-page-head">
  <div>
    <div class="pf-eyebrow">Reports</div>
    <h1>${esc(name)}</h1>
  </div>
  <a class="pf-btn" href="#reports">← All reports</a>
</div>

<div class="pf-panel">
  <form class="pf-report-filters" id="pf-report-filter-form" aria-label="Report filters">
    ${filtersHtml}
    <div style="display:flex;align-items:flex-end;gap:10px">
      <button class="pf-btn primary" type="submit" id="pf-run-report">Run report</button>
    </div>
  </form>
  <div id="pf-report-output">
    ${remembered.output || '<div class="pf-empty"><span class="pf-empty-icon">📊</span>Set filters and click Run report.</div>'}
  </div>
</div>`;

      // Collect filter values on submit
      const form = $("pf-report-filter-form");
      const output = $("pf-report-output");
      const runButton = $("pf-run-report");

      async function runReport() {
        runButton.disabled = true;
        runButton.textContent = "Running…";
        output.innerHTML = `<div class="pf-loading">Running ${esc(name)}…</div>`;

        // Read current filter values
        form.querySelectorAll("[data-fieldname]").forEach((input) => {
          let value;
          if (input.type === "checkbox") {
            value = input.checked ? 1 : 0;
          } else if (["MultiSelectList", "Table MultiSelect"].includes(input.dataset.fieldtype)) {
            value = input.value.split(",").map((item) => item.trim()).filter(Boolean);
          } else {
            value = input.value;
            if (input.dataset.fieldtype === "Datetime") value = value.replace("T", " ");
          }
          if (value !== "" && value !== null && (!Array.isArray(value) || value.length)) {
            filters[input.dataset.fieldname] = value;
          } else {
            delete filters[input.dataset.fieldname];
          }
        });

        try {
          const result = await call("frappe.desk.query_report.run", {
            report_name: name,
            filters: JSON.stringify(filters),
          });
          const rows = result?.result || result?.data || [];
          const columns = (result?.columns || []).map((column) =>
            typeof column === "string" ? { label: column, fieldname: column } : column
          );
          const chart   = result?.chart || null;
          const summary = result?.report_summary || [];

          // Chart HTML
          const chartHtml = chart?.data?.labels?.length ? `
<div class="pf-chart-card" style="margin-bottom:16px">
  <h2>${esc(chart.data.title || "Chart")}</h2>
  <div class="pf-chart-rows">
    ${chart.data.labels.map((label, index) => {
      const vals = (chart.data.datasets || []).map((d) => d.values?.[index] ?? 0);
      const max  = Math.max(1, ...vals);
      return `<div class="pf-chart-row">
        <b>${esc(label)}</b>
        <div class="pf-chart-bar-wrap">
          <span class="pf-chart-bar" style="width:${Math.max(vals[0] ? 4 : 0, Math.round(100 * vals[0] / max))}%"></span>
        </div>
        <b>${vals.map((v) => esc(v)).join(" · ")}</b>
      </div>`;
    }).join("")}
  </div>
</div>` : "";

          const summaryHtml = summary.length ? `<div class="pf-summary">
            ${summary.map((item) => `<span><b>${esc(item.label)}:</b> ${esc(fmt(item.datatype || "", item.value, item.currency))}</span>`).join("")}
          </div>` : "";

          if (result?.prepared_report && !result?.doc) {
            output.innerHTML = `
<div class="pf-empty">No completed prepared report exists for these filters.</div>
<button class="pf-btn primary" id="pf-generate-report">Generate report</button>`;
            $("pf-generate-report").onclick = async (event) => {
              event.target.disabled = true;
              try {
                const job = await call(
                  "frappe.core.doctype.prepared_report.prepared_report.make_prepared_report",
                  { report_name: name, filters }
                );
                output.innerHTML = `<div class="pf-empty">Report queued: ${esc(job.name)}. Click Run report to check status.</div>`;
              } catch (err) {
                event.target.disabled = false;
                toast(err.message, true);
              }
            };
          } else if (columns.length) {
            output.innerHTML = `${chartHtml}${summaryHtml}
<div class="pf-table-wrap">
  <table class="pf-table">
    <thead><tr>${columns.map((col) => `<th>${esc(col.label || prettyLabel(col.fieldname || ""))}</th>`).join("")}</tr></thead>
    <tbody>
      ${rows.length ? rows.map((row) => `<tr>${columns.map((col) => {
        const value = Array.isArray(row) ? row[columns.indexOf(col)] : row[col.fieldname];
        const linked = col.fieldtype === "Dynamic Link" ? row[col.options] : col.options;
        if (["Link", "Dynamic Link"].includes(col.fieldtype) && value && linked && !/^total$/i.test(String(value))) {
          return `<td><a href="${esc(linkFor(linked, value))}">${esc(value)}</a></td>`;
        }
        if (col.fieldtype === "Currency" && value != null) {
          return `<td>${esc(new Intl.NumberFormat("en-IN", { style: "currency", currency: (col.options && row[col.options]) || "INR", maximumFractionDigits: 2 }).format(Number(value)))}</td>`;
        }
        if (col.fieldtype === "Percent" && value != null) {
          return `<td>${Number(value).toFixed(Number(col.precision ?? 2))}%</td>`;
        }
        return `<td>${esc(fmt(col.fieldname || "", value, (col.options && row[col.options]) || "INR"))}</td>`;
      }).join("")}</tr>`).join("") : `<tr><td colspan="${columns.length}">The report ran successfully, but no rows match these filters.</td></tr>`}
    </tbody>
  </table>
</div>`;

            if (result?.prepared_report && result?.doc) {
              const rebuild = document.createElement("button");
              rebuild.className = "pf-btn";
              rebuild.textContent = "Rebuild report";
              rebuild.onclick = async () => {
                rebuild.disabled = true;
                try {
                  const job = await call(
                    "frappe.core.doctype.prepared_report.prepared_report.make_prepared_report",
                    { report_name: name, filters }
                  );
                  toast("Report rebuild queued: " + job.name);
                } catch (err) {
                  toast(err.message, true);
                  rebuild.disabled = false;
                }
              };
              output.appendChild(rebuild);
            }
          } else {
            output.innerHTML = `${chartHtml}${summaryHtml}<div class="pf-empty"><span class="pf-empty-icon">📊</span>The report ran successfully and returned no rows.</div>`;
          }

          reportMemory.set(name, { filters: { ...filters }, output: output.innerHTML });
          if (result?.message) {
            output.insertAdjacentHTML("afterbegin", `<div class="pf-panel-head"><small>${esc(result.message)}</small></div>`);
          }
        } catch (error) {
          output.innerHTML = `<div class="pf-error">${esc(error.message)}<p>Check filters and your report access, then try again.</p></div>`;
        } finally {
          runButton.disabled = false;
          runButton.textContent = "Run report";
        }
      }

      form.addEventListener("submit", (e) => { e.preventDefault(); runReport(); });
      if (remembered.output) runReport();

    } catch (error) {
      main.innerHTML = `<div class="pf-error">${esc(error.message)}</div>`;
    }
  }

  // ── Report catalog ────────────────────────────────────────────────────────
  function renderReportList() {
    $("pf-current-title").textContent = "Reports";
    if (!state.boot?.reports?.length) {
      main.innerHTML = `<div class="pf-panel"><div class="pf-empty">No reports are accessible to your account.</div></div>`;
      return;
    }

    const byWorkspace = {};
    for (const r of state.boot.reports) {
      if (!r.workspace) continue;
      (byWorkspace[r.workspace] ||= []).push(r);
    }

    const workspaceOrder = ["Sales and CRM", "Purchase", "Stock and Manufacturing", "Accounts"];
    const ordered = workspaceOrder.filter((workspace) => byWorkspace[workspace]);

    main.innerHTML = `
<div class="pf-page-head">
  <div>
    <div class="pf-eyebrow">Analytics &amp; Intelligence</div>
    <h1>Operational Reports</h1>
    <p style="margin-top:6px;color:var(--pf-mid);font-size:13px;">View and execute permission-filtered reports across Sales, Procurement, CRM, and Inventory.</p>
  </div>
</div>
<div class="pf-workspace-sections">
  ${ordered.map((module) => `
  <div class="pf-panel">
    <div class="pf-panel-head" style="background:var(--pf-ivory-mid);">
      <strong>${esc(module)} Reports</strong>
      <span class="pf-row-sub">${byWorkspace[module].length} available</span>
    </div>
    <div class="pf-report-list" style="padding:8px 0;">
      ${byWorkspace[module].map((r) => `
      <a class="pf-report-item" href="#/report/${encodeURIComponent(r.name)}" style="padding:14px 20px;border-bottom:1px solid var(--pf-ivory-mid);display:flex;align-items:center;justify-content:space-between;text-decoration:none;">
        <div style="display:flex;align-items:center;gap:14px;">
          <span style="font-size:18px;">📊</span>
          <div>
            <b style="font-size:14px;color:var(--pf-plum);display:block;">${esc(r.name)}</b>
            <small style="color:var(--pf-mid);font-size:11px;">Document: ${esc(r.doctype || "Standard")} · Module: ${esc(r.module)}</small>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          ${r.prepared ? `<span class="pf-status pf-status-open" style="font-size:10px;">Prepared</span>` : ""}
          <span class="pf-btn primary" style="font-size:11px;padding:6px 14px;">Run Report →</span>
        </div>
      </a>`).join("")}
    </div>
  </div>`).join("")}
</div>`;
  }

  // ── Profile page ──────────────────────────────────────────────────────────
  async function renderProfile() {
    $("pf-current-title").textContent = "My account";
    const user = root.dataset.user;
    main.innerHTML = `
<div class="pf-account">
  <div class="pf-eyebrow">Account</div>
  <h2>My account</h2>
  <div class="pf-panel" style="padding:24px">
    <p><strong>Signed in as:</strong> ${esc(user)}</p>
    <p><strong>Roles:</strong> ${esc((state.boot?.roles || []).join(", ") || "—")}</p>
    <p style="margin-top:20px">
      <a href="/app/user/${encodeURIComponent(user)}" target="_blank" rel="noreferrer" class="pf-btn">Edit profile in Desk ↗</a>
    </p>
  </div>
</div>`;
  }

  function renderSearchPage() {
    $("pf-current-title").textContent = "Search";
    main.innerHTML = `
<div class="pf-page-head">
  <div>
    <div class="pf-eyebrow">Search</div>
    <h1>Find documents and reports</h1>
    <p>Search records you can access, such as Sales Orders and Sales Invoices.</p>
  </div>
</div>
<div class="pf-panel pf-search-page">
  <label for="pf-search-page-input">Search</label>
  <input id="pf-search-page-input" class="pf-list-filter-input" type="search" placeholder="Search documents and reports…" autocomplete="off">
  <div id="pf-search-page-results" class="pf-search-page-results" role="listbox" aria-live="polite">Enter at least two characters to search.</div>
</div>`;
    attachSearch($("pf-search-page-input"), $("pf-search-page-results"), false);
    $("pf-search-page-input")?.focus();
  }

  // ── Router ────────────────────────────────────────────────────────────────
  function renderRoute() {
    const hash = location.hash || "";
    const [path, querystring] = hash.split("?");
    const parts = path.split("/").map(decodeURIComponent);
    const params = new URLSearchParams(querystring || "");

    if (!hash || hash === "#" || hash === "#/overview") {
      renderOverview();
      highlightNav("overview");
      return;
    }

    if (hash === "#reports") {
      renderReportList();
      highlightNav("reports");
      return;
    }

    const segment = parts[1];

    switch (segment) {
      case "workspace":
        if (parts[2] && window.PanelFlowWorkspace) {
          highlightNav("ws-" + parts[2]);
          window.PanelFlowWorkspace(parts[2]);
        } else {
          renderOverview();
        }
        break;

      case "list": {
        const doctype = parts[2];
        let filters = {};
        try { filters = JSON.parse(params.get("filters") || "{}"); } catch (_) {}
        renderList(doctype, filters, params.get("search") || "", Number(params.get("page")) || 1);
        break;
      }

      case "record":
        renderRecordView(parts[2], parts[3]);
        break;

      case "new":
        if (window.PanelFlowForms) {
          $("pf-current-title").textContent = "New " + prettyLabel(parts[2]);
          window.PanelFlowForms.open(parts[2], null, null);
        }
        break;

      case "edit":
        if (window.PanelFlowForms) {
          $("pf-current-title").textContent = "Edit " + parts[3];
          window.PanelFlowForms.open(parts[2], parts[3], null);
        }
        break;

      case "report":
        renderReportView(parts[2]);
        highlightNav("reports");
        break;

      case "profile":
        renderProfile();
        break;

      case "search":
        renderSearchPage();
        highlightNav("search");
        break;

      default:
        renderOverview();
    }
  }

  function highlightNav(key) {
    document.querySelectorAll(".pf-nav-link").forEach((link) => {
      link.classList.remove("active");
      link.removeAttribute("aria-current");
    });
    if (!key) return;
    const target = document.querySelector(key.startsWith("ws-")
      ? `[data-workspace="${CSS.escape(key.slice(3))}"]`
      : `[data-view="${CSS.escape(key)}"]`
    );
    if (target) {
      target.classList.add("active");
      target.setAttribute("aria-current", "page");
    }
  }

  // ── Notifications ─────────────────────────────────────────────────────────
  async function loadNotifications() {
    try {
      const rows = await call("panelflow.portal.get_notifications", { limit: 25 });
      const list = $("pf-notification-list");
      const unread = $("pf-unread");

      const unreadCount = rows.filter((r) => !r.read).length;
      if (unreadCount > 0) {
        unread.hidden = false;
        unread.textContent = unreadCount;
        $("pf-bell").setAttribute("aria-label", `${unreadCount} unread notifications`);
      }

      list.innerHTML = rows.length
        ? rows.map((row) => {
            const dest = row.link
              ? row.link.replace("/app/", "#/record/").replace(/\/([^/]+)$/, "/$1").replace(/-/g, " ")
              : null;
            return `<${dest ? `a href="${esc(dest)}"` : "div"} class="pf-notification-row${row.read ? "" : " unread"}" role="listitem">
              <b>${esc(row.subject || "")}</b>
              <small>${esc(row.document_type || "")}${row.document_name ? " · " + esc(row.document_name) : ""}</small>
              <small>${new Date(row.creation).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</small>
            </${dest ? "a" : "div"}>`;
          }).join("")
        : `<div class="pf-empty">No notifications.</div>`;

      // Mark as read
      if (unreadCount > 0) {
        rows.filter((r) => !r.read).forEach(async (row) => {
          await call("frappe.desk.doctype.notification_log.notification_log.mark_as_read", {
            docname: row.name,
          }).catch(() => {});
        });
      }
    } catch (_) {}
  }

  // ── Sidebar workspaces ────────────────────────────────────────────────────
  function renderSidebarWorkspaces() {
    const nav = $("pf-workspaces");
    const overview = `
<a class="pf-nav-link" href="#/overview" data-view="overview" aria-label="Overview">
  <span class="pf-nav-icon" aria-hidden="true">⌂</span>
  Overview
</a>`;
    if (!state.boot?.workspaces?.length) {
      nav.innerHTML = `${overview}<div class="pf-skeleton">No accessible workspaces.</div>`;
      return;
    }

    nav.innerHTML = overview + state.boot.workspaces.map((ws) => `
<a
  class="pf-nav-link"
  href="#/workspace/${encodeURIComponent(ws.name)}"
  data-workspace="${esc(ws.name)}"
  data-view="ws-${esc(ws.name)}"
  aria-label="${esc(ws.name)} workspace"
>
  <span class="pf-nav-icon" aria-hidden="true">${workspaceIcon(ws.name)}</span>
  ${esc(ws.name)}
</a>`).join("");
  }

  function workspaceIcon(name) {
    const n = String(name).toLowerCase();
    if (n.includes("sales") || n.includes("crm")) return "📋";
    if (n.includes("purchase") || n.includes("buy")) return "🛒";
    if (n.includes("stock") || n.includes("manufacturing")) return "🏭";
    if (n.includes("account")) return "💳";
    return "◉";
  }

  // ── User info ─────────────────────────────────────────────────────────────
  function renderUserInfo() {
    const name = $("pf-user-name");
    const avatar = $("pf-avatar");
    const full = state.boot?.full_name || root.dataset.user || "Staff";
    if (name) name.textContent = full.split(" ")[0];
    if (avatar) avatar.textContent = full.charAt(0).toUpperCase();
  }

  // ── Global search ─────────────────────────────────────────────────────────
  function setupSearch() {
    const search  = document.createElement("input");
    search.className = "pf-global-search";
    search.type = "search";
    search.placeholder = "Search documents and reports";
    search.setAttribute("aria-label", "Search documents and reports");
    search.setAttribute("aria-controls", "pf-search-results");
    search.setAttribute("autocomplete", "off");
    document.querySelector(".pf-topbar")?.insertBefore(
      search,
      document.querySelector(".pf-top-actions")
    );

    const results = document.createElement("div");
    results.className = "pf-search-results pf-panel";
    results.id = "pf-search-results";
    results.hidden = true;
    results.setAttribute("role", "listbox");
    document.querySelector(".pf-topbar")?.appendChild(results);

    attachSearch(search, results, true);

    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        search.focus();
      }
    });

    document.addEventListener("click", (e) => {
      if (!search.contains(e.target) && !results.contains(e.target)) results.hidden = true;
    });
  }

  function attachSearch(search, results, isDropdown) {
    if (!search || !results) return;

    let searchTimer;
    let requestId = 0;
    const showMessage = (message) => {
      results.innerHTML = `<div class="pf-search-empty">${esc(message)}</div>`;
      if (isDropdown) results.hidden = false;
    };

    search.addEventListener("input", () => {
      clearTimeout(searchTimer);
      const currentRequest = ++requestId;
      const q = search.value.trim();
      if (q.length < 2) {
        if (isDropdown) results.hidden = true;
        else showMessage("Enter at least two characters to search.");
        return;
      }
      if (isDropdown) results.hidden = false;
      showMessage("Searching…");

      searchTimer = setTimeout(async () => {
        try {
          const accessibleRecords = (state.boot?.workspaces || [])
            .flatMap((workspace) => workspace.records || []);
          const recordsByType = new Map(
            accessibleRecords.map((record) => [record.doctype, record])
          );
          const allowedTypes = new Set(recordsByType.keys());
          const documentsByType = await Promise.all(
            [...allowedTypes].map(async (doctype) => {
              const documents = await call("frappe.desk.search.search_widget", {
                doctype,
                txt: q,
                start: 0,
                page_length: 4,
                as_dict: 1,
              });
              return (documents || []).map((document) => ({ ...document, doctype }));
            })
          );
          if (currentRequest !== requestId) return;

          const documentHits = documentsByType.flat()
            .filter((row) => allowedTypes.has(row.doctype))
            .map((row) => {
              const description = Object.entries(row)
                .filter(([field, value]) => field !== "name" && field !== "doctype" && value)
                .map(([field, value]) => `${prettyLabel(field)}: ${value}`)
                .join(" · ");
              return {
                label: row.label || row.name,
                type: row.doctype,
                description,
                href: linkFor(row.doctype, row.name),
              };
            });
          const typeHits = accessibleRecords
            .filter((record) =>
              `${record.doctype} ${record.label}`.toLowerCase().includes(q.toLowerCase())
            )
            .map((record) => ({
              label: record.label,
              type: "Document type",
              description: `Browse ${record.label}`,
              href: `#/list/${encodeURIComponent(record.doctype)}`,
            }));
          const reportHits = (state.boot?.reports || [])
            .filter((report) => String(report.name || "").toLowerCase().includes(q.toLowerCase()))
            .map((report) => ({
              label: report.name,
              type: "Report",
              description: report.workspace || "",
              href: `#/report/${encodeURIComponent(report.name)}`,
            }));
          const seen = new Set();
          const rows = [...documentHits, ...typeHits, ...reportHits]
            .filter((row) => {
              if (seen.has(row.href)) return false;
              seen.add(row.href);
              return true;
            })
            .slice(0, 20);

          if (currentRequest !== requestId) return;
          results.innerHTML = rows.length
            ? rows.map((row) => `<a href="${esc(row.href)}" role="option">
                <small>${esc(row.type)}</small><b>${esc(row.label)}</b>
                ${row.description ? `<span class="pf-search-description">${esc(row.description)}</span>` : ""}
              </a>`).join("")
            : `<div class="pf-search-empty">No matching records or reports found.</div>`;
          if (isDropdown) results.hidden = false;
          results.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
            if (isDropdown) results.hidden = true;
            search.value = "";
          }));
        } catch (error) {
          if (currentRequest === requestId) showMessage(`Search failed: ${error.message}`);
        }
      }, 300);
    });

    search.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (isDropdown) results.hidden = true;
        else search.value = "";
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        results.querySelector("a")?.focus();
      }
    });

    results.addEventListener("keydown", (e) => {
      const links = [...results.querySelectorAll("a")];
      const idx = links.indexOf(document.activeElement);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        links[(idx + (e.key === "ArrowDown" ? 1 : -1) + links.length) % links.length]?.focus();
      }
      if (e.key === "Escape") {
        if (isDropdown) results.hidden = true;
        search.focus();
      }
    });
  }

  // ── UI event wiring ───────────────────────────────────────────────────────
  function wireUI() {
    // Bell
    $("pf-bell")?.addEventListener("click", () => {
      const panel = $("pf-notifications");
      const expanded = panel.hidden;
      panel.hidden = !expanded;
      $("pf-bell").setAttribute("aria-expanded", String(expanded));
      if (expanded) loadNotifications();
    });

    $("pf-close-notifications")?.addEventListener("click", () => {
      $("pf-notifications").hidden = true;
      $("pf-bell")?.setAttribute("aria-expanded", "false");
    });

    // User menu
    $("pf-user-button")?.addEventListener("click", () => {
      const menu = $("pf-user-menu");
      const expanded = menu.hidden;
      menu.hidden = !expanded;
      $("pf-user-button").setAttribute("aria-expanded", String(expanded));
    });

    document.addEventListener("click", (e) => {
      if (!$("pf-user-button")?.contains(e.target) && !$("pf-user-menu")?.contains(e.target)) {
        $("pf-user-menu").hidden = true;
        $("pf-user-button")?.setAttribute("aria-expanded", "false");
      }
    });

    // Sign out
    $("pf-signout")?.addEventListener("click", async () => {
      try {
        await call("logout", {});
      } catch (_) {}
      location.replace("/panelflow/login");
    });

    // Mobile sidebar toggle
    const toggle  = $("pf-menu-toggle");
    const sidebar = $("pf-sidebar");
    toggle?.addEventListener("click", () => {
      if (window.innerWidth < 760) {
        const open = sidebar.classList.toggle("open");
        toggle.setAttribute("aria-expanded", String(open));
      } else {
        const collapsed = root.classList.toggle("pf-sidebar-collapsed");
        toggle.setAttribute("aria-expanded", String(!collapsed));
      }
    });
    const syncSidebarToggle = () => {
      if (window.innerWidth < 760) {
        toggle?.setAttribute("aria-expanded", String(sidebar.classList.contains("open")));
      } else {
        toggle?.setAttribute("aria-expanded", String(!root.classList.contains("pf-sidebar-collapsed")));
      }
    };
    window.addEventListener("resize", syncSidebarToggle);
    syncSidebarToggle();

    // Close sidebar on outside click (mobile)
    document.addEventListener("click", (e) => {
      if (window.innerWidth < 760 && sidebar.classList.contains("open")
        && !sidebar.contains(e.target) && !toggle?.contains(e.target)) {
        sidebar.classList.remove("open");
        toggle?.setAttribute("aria-expanded", "false");
      }
    });

    // Keyboard close sidebar
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && sidebar.classList.contains("open")) {
        sidebar.classList.remove("open");
        toggle?.setAttribute("aria-expanded", "false");
        toggle?.focus();
      }
    });
  }

  // ── Bootstrap + init ──────────────────────────────────────────────────────
  async function init() {
    wireUI();
    setupSearch();

    try {
      state.boot = await call("panelflow.portal.get_bootstrap");
      renderSidebarWorkspaces();
      renderUserInfo();
      loadNotifications();
      window.addEventListener("hashchange", renderRoute);
      renderRoute();
    } catch (error) {
      main.innerHTML = `<div class="pf-error">
        Could not load your workspace. ${esc(error.message)}
        <p><a href="/panelflow/login" class="pf-btn" style="margin-top:14px">Sign in again</a></p>
      </div>`;
    }
  }

  // ── Public surface ────────────────────────────────────────────────────────
  window.PanelFlowPortal = { call, state, esc, linkFor, listLink, renderRecord, renderRoute, renderOverview };

  init();
})();
