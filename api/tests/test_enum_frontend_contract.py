"""Contract guard: the plan enums' wire values ARE the de-facto API contract with
the patient frontend (the store persists them in localStorage). Drift here silently
breaks integration — exactly the bug this test was added to prevent.

The sets below mirror the unions in
``inteldoc_patient_prototype/src/store/types.ts`` (OrderKind / OrderIntent /
PlanItemStatus). If you change a backend wire value, change the frontend union in
the same PR — or this test fails. No DB needed.
"""

from __future__ import annotations

from app.domain.enums import OrderIntent, OrderKind, PlanItemStatus

# --- mirror of the frontend store unions (store/types.ts) ---
FRONTEND_ORDER_KIND = {"lab", "instrumental", "referral", "self-monitor"}
FRONTEND_ORDER_INTENT = {
    "before-visit",
    "dynamics-control",
    "additional-check",
    "ocr-clarification",
}
FRONTEND_PLAN_ITEM_STATUS = {"assigned", "uploaded", "acknowledged"}


def test_order_kind_wire_values_match_frontend() -> None:
    assert {e.value for e in OrderKind} == FRONTEND_ORDER_KIND


def test_order_intent_wire_values_match_frontend() -> None:
    assert {e.value for e in OrderIntent} == FRONTEND_ORDER_INTENT


def test_plan_item_status_wire_values_match_frontend() -> None:
    assert {e.value for e in PlanItemStatus} == FRONTEND_PLAN_ITEM_STATUS
