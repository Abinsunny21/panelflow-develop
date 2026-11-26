/**
 * PanelFlow Portal — Document form engine.
 * Opens, edits, creates and maps Frappe documents inside the portal SPA.
 * Follows Frappe standard doctype field rendering, layouts, sections,
 * child tables, and dynamic link resolution.
 */
(function () {
  "use strict";

  function apiCall(method, args, write = false) {
    const csrfNode = document.querySelector('meta[name="csrf-token"]');
    const url = new URL("/api/method/" + method, location.origin);
    const options = {
      credentials: "same-origin",
      cache: "no-store",
      method: write ? "POST" : "GET",
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
        url.searchParams.set(key, typeof value === "object" ? JSON.stringify(value) : value)
      );
    }
    return fetch(url, options)
      .then((r) => r.json().then((data) => ({ response: r, data })))
      .then(({ response, data }) => {
        if (response.status === 401 || response.status === 403) {
          const session = fetch("/api/method/frappe.auth.get_logged_user", {
            credentials: "same-origin", cache: "no-store",
          }).then((r) => r.json()).catch(() => ({}));
          session.then((s) => {
            if (!s.message || s.message === "Guest") {
              location.replace("/panelflow/login?redirect-to=" + encodeURIComponent("/panelflow/workspace" + location.hash));
            }
          });
        }
        if (!response.ok || data.exc) {
          let message = data.exception || "The operation could not be completed.";
          try { message = JSON.parse(data._server_messages).map((x) => JSON.parse(x).message).join("\n"); } catch (_) {}
          throw new Error(message.replace(/<[^>]+>/g, ""));
        }
        return data;
      });
  }

  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  function prettyLabel(key) {
    return String(key || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const supported = new Set([
    "Data", "Link", "Dynamic Link", "Select", "Small Text", "Text",
    "Long Text", "Text Editor", "Int", "Float", "Currency", "Percent",
    "Date", "Datetime", "Time", "Check", "Read Only"
  ]);

  const mappings = {
    Lead: [
      ["Opportunity", "erpnext.crm.doctype.lead.lead.make_opportunity"],
      ["Quotation",   "erpnext.crm.doctype.lead.lead.make_quotation"],
      ["Customer",    "erpnext.crm.doctype.lead.lead.make_customer"],
    ],
    Opportunity: [
      ["Quotation", "erpnext.crm.doctype.opportunity.opportunity.make_quotation"],
    ],
    Quotation: [
      ["Sales Order", "erpnext.selling.doctype.quotation.quotation.make_sales_order"],
    ],
    "Sales Order": [
      ["Delivery Note", "erpnext.selling.doctype.sales_order.sales_order.make_delivery_note"],
      ["Sales Invoice", "erpnext.selling.doctype.sales_order.sales_order.make_sales_invoice"],
    ],
    "Material Request": [
      ["Purchase Order",         "erpnext.stock.doctype.material_request.material_request.make_purchase_order"],
      ["Request for Quotation",  "erpnext.stock.doctype.material_request.material_request.make_request_for_quotation"],
    ],
    "Request for Quotation": [
      ["Supplier Quotation", "erpnext.buying.doctype.request_for_quotation.request_for_quotation.make_supplier_quotation_from_rfq"],
    ],
    "Supplier Quotation": [
      ["Purchase Order", "erpnext.buying.doctype.supplier_quotation.supplier_quotation.make_purchase_order"],
    ],
    "Purchase Order": [
      ["Purchase Receipt", "erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_receipt"],
      ["Purchase Invoice", "erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_invoice"],
    ],
    "Purchase Receipt": [
      ["Purchase Invoice", "erpnext.stock.doctype.purchase_receipt.purchase_receipt.make_purchase_invoice"],
      ["Return",           "erpnext.stock.doctype.purchase_receipt.purchase_receipt.make_purchase_return"],
    ],
    "Delivery Note": [
      ["Sales Invoice", "erpnext.stock.doctype.delivery_note.delivery_note.make_sales_invoice"],
      ["Return",        "erpnext.stock.doctype.delivery_note.delivery_note.make_sales_return"],
    ],
    "Sales Invoice": [
      ["Return", "erpnext.accounts.doctype.sales_invoice.sales_invoice.make_sales_return"],
    ],
    "Purchase Invoice": [
      ["Debit Note", "erpnext.accounts.doctype.purchase_invoice.purchase_invoice.make_debit_note"],
    ],
  };

  window.PanelFlowForms = {
    async open(doctype, name, mapped) {
      const host = document.getElementById("pf-main");
      host.innerHTML = `<div class="pf-loading">Loading ${esc(name || "new " + doctype)}…</div>`;

      try {
        const bundle = (await apiCall("frappe.desk.form.load.getdoctype", { doctype })).docs;
        const meta   = bundle.find((x) => x.name === doctype);

        let doc = mapped || (name
          ? (await apiCall("frappe.client.get", { doctype, name })).message
          : { doctype });

        const perm = (await apiCall("frappe.client.has_permission", {
          doctype,
          docname: name || "",
          perm_type: name ? "write" : "create",
        })).message;

        if (!perm?.has_permission) {
          throw new Error(`Your account cannot ${name ? "edit" : "create"} this document.`);
        }

        if (doc.docstatus === 2) {
          throw new Error("Cancelled documents cannot be edited.");
        }

        const boot = (await apiCall("panelflow.portal.get_bootstrap", {})).message;
        if (!name) {
          doc.company ||= boot.default_company;
          if (!doc.currency && doc.company) {
            try {
              doc.currency = (await apiCall("frappe.client.get_value", {
                doctype: "Company",
                filters: { name: doc.company },
                fieldname: "default_currency",
              })).message.default_currency;
            } catch (_) {}
          }
          doc.conversion_rate ||= 1;
          if (meta.fields.some((f) => f.fieldname === "posting_time")) {
            doc.posting_time ||= new Date().toTimeString().slice(0, 8);
          }
          if (doctype === "Quotation") {
            doc.quotation_to ||= "Customer";
          }
          if (doctype === "Lead") {
            doc.status ||= "Lead";
          }
        }

        const title = name ? `${name}` : `New ${doctype}`;

        host.innerHTML = `
<div class="pf-page-head">
  <div>
    <div class="pf-eyebrow">Document Editor / ${esc(doctype)}</div>
    <h1>${esc(title)}</h1>
  </div>
  <div style="display:flex;gap:10px;align-items:center;">
    <a class="pf-btn" href="#/list/${encodeURIComponent(doctype)}">← Back to list</a>
  </div>
</div>
<form id="pf-editor" novalidate>
  <div id="pf-form-sections"></div>
  <div id="pf-form-tables"></div>
  <p id="pf-save-error" role="alert" aria-live="polite" style="color:var(--pf-danger);font-size:13px;padding:8px 0;font-weight:600;"></p>
  <div class="pf-actions">
    <button class="pf-btn primary" type="submit" id="pf-save-btn">Save Document</button>
  </div>
</form>`;

        const form   = document.getElementById("pf-editor");
        const errors = document.getElementById("pf-save-error");
        const actions = form.querySelector(".pf-actions");
        const sectionsContainer = document.getElementById("pf-form-sections");

        if (name && !doc.docstatus && meta.is_submittable && !doc.workflow_state) {
          const submitPerm = (await apiCall("frappe.client.has_permission", {
            doctype, docname: name, perm_type: "submit",
          })).message;
          if (submitPerm?.has_permission) {
            const submitBtn = document.createElement("button");
            submitBtn.type = "button";
            submitBtn.className = "pf-btn";
            submitBtn.textContent = "Submit";
            submitBtn.addEventListener("click", async () => {
              submitBtn.disabled = true;
              errors.textContent = "";
              try {
                const result = await apiCall("frappe.client.submit", { doc }, true);
                location.hash = "#/record/" + encodeURIComponent(doctype) + "/" + encodeURIComponent(result.message.name);
              } catch (err) {
                errors.textContent = err.message;
                submitBtn.disabled = false;
              }
            });
            actions.appendChild(submitBtn);
          }
        }

        function createSectionCard(title = "General Details") {
          const panel = document.createElement("div");
          panel.className = "pf-panel";
          panel.style.marginBottom = "20px";
          panel.innerHTML = `
            <div class="pf-panel-head"><strong>${esc(title)}</strong></div>
            <div class="pf-editor-fields"></div>
          `;
          sectionsContainer.appendChild(panel);
          return panel.querySelector(".pf-editor-fields");
        }

        let currentFieldsGrid = createSectionCard("Primary Information");

        for (const field of meta.fields || []) {
          if (field.fieldtype === "Section Break") {
            if (field.label) {
              currentFieldsGrid = createSectionCard(field.label);
            }
            continue;
          }

          if (field.fieldtype === "Column Break") {
            continue;
          }

          if (
            field.hidden ||
            (field.read_only && !name && !field.default) ||
            Number(field.permlevel || 0) > 0 ||
            (doc.docstatus === 1 && !field.allow_on_submit) ||
            !supported.has(field.fieldtype)
          ) continue;

          if (objectVal(doc, field.fieldname) == null && field.default && !String(field.default).startsWith(":")) {
            doc[field.fieldname] =
              field.default === "Today"   ? new Date().toISOString().slice(0, 10) :
              field.default === "__user"  ? document.getElementById("pf-portal")?.dataset.user :
              field.default;
          }

          if (field.fieldtype === "Check") {
            doc[field.fieldname] = Number(doc[field.fieldname] || 0);
          }

          if (["Float", "Currency", "Percent", "Int"].includes(field.fieldtype) &&
              doc[field.fieldname] != null && doc[field.fieldname] !== "") {
            doc[field.fieldname] = Number(doc[field.fieldname]);
          }

          renderFieldInput(currentFieldsGrid, meta, doc, field);
        }

        const tablesContainer = document.getElementById("pf-form-tables");
        for (const field of meta.fields.filter(
          (f) => f.fieldtype === "Table" && !f.hidden && !f.read_only && Number(f.permlevel || 0) === 0
        )) {
          if (doc.docstatus === 1 && !field.allow_on_submit) continue;
          const childMeta = bundle.find((x) => x.name === field.options);
          if (!childMeta) continue;

          doc[field.fieldname] ||= [];

          const section = document.createElement("section");
          section.className = "pf-panel pf-edit-table";
          section.style.marginBottom = "20px";
          section.innerHTML = `
<div class="pf-panel-head">
  <strong>${esc(field.label || field.fieldname)}</strong>
  <button type="button" class="pf-btn primary" id="add-row-${field.fieldname}">+ Add row</button>
</div>
<div class="pf-child-rows"></div>`;

          const rowsContainer = section.querySelector(".pf-child-rows");

          function renderChildRows() {
            rowsContainer.replaceChildren();
            if (!doc[field.fieldname].length) {
              rowsContainer.innerHTML = `<div class="pf-empty" style="padding:20px;">No rows added yet. Click "+ Add row" to insert line items.</div>`;
              return;
            }
            doc[field.fieldname].forEach((row, index) => {
              const block = document.createElement("details");
              block.open = true;
              block.className = "pf-child-block";
              const summary = document.createElement("summary");
              summary.textContent = `Row #${index + 1}${row.item_code ? " — " + row.item_code : ""}${row.item_name ? " (" + row.item_name + ")" : ""}${row.qty ? " × " + row.qty : ""}`;
              block.appendChild(summary);

              const grid = document.createElement("div");
              grid.className = "pf-editor-fields";
              for (const childField of childMeta.fields || []) {
                if (childField.hidden || !supported.has(childField.fieldtype) || Number(childField.permlevel || 0) > 0) continue;
                renderFieldInput(grid, childMeta, row, childField, doc);
              }
              block.appendChild(grid);

              const removeBtn = document.createElement("button");
              removeBtn.type = "button";
              removeBtn.className = "pf-btn danger";
              removeBtn.style.margin = "10px 20px 16px";
              removeBtn.textContent = "Remove row";
              removeBtn.addEventListener("click", () => {
                doc[field.fieldname].splice(index, 1);
                renderChildRows();
                triggerSubtotal();
              });
              block.appendChild(removeBtn);
              rowsContainer.appendChild(block);
            });
          }

          section.querySelector(`#add-row-${field.fieldname}`).addEventListener("click", () => {
            doc[field.fieldname].push({ doctype: field.options });
            renderChildRows();
            triggerSubtotal();
          });
          renderChildRows();
          tablesContainer.appendChild(section);
        }

        let subtotalEl = null;
        function triggerSubtotal() {
          if (!doc.items || !subtotalEl) return;
          const value = (doc.items || []).reduce((sum, row) => sum + Number(row.qty || 0) * Number(row.rate || 0), 0);
          subtotalEl.innerHTML = `<strong>Items Subtotal (preview):</strong> <span style="font-size:16px;color:var(--pf-plum);font-weight:700;">${new Intl.NumberFormat("en-IN", { style: "currency", currency: doc.currency || "INR" }).format(value)}</span>`;
        }

        if (doc.items || meta.fields.some(f => f.fieldname === "items")) {
          subtotalEl = document.createElement("div");
          subtotalEl.className = "pf-panel";
          subtotalEl.style.padding = "16px 20px";
          subtotalEl.style.marginBottom = "20px";
          actions.before(subtotalEl);
          form.addEventListener("input", triggerSubtotal);
          triggerSubtotal();
        }

        if (name && doc.docstatus === 1) {
          const cancelPerm = (await apiCall("frappe.client.has_permission", {
            doctype, docname: name, perm_type: "cancel",
          })).message;
          if (cancelPerm?.has_permission && !doc.workflow_state) {
            const cancelBtn = document.createElement("button");
            cancelBtn.type = "button";
            cancelBtn.className = "pf-btn danger";
            cancelBtn.textContent = "Cancel document";
            cancelBtn.addEventListener("click", () => {
              const confirmBtn = document.createElement("button");
              confirmBtn.type = "button";
              confirmBtn.className = "pf-btn danger";
              confirmBtn.textContent = "Confirm cancellation";
              confirmBtn.addEventListener("click", async () => {
                confirmBtn.disabled = true;
                errors.textContent = "";
                try {
                  await apiCall("frappe.client.cancel", { doctype, name }, true);
                  location.hash = "#/record/" + encodeURIComponent(doctype) + "/" + encodeURIComponent(name);
                } catch (err) {
                  errors.textContent = err.message;
                  confirmBtn.disabled = false;
                }
              });
              cancelBtn.replaceWith(confirmBtn);
            });
            actions.appendChild(cancelBtn);
          }
        }

        if (name && !doc.docstatus) {
          const deletePerm = (await apiCall("frappe.client.has_permission", {
            doctype, docname: name, perm_type: "delete",
          })).message;
          if (deletePerm?.has_permission) {
            const deleteBtn = document.createElement("button");
            deleteBtn.type = "button";
            deleteBtn.className = "pf-btn danger";
            deleteBtn.textContent = "Delete draft";
            deleteBtn.addEventListener("click", () => {
              const confirmBtn = document.createElement("button");
              confirmBtn.type = "button";
              confirmBtn.className = "pf-btn danger";
              confirmBtn.textContent = "Confirm delete";
              confirmBtn.addEventListener("click", async () => {
                confirmBtn.disabled = true;
                errors.textContent = "";
                try {
                  await apiCall("frappe.client.delete", { doctype, name }, true);
                  location.hash = "#/list/" + encodeURIComponent(doctype);
                } catch (err) {
                  errors.textContent = err.message;
                  confirmBtn.disabled = false;
                }
              });
              deleteBtn.replaceWith(confirmBtn);
            });
            actions.appendChild(deleteBtn);
          }
        }

        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          errors.textContent = "";

          if (doctype === "Purchase Receipt") {
            for (const row of doc.items || []) {
              row.received_qty = Number(row.qty || 0) + Number(row.rejected_qty || 0);
            }
          }

          const saveBtn = document.getElementById("pf-save-btn");
          saveBtn.disabled = true;
          saveBtn.textContent = "Saving…";

          try {
            const result = await apiCall("frappe.client.save", { doc }, true);
            doc = result.message;
            if (window.PanelFlowPortal?.toast) {
              window.PanelFlowPortal.toast(`${doctype} saved successfully!`);
            }
            location.hash = "#/record/" + encodeURIComponent(doctype) + "/" + encodeURIComponent(doc.name);
          } catch (err) {
            errors.textContent = err.message;
            saveBtn.disabled = false;
            saveBtn.textContent = "Save Document";
            errors.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        });

      } catch (error) {
        host.innerHTML = `<div class="pf-error">${esc(error.message)}</div>`;
      }
    },

    async map(method, source, extra = {}) {
      try {
        const result = await apiCall(method, { source_name: source, ...extra }, true);
        const doc    = result.message;
        if (!doc || !doc.doctype) {
          throw new Error("The mapping did not return a document.");
        }
        await window.PanelFlowForms.open(doc.doctype, null, doc);
      } catch (error) {
        const host = document.getElementById("pf-main");
        const errorEl = document.createElement("p");
        errorEl.className = "pf-error";
        errorEl.setAttribute("role", "alert");
        errorEl.textContent = error.message;
        host.insertAdjacentElement("afterbegin", errorEl);
      }
    },
  };

  function objectVal(obj, key) {
    return obj ? obj[key] : undefined;
  }

  function renderFieldInput(container, metadata, targetDoc, field, parentDoc = null) {
    const label = document.createElement("label");
    label.className = "pf-edit-field";
    label.innerHTML = `<span>${esc(field.label || prettyLabel(field.fieldname))}${field.reqd ? ' <strong style="color:var(--pf-danger)">*</strong>' : ""}</span>`;

    const tagName = field.fieldtype === "Select" ? "select" :
                    ["Text", "Long Text", "Text Editor", "Small Text"].includes(field.fieldtype) ? "textarea" : "input";
    const input = document.createElement(tagName);
    input.className = tagName === "textarea" ? "pf-input pf-textarea" : "pf-input";

    if (tagName === "select") {
      input.appendChild(new Option("Select " + (field.label || field.fieldname), ""));
      String(field.options || "").split("\n").forEach((opt) => {
        if (opt.trim()) input.appendChild(new Option(opt.trim(), opt.trim()));
      });
    } else if (tagName === "input") {
      const typeMap = {
        Check: "checkbox",
        Date: "date",
        Datetime: "datetime-local",
        Time: "time",
        Int: "number",
        Float: "number",
        Currency: "number",
        Percent: "number",
      };
      input.type = typeMap[field.fieldtype] || "text";
      if (input.type === "time" || input.type === "datetime-local") input.step = "1";
      if (input.type === "number") input.step = field.fieldtype === "Int" ? "1" : "any";
    }

    input.dataset.fieldname = field.fieldname;
    input.required = Boolean(field.reqd);
    input.setAttribute("aria-label", field.label || field.fieldname);

    const currentVal = targetDoc[field.fieldname];
    if (input.type === "datetime-local") {
      input.value = String(currentVal || "").replace(" ", "T");
    } else if (input.type === "checkbox") {
      input.checked = Boolean(Number(currentVal));
    } else {
      input.value = currentVal ?? "";
    }

    if (tagName === "select" && currentVal) {
      input.value = currentVal;
    }

    input.addEventListener("input", () => {
      targetDoc[field.fieldname] =
        input.type === "checkbox" ? Number(input.checked) :
        input.type === "number"   ? (input.value === "" ? null : Number(input.value)) :
        input.value;
    });

    label.appendChild(input);

    if (field.fieldname === "item_code" && parentDoc && metadata.name !== parentDoc.doctype) {
      const itemFeedback = document.createElement("small");
      itemFeedback.setAttribute("role", "alert");
      itemFeedback.style.cssText = "display:block;color:var(--pf-danger);font-size:12px;margin-top:4px;";
      label.appendChild(itemFeedback);
      input.addEventListener("change", async () => {
        if (!input.value) return;
        const selectedItem = input.value;
        targetDoc.item_code = selectedItem;
        itemFeedback.textContent = "";
        try {
          let result;
          if (parentDoc.doctype === "Stock Entry") {
            result = await apiCall("run_doc_method", { method: "get_item_details", docs: targetDoc, args: { item_code: input.value, qty: targetDoc.qty || 1 } }, true);
          } else if (["BOM", "Work Order", "Request for Quotation"].includes(parentDoc.doctype)) {
            const item = (await apiCall("frappe.client.get_value", { doctype: "Item", filters: { name: input.value }, fieldname: ["item_name", "description", "stock_uom"] })).message;
            result = { message: { item_name: item.item_name, description: item.description, uom: item.stock_uom, conversion_factor: 1 } };
          } else {
            const args = {
              item_code: selectedItem,
              qty: targetDoc.qty || 1,
              uom: targetDoc.uom,
              conversion_factor: targetDoc.conversion_factor,
              warehouse: targetDoc.warehouse,
              set_warehouse: parentDoc.set_warehouse,
              customer: parentDoc.customer || parentDoc.party_name,
              quotation_to: parentDoc.quotation_to,
              supplier: parentDoc.supplier,
              currency: parentDoc.currency,
              is_internal_supplier: parentDoc.is_internal_supplier,
              is_internal_customer: parentDoc.is_internal_customer,
              conversion_rate: parentDoc.conversion_rate || 1,
              price_list: parentDoc.selling_price_list || parentDoc.buying_price_list,
              price_list_currency: parentDoc.price_list_currency,
              plc_conversion_rate: parentDoc.plc_conversion_rate,
              company: parentDoc.company,
              order_type: parentDoc.order_type,
              is_pos: parentDoc.is_pos,
              is_return: parentDoc.is_return,
              return_against: parentDoc.return_against,
              is_subcontracted: parentDoc.is_subcontracted,
              ignore_pricing_rule: parentDoc.ignore_pricing_rule,
              doctype: parentDoc.doctype,
              name: parentDoc.name,
              project: targetDoc.project || parentDoc.project,
              net_rate: targetDoc.rate,
              base_net_rate: targetDoc.base_net_rate,
              stock_qty: targetDoc.stock_qty,
              weight_per_unit: targetDoc.weight_per_unit,
              weight_uom: targetDoc.weight_uom,
              manufacturer: targetDoc.manufacturer,
              stock_uom: targetDoc.stock_uom,
              cost_center: targetDoc.cost_center,
              tax_category: parentDoc.tax_category,
              item_tax_template: targetDoc.item_tax_template,
              child_doctype: targetDoc.doctype,
              child_docname: targetDoc.name,
              is_old_subcontracting_flow: parentDoc.is_old_subcontracting_flow,
            };
            result = await apiCall("erpnext.stock.get_item_details.get_item_details", {
              args,
              doc: parentDoc,
            }, true);
          }
          if (input.value !== selectedItem) return;
          if (!result?.message) throw new Error("No item details were returned.");
          Object.assign(targetDoc, result.message);
          Object.entries(result.message).forEach(([key, value]) => {
            const related = container.querySelector(`[data-fieldname="${key}"]`);
            if (!related) return;
            if (related.type === "checkbox") {
              related.checked = Boolean(Number(value));
            } else {
              related.value = value ?? "";
            }
          });
          input.closest("form")?.dispatchEvent(new Event("input", { bubbles: true }));
        } catch (error) {
          itemFeedback.textContent = error.message || "Could not load item details.";
        }
      });
    }

    if (["Link", "Dynamic Link"].includes(field.fieldtype)) {
      const datalist = document.createElement("datalist");
      datalist.id = "pf-link-" + Math.random().toString(36).slice(2);
      input.setAttribute("list", datalist.id);
      label.appendChild(datalist);
      let linkTimer;
      input.addEventListener("input", () => {
        clearTimeout(linkTimer);
        linkTimer = setTimeout(async () => {
          try {
            const linkDoctype = field.fieldtype === "Dynamic Link"
              ? targetDoc[field.options]
              : field.options;
            if (!linkDoctype) return;
            const result = await apiCall("frappe.desk.search.search_link", {
              doctype: linkDoctype,
              txt: input.value,
              page_length: 20,
            });
            datalist.replaceChildren(
              ...(result.message || []).map((row) => new Option(row.description || row.value, row.value))
            );
          } catch (_) {}
        }, 250);
      });
    }

    container.appendChild(label);
  }

  new MutationObserver(async () => {
    const title   = document.querySelector("#pf-main h1");
    const actArea = document.querySelector("#pf-mapping-actions");
    if (!title || !actArea || actArea.dataset.mapped) return;
    actArea.dataset.mapped = "1";

    const parts = location.hash.split("?")[0].split("/").map(decodeURIComponent);
    const dt    = parts[2];
    const name  = parts[3];
    if (!dt || !name) return;

    let source;
    try {
      source = (await apiCall("frappe.client.get", { doctype: dt, name })).message;
    } catch (_) { return; }

    if (dt === "BOM" && source.docstatus === 1) {
      const perm = (await apiCall("frappe.client.has_permission", { doctype: "Work Order", docname: "", perm_type: "create" })).message;
      if (perm?.has_permission) {
        const btn = document.createElement("button");
        btn.className = "pf-btn";
        btn.textContent = "Create Work Order";
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          try {
            const result = await apiCall("erpnext.manufacturing.doctype.work_order.work_order.make_work_order", {
              bom_no: name, item: source.item, qty: source.quantity || 1, company: source.company,
            }, true);
            await window.PanelFlowForms.open("Work Order", null, result.message);
          } catch (err) {
            btn.disabled = false;
            const errEl = document.createElement("p");
            errEl.className = "pf-error";
            errEl.textContent = err.message;
            actArea.appendChild(errEl);
          }
        });
        actArea.appendChild(btn);
      }
    }

    if (dt === "Work Order" && source.docstatus === 1) {
      for (const purpose of ["Material Transfer for Manufacture", "Manufacture"]) {
        const perm = (await apiCall("frappe.client.has_permission", { doctype: "Stock Entry", docname: "", perm_type: "create" })).message;
        if (perm?.has_permission) {
          const btn = document.createElement("button");
          btn.className = "pf-btn";
          btn.textContent = purpose;
          btn.addEventListener("click", async () => {
            btn.disabled = true;
            try {
              const result = await apiCall("erpnext.manufacturing.doctype.work_order.work_order.make_stock_entry", {
                work_order_id: name, purpose,
              }, true);
              await window.PanelFlowForms.open("Stock Entry", null, result.message);
            } catch (err) {
              btn.disabled = false;
              const errEl = document.createElement("p");
              errEl.className = "pf-error";
              errEl.textContent = err.message;
              actArea.appendChild(errEl);
            }
          });
          actArea.appendChild(btn);
        }
      }
    }

    if (["Sales Invoice", "Purchase Invoice"].includes(dt) && source.docstatus === 1) {
      const perm = (await apiCall("frappe.client.has_permission", { doctype: "Payment Entry", docname: "", perm_type: "create" })).message;
      if (perm?.has_permission) {
        const btn = document.createElement("button");
        btn.className = "pf-btn";
        btn.textContent = "Record payment";
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          try {
            const result = await apiCall("erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry", {
              dt, dn: name,
            }, true);
            await window.PanelFlowForms.open("Payment Entry", null, result.message);
          } catch (err) {
            btn.disabled = false;
            btn.textContent = err.message;
          }
        });
        actArea.appendChild(btn);
      }
    }

    for (const [targetLabel, method] of mappings[dt] || []) {
      try {
        if (!["Lead", "Opportunity"].includes(dt) && source.docstatus !== 1) continue;
        const targetDoctype = targetLabel.replace("Return", dt === "Sales Invoice" ? "Sales Invoice" : dt === "Delivery Note" ? "Delivery Note" : dt === "Purchase Receipt" ? "Purchase Receipt" : "Purchase Invoice")
          .replace("Debit Note", "Purchase Invoice");
        const perm = (await apiCall("frappe.client.has_permission", { doctype: targetDoctype, docname: "", perm_type: "create" })).message;
        if (!perm?.has_permission) continue;
        const btn = document.createElement("button");
        btn.className = "pf-btn";
        btn.textContent = "Create " + targetLabel;
        btn.addEventListener("click", () => {
          btn.disabled = true;
          window.PanelFlowForms.map(method, name).finally(() => { btn.disabled = false; });
        });
        actArea.appendChild(btn);
      } catch (_) {}
    }
  }).observe(document.getElementById("pf-main"), { childList: true, subtree: true });

})();
