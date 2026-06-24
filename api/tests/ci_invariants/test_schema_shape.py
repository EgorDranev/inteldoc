"""Schema-shape invariants provable from ORM metadata + OpenAPI (no DB needed).

Covers INV-ID-1 (PII only in identity), INV-ID-5 (no serial PK; uuids on API),
INV-AC-6 (explicit grant fields, no opaque scope literal), INV-AI-7 (no
diagnostic route segments), INV-CO-1/2 (consent carries version + ack mechanism).
"""

from __future__ import annotations

import app.db.models  # noqa: F401 — populate metadata
from app.db.base import Base
from app.main import app as fastapi_app

# Direct PATIENT PII column names (data-model patient_pii). Generic org/staff
# ``name`` is NOT patient PII (doctor.name is the separately-tracked Q15 item).
PII_COLUMN_NAMES = {
    "full_name", "birth_date", "dob", "phone", "phone_e164",
    "snils", "oms", "email", "passport",
}
# phone_e164 is allowed on user_account (login mirror) — but never carries ФИО etc.
PII_ALLOWED_OUTSIDE_IDENTITY = {("app", "user_account", "phone_e164")}


def test_inv_id_1_pii_only_in_identity_schema() -> None:
    offenders: list[str] = []
    for table in Base.metadata.sorted_tables:
        if table.schema == "identity":
            continue
        for col in table.columns:
            if col.name in PII_COLUMN_NAMES:
                if (table.schema, table.name, col.name) in PII_ALLOWED_OUTSIDE_IDENTITY:
                    continue
                offenders.append(f"{table.schema}.{table.name}.{col.name}")
    assert not offenders, f"PII columns outside identity schema: {offenders}"


def test_inv_id_5_no_serial_pk_all_uuid() -> None:
    import uuid as _uuid

    for table in Base.metadata.sorted_tables:
        for col in table.primary_key.columns:
            assert col.autoincrement is not True, f"{table.name}.{col.name} autoincrements"
            assert col.type.python_type is _uuid.UUID, (
                f"{table.fullname}.{col.name} PK is not uuid"
            )


def test_inv_ac_6_grant_has_explicit_fields_no_scope_literal() -> None:
    grant = Base.metadata.tables["app.access_grant"]
    cols = set(grant.columns.keys())
    assert {"granted_to_type", "data_scope", "valid_from", "expires_at", "revoked_at"} <= cols
    assert "scope" not in cols, "opaque 'scope' literal column must not exist (INV-AC-6)"


def test_inv_co_1_2_consent_record_has_version_and_mechanism() -> None:
    rec = Base.metadata.tables["app.consent_record"]
    cols = set(rec.columns.keys())
    assert "legal_text_version" in cols  # INV-CO-1
    assert "ack_mechanism" in cols  # INV-CO-2


def test_inv_ai_7_no_diagnostic_route_segments() -> None:
    forbidden = ("/diagnose", "/prescribe", "/recommend-treatment")
    paths = fastapi_app.openapi()["paths"].keys()
    for p in paths:
        for seg in forbidden:
            assert seg not in p, f"forbidden segment {seg} in {p}"
