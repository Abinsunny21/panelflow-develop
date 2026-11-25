# Copyright (c) 2026, Abin and contributors
# For license information, please see license.txt

import math

import frappe  # type: ignore[reportMissingImports]
from frappe import _  # type: ignore[reportMissingImports]
from frappe.model.document import Document  # type: ignore[reportMissingImports]
from frappe.utils import flt  # type: ignore[reportMissingImports]


class PanelFlowSettings(Document):
    def validate(self):
        fields = (
            "quotation_approval_limit",
            "purchase_manager_approval_limit",
            "purchase_senior_approval_limit",
        )

        for fieldname in fields:
            value = flt(self.get(fieldname))

            if not math.isfinite(value) or value <= 0:
                frappe.throw(
                    _("{0} must be a positive, finite amount.").format(
                        self.meta.get_label(fieldname)
                    )
                )

        if flt(self.purchase_senior_approval_limit) <= flt(
            self.purchase_manager_approval_limit
        ):
            frappe.throw(
                _(
                    "Purchase Senior Approval Limit must be greater "
                    "than Purchase Manager Approval Limit."
                )
            )