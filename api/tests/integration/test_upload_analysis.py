"""Slice B end-to-end: presign → register analysis (OCR stub) → patient edit →
file proxy → complaints. Asserts per-field confidence (INV-AI-2), append-only OCR
revision (INV-AI-3), and that the patient edit touches only the transcription axis.
"""

from __future__ import annotations

import uuid

import httpx
import pytest
import sqlalchemy as sa
from app.infra import s3_client
from app.main import app
from app.seed.seed import seed_demo
from httpx import ASGITransport

from tests.conftest import requires_db

pytestmark = [pytest.mark.integration, requires_db]


async def _patient_token() -> dict[str, str]:
    dept = (await seed_demo())["department_public_id"]
    phone = f"+79{uuid.uuid4().int % 10**9:09d}"
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        await c.post(
            "/v1/onboarding/commit",
            json={
                "department_public_id": dept,
                "name": "Волков Сергей Николаевич",
                "dob": "1968-03-12",
                "gender": "male",
                "phone": phone,
                "consents": [
                    {
                        "consent_type": "pdn_general",
                        "legal_text_version": "2026.04.23",
                        "ack_mechanism": "scroll_to_end",
                    }
                ],
                "document_hash": "sha256:demo",
            },
            headers={"Idempotency-Key": str(uuid.uuid4())},
        )
        tok = (
            await c.post("/v1/auth/patient/otp/verify", json={"phone": phone, "code": "0000"})
        ).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


async def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://t")


async def test_upload_glucose_low_confidence_and_patient_edit(
    superuser_engine: sa.Engine,
) -> None:
    auth = await _patient_token()
    async with await _client() as c:
        # presign
        sign = await c.post("/v1/uploads/sign", json={"content_type": "image/jpeg"}, headers=auth)
        assert sign.status_code == 200
        object_key = sign.json()["object_key"]
        assert object_key.startswith("quarantine/")  # UUID-only key (INV-RES-3)

        # register a glucose analysis → OCR stub emits one low-confidence field
        reg = await c.post(
            "/v1/analyses",
            json={"object_key": object_key, "analysis_type": "glucose", "label": "Глюкоза",
                  "lab_date": "2026-03-22"},
            headers={**auth, "Idempotency-Key": str(uuid.uuid4())},
        )
        assert reg.status_code == 200, reg.text
        analysis = reg.json()
        assert analysis["status"] == "structured"
        assert len(analysis["fields"]) == 1
        field = analysis["fields"][0]
        assert field["field_key"] == "Глюкоза"
        assert field["low_confidence"] is True  # per-field flag (INV-AI-2)
        assert field["patient_transcription_state"] == "pending"

        analysis_id = analysis["public_id"]

        # patient corrects the reading → append-only revision (INV-AI-3)
        edit = await c.patch(
            f"/v1/analyses/{analysis_id}/ocr-fields/Глюкоза",
            json={"value": "7.2"},
            headers=auth,
        )
        assert edit.status_code == 200, edit.text
        edited = edit.json()["fields"][0]
        assert edited["raw_value"] == "7.2"
        assert edited["patient_transcription_state"] == "confirmed"  # patient axis only
        assert edited["doctor_metadata_verdict"] == "none"  # doctor axis untouched (INV-AI-4)

        # list shows the analysis
        lst = await c.get("/v1/analyses", headers=auth)
        assert any(a["public_id"] == analysis_id for a in lst.json())

    # A revision row exists capturing old→new (no silent overwrite, INV-AI-3)
    with superuser_engine.connect() as conn:
        rev = conn.execute(
            sa.text(
                "SELECT old_raw_value, new_raw_value, edited_by_type FROM app.ocr_field_revision r "
                "JOIN app.ocr_field f ON f.internal_id = r.ocr_field_id "
                "JOIN app.analysis a ON a.internal_id = f.analysis_id "
                "WHERE a.public_id = :a"
            ),
            {"a": analysis_id},
        ).one()
    assert rev.old_raw_value == "7.1" and rev.new_raw_value == "7.2"
    assert rev.edited_by_type == "patient"


async def test_file_proxy_reads_uploaded_object() -> None:
    auth = await _patient_token()
    async with await _client() as c:
        sign = (await c.post("/v1/uploads/sign", json={}, headers=auth)).json()
        # simulate the client's presigned PUT by writing the bytes directly
        s3_client.put_bytes(sign["object_key"], b"%PDF-1.4 demo", "application/pdf")
        doc = await c.post(
            "/v1/documents",
            json={"object_key": sign["object_key"], "document_type": "referral",
                  "label": "Направление", "issuer_name": "Поликлиника №3"},
            headers=auth,
        )
        assert doc.status_code == 200, doc.text
        doc_id = doc.json()["public_id"]

        # backend-proxied read returns the bytes (no presigned GET, INV-RV-2)
        f = await c.get(f"/v1/files/{doc_id}", headers=auth)
        assert f.status_code == 200
        assert f.content == b"%PDF-1.4 demo"


async def test_complaint_crud() -> None:
    auth = await _patient_token()
    async with await _client() as c:
        add = await c.post(
            "/v1/complaints",
            json={"text": "Утром сахар выше 8", "tags": ["glucose"], "priority": 1},
            headers=auth,
        )
        assert add.status_code == 200, add.text
        cid = add.json()["public_id"]
        assert add.json()["tags"] == ["glucose"]

        upd = await c.patch(
            f"/v1/complaints/{cid}", json={"priority": 2, "tags": ["glucose", "sleep"]}, headers=auth
        )
        assert upd.status_code == 200
        assert upd.json()["priority"] == 2
        assert upd.json()["edited_at"] is not None

        lst = await c.get("/v1/complaints", headers=auth)
        assert any(x["public_id"] == cid for x in lst.json())
