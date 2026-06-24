"""Synthetic Эндокор demo seed (spec §Mock data; mirrors the prototype seed).

Idempotent: re-running returns the existing Эндокор. Creates partner/clinic/department,
the attending doctor (Соколов А.В.) + login, an admin login, and a few legal text
versions. Base patients are created via the onboarding flow (``seed_doctor_demo``),
which then enriches them with today's appointments + analyses + complaints so the
doctor D01/D02 surfaces render with the canonical demo data.

Run: ``uv run python -m app.seed.seed`` (base only)
     ``uv run python -m app.seed.seed --doctor`` (base + doctor D01/D02 demo)
"""

from __future__ import annotations

import asyncio
import datetime as dt
import sys
import uuid
from typing import Any

from sqlalchemy import select

from app.core.security import hash_password
from app.db.models.clinical import (
    Analysis,
    Complaint,
    MedicalDocument,
    OcrField,
    StorageObject,
)
from app.db.models.core import (
    Appointment,
    Clinic,
    ConditionContext,
    Department,
    Doctor,
    Partner,
    Patient,
    UserAccount,
)
from app.db.models.identity import LegalTextVersion
from app.db.models.plan import DoctorRequest, PlanItem
from app.db.session import app_sessionmaker
from app.domain.enums import (
    AckMechanism,
    AnalysisStatus,
    AppointmentStatus,
    AppointmentType,
    ConsentType,
    DocumentProcessingStatus,
    DocumentType,
    PlanItemStatus,
    StorageZone,
    UserRole,
)
from app.domain.onboarding_plan import ConsentInput
from app.services.onboarding_service import CommitData, commit_onboarding

DEMO_DOCTOR_USERNAME = "sokolov"
DEMO_ADMIN_USERNAME = "admin"
DEMO_WEB_PASSWORD = "demo1234"

# Fixed phones → onboarding dedups on (partner, phone) so re-running is idempotent.
DEMO_PATIENT_MARIA_PHONE = "+79990000201"
DEMO_PATIENT_ANDREY_PHONE = "+79990000202"
DEMO_PATIENT_IGOR_PHONE = "+79990000203"

_LEGAL_VERSIONS = {
    ConsentType.PDN_GENERAL: "2026.04.23",
    ConsentType.PDN_SPECIAL: "2026.04.23",
    ConsentType.MEDICAL_DATA: "2026.04.23",
    ConsentType.CLINIC_TRANSFER: "2026.05.27",
    ConsentType.OCR_AI: "2026.05.27",
    ConsentType.MARKETING: "2026.04.23",
}


async def seed_demo() -> dict[str, Any]:
    now = dt.datetime.now(tz=dt.UTC)
    async with app_sessionmaker()() as session:
        async with session.begin():
            partner = await session.scalar(
                select(Partner).where(Partner.short_name == "Эндокор")
            )
            if partner is not None:
                clinic = await session.scalar(
                    select(Clinic).where(Clinic.partner_id == partner.internal_id)
                )
                dept = await session.scalar(
                    select(Department).where(Department.partner_id == partner.internal_id)
                )
                return {
                    "partner_public_id": str(partner.public_id),
                    "clinic_public_id": str(clinic.public_id) if clinic else None,
                    "department_public_id": str(dept.public_id) if dept else None,
                    "created": False,
                }

            partner = Partner(name="Медицинский центр «Эндокор»", short_name="Эндокор")
            session.add(partner)
            await session.flush()
            clinic = Clinic(
                partner_id=partner.internal_id, name="Медицинский центр «Эндокор»",
                short_name="Эндокор",
            )
            session.add(clinic)
            await session.flush()
            dept = Department(
                partner_id=partner.internal_id, clinic_id=clinic.internal_id,
                name="Отделение диабетологии",
            )
            session.add(dept)

            doc_account = UserAccount(
                partner_id=partner.internal_id, role=str(UserRole.DOCTOR),
                username=DEMO_DOCTOR_USERNAME, password_hash=hash_password(DEMO_WEB_PASSWORD),
            )
            admin_account = UserAccount(
                partner_id=partner.internal_id, role=str(UserRole.CLINIC_ADMIN),
                username=DEMO_ADMIN_USERNAME, password_hash=hash_password(DEMO_WEB_PASSWORD),
            )
            session.add_all([doc_account, admin_account])
            await session.flush()
            doctor = Doctor(
                partner_id=partner.internal_id, clinic_id=clinic.internal_id,
                department_id=dept.internal_id, name="Соколов А.В.",
                user_account_id=doc_account.internal_id,
            )
            session.add(doctor)

            for consent_type, version in _LEGAL_VERSIONS.items():
                session.add(
                    LegalTextVersion(
                        internal_id=uuid.uuid4(), consent_type=str(consent_type),
                        version=version, body=f"[demo legal text {consent_type} {version}]",
                        published_at=now,
                    )
                )

            return {
                "partner_public_id": str(partner.public_id),
                "clinic_public_id": str(clinic.public_id),
                "department_public_id": str(dept.public_id),
                "created": True,
            }


# ─── Doctor D01/D02 demo enrichment ─────────────────────────────────────────────


def _onboarding_consents() -> list[ConsentInput]:
    return [
        ConsentInput(
            consent_type=ConsentType.PDN_GENERAL,
            legal_text_version=_LEGAL_VERSIONS[ConsentType.PDN_GENERAL],
            ack_mechanism=AckMechanism.SCROLL_TO_END,
        )
    ]


async def _onboard_demo_patient(
    *, department_public_id: str, full_name: str, dob: str, gender: str, phone: str
) -> uuid.UUID:
    """Create (or dedup to) a demo patient via the real onboarding flow — this gives
    the split-ID model + a clinic-scoped active grant for free. Returns internal_id."""
    out = await commit_onboarding(
        CommitData(
            department_public_id=uuid.UUID(department_public_id),
            full_name=full_name,
            birth_date=dob,
            gender=gender,
            phone=phone,
            email=None,
            oms=None,
            snils=None,
            consents=_onboarding_consents(),
            document_hash="sha256:doctor-demo",
        ),
        idempotency_key=f"seed-doctor-{phone}",
    )
    patient_public_id = out["patient_public_id"]
    async with app_sessionmaker()() as s:
        internal_id = await s.scalar(
            select(Patient.internal_id).where(Patient.public_id == uuid.UUID(patient_public_id))
        )
    assert internal_id is not None
    return internal_id


async def _add_analysis(
    session: Any,
    *,
    partner_id: uuid.UUID,
    patient_internal_id: uuid.UUID,
    analysis_type: str,
    label: str,
    lab_date: dt.date,
    uploaded_at: dt.datetime,
    status: str,
    fields: list[dict[str, Any]],
) -> Analysis:
    """Insert a structured analysis + its OcrField rows with explicit demo values
    (not the generic OCR-stub fixtures — the demo wants exact canonical numbers).

    Ordered flush mirrors upload_service: storage → document → analysis, so each FK
    has a real ``internal_id`` to point at."""
    storage = StorageObject(
        partner_id=partner_id,
        storage_zone=str(StorageZone.ACCEPTED),
        object_key=f"demo/{uuid.uuid4()}",
    )
    session.add(storage)
    await session.flush()
    document = MedicalDocument(
        partner_id=partner_id,
        patient_internal_id=patient_internal_id,
        storage_object_id=storage.internal_id,
        document_type=str(DocumentType.ANALYSIS_RESULT),
        processing_status=str(DocumentProcessingStatus.OCR_DONE),
        quality_check="clear",
        document_date=lab_date,
        uploaded_at=uploaded_at,
        ocr_attempt_count=1,
        source="file",
    )
    session.add(document)
    await session.flush()
    analysis = Analysis(
        partner_id=partner_id,
        patient_internal_id=patient_internal_id,
        medical_document_id=document.internal_id,
        analysis_type=analysis_type,
        label=label,
        lab_date=lab_date,
        quality_check="clear",
        status=status,
        uploaded_at=uploaded_at,
    )
    session.add(analysis)
    await session.flush()
    for fx in fields:
        session.add(
            OcrField(
                partner_id=partner_id,
                analysis_id=analysis.internal_id,
                medical_document_id=document.internal_id,
                field_key=fx["field_key"],
                raw_value=fx["raw_value"],
                normalized_value=fx.get("normalized_value"),
                unit=fx.get("unit"),
                reference_text=fx.get("reference_text"),
                reference_min=fx.get("reference_min"),
                reference_max=fx.get("reference_max"),
                confidence=fx.get("confidence"),
                low_confidence=fx.get("low_confidence", False),
            )
        )
    return analysis


async def seed_doctor_demo() -> dict[str, Any]:
    """Idempotent doctor D01/D02 demo. Ensures the base Эндокор seed, onboards three demo
    patients (dedup by fixed phone), then — only on first run per patient — enriches
    them with attending doctor, today's appointment, diagnosis, analyses, complaints,
    and a plan item so the queue + summary render with canonical data.

    Re-running is safe: the appointment presence is the idempotency sentinel per patient
    (no appointment ⇒ enrich; appointment exists ⇒ skip enrichment)."""
    base = await seed_demo()
    dept_public = base["department_public_id"]
    assert dept_public is not None

    maria = await _onboard_demo_patient(
        department_public_id=dept_public,
        full_name="Иванова Мария Петровна",
        dob="1971-05-02",
        gender="female",
        phone=DEMO_PATIENT_MARIA_PHONE,
    )
    andrey = await _onboard_demo_patient(
        department_public_id=dept_public,
        full_name="Волков Андрей Сергеевич",
        dob="1965-09-14",
        gender="male",
        phone=DEMO_PATIENT_ANDREY_PHONE,
    )
    igor = await _onboard_demo_patient(
        department_public_id=dept_public,
        full_name="Лебедев Игорь Николаевич",
        dob="1958-02-21",
        gender="male",
        phone=DEMO_PATIENT_IGOR_PHONE,
    )

    now = dt.datetime.now(tz=dt.UTC)
    today = now.date()
    lab_date = today - dt.timedelta(days=3)
    uploaded_at = now - dt.timedelta(days=3)

    async with app_sessionmaker()() as session:
        async with session.begin():
            partner = await session.scalar(select(Partner).where(Partner.short_name == "Эндокор"))
            assert partner is not None
            clinic = await session.scalar(
                select(Clinic).where(Clinic.partner_id == partner.internal_id)
            )
            dept = await session.scalar(
                select(Department).where(Department.partner_id == partner.internal_id)
            )
            doctor = await session.scalar(
                select(Doctor).where(Doctor.partner_id == partner.internal_id)
            )
            assert clinic is not None and dept is not None and doctor is not None
            partner_id = partner.internal_id

            async def _already_enriched(patient_internal_id: uuid.UUID) -> bool:
                existing = await session.scalar(
                    select(Appointment.internal_id).where(
                        Appointment.patient_internal_id == patient_internal_id,
                        Appointment.doctor_id == doctor.internal_id,
                    )
                )
                return existing is not None

            def _appointment(patient_internal_id: uuid.UUID, hour: int, minute: int) -> None:
                session.add(
                    Appointment(
                        partner_id=partner_id,
                        patient_internal_id=patient_internal_id,
                        doctor_id=doctor.internal_id,
                        department_id=dept.internal_id,
                        type=str(AppointmentType.MAIN),
                        scheduled_at=dt.datetime.combine(
                            today, dt.time(hour, minute), tzinfo=dt.UTC
                        ),
                        status=str(AppointmentStatus.SCHEDULED),
                        source="mock",
                    )
                )

            enriched: list[str] = []

            # ── Мария Иванова — the canonical demo patient ──
            if not await _already_enriched(maria):
                p = await session.get(Patient, maria)
                assert p is not None
                p.attending_doctor_id = doctor.internal_id
                p.prep_started_at = now - dt.timedelta(days=2)
                p.prep_completed_at = now - dt.timedelta(hours=6)
                p.prep_time_spent_min = 18
                _appointment(maria, 10, 0)
                session.add(
                    ConditionContext(
                        partner_id=partner_id,
                        patient_internal_id=maria,
                        label="Сахарный диабет 2 типа",
                        is_confirmed_by_clinic=True,
                        source="clinic",
                    )
                )
                # HbA1c 7.2 (ref <6.5 → above) LOW-CONF; Глюкоза 6.8 (ref 3.9–5.6 → above);
                # Холестерин 5.1 (ref <5.2 → in). ACKNOWLEDGED so they reach the grid.
                await _add_analysis(
                    session,
                    partner_id=partner_id,
                    patient_internal_id=maria,
                    analysis_type="HbA1c",
                    label="Гликированный гемоглобин",
                    lab_date=lab_date,
                    uploaded_at=uploaded_at,
                    status=str(AnalysisStatus.ACKNOWLEDGED),
                    fields=[
                        {
                            "field_key": "HbA1c",
                            "raw_value": "7.2 %",
                            "normalized_value": 7.2,
                            "unit": "%",
                            "reference_text": "< 6.5 %",
                            "reference_max": 6.5,
                            "confidence": 0.61,
                            "low_confidence": True,
                        }
                    ],
                )
                await _add_analysis(
                    session,
                    partner_id=partner_id,
                    patient_internal_id=maria,
                    analysis_type="glucose",
                    label="Глюкоза натощак",
                    lab_date=lab_date,
                    uploaded_at=uploaded_at,
                    status=str(AnalysisStatus.ACKNOWLEDGED),
                    fields=[
                        {
                            "field_key": "Глюкоза",
                            "raw_value": "6.8 ммоль/л",
                            "normalized_value": 6.8,
                            "unit": "ммоль/л",
                            "reference_text": "3.9–5.6",
                            "reference_min": 3.9,
                            "reference_max": 5.6,
                            "confidence": 0.95,
                        }
                    ],
                )
                await _add_analysis(
                    session,
                    partner_id=partner_id,
                    patient_internal_id=maria,
                    analysis_type="cholesterol",
                    label="Холестерин общий",
                    lab_date=lab_date,
                    uploaded_at=uploaded_at,
                    status=str(AnalysisStatus.ACKNOWLEDGED),
                    fields=[
                        {
                            "field_key": "Холестерин",
                            "raw_value": "5.1 ммоль/л",
                            "normalized_value": 5.1,
                            "unit": "ммоль/л",
                            "reference_text": "< 5.2",
                            "reference_max": 5.2,
                            "confidence": 0.96,
                        }
                    ],
                )
                # Three patient questions (priority 1..3). #2 is about kidneys, which
                # pairs with the микроальбумин plan item → Vasily «жалобы + план» merge.
                session.add_all(
                    [
                        Complaint(
                            partner_id=partner_id,
                            patient_internal_id=maria,
                            kind="question",
                            text="Стоит ли менять схему лечения, если сахар по утрам высокий?",
                            priority=1,
                        ),
                        Complaint(
                            partner_id=partner_id,
                            patient_internal_id=maria,
                            kind="question",
                            text="Нужно ли проверить почки? Иногда отекают ноги.",
                            priority=2,
                        ),
                        Complaint(
                            partner_id=partner_id,
                            patient_internal_id=maria,
                            kind="complaint",
                            text="Переживаю из-за результатов, тревожно перед приёмом.",
                            priority=3,
                        ),
                    ]
                )
                # A doctor_request + микроальбумин plan item still assigned → a visit gap
                # that the kidneys question turns into a «жалобы + план» rationale.
                req = DoctorRequest(
                    partner_id=partner_id,
                    patient_internal_id=maria,
                    from_doctor_id=doctor.internal_id,
                    title="Перед приёмом",
                    body="Пожалуйста, сдайте микроальбумин до визита.",
                    intent="before-visit",
                    status="sent",
                    seen_by_patient=True,
                )
                session.add(req)
                await session.flush()
                session.add(
                    PlanItem(
                        partner_id=partner_id,
                        patient_internal_id=maria,
                        doctor_request_id=req.internal_id,
                        analysis_type="other",
                        label="Микроальбумин в моче",
                        reason="Контроль функции почек",
                        kind="lab",
                        status=str(PlanItemStatus.ASSIGNED),
                        due_date=today - dt.timedelta(days=1),  # overdue → plan-overdue gap
                    )
                )
                enriched.append("maria")

            # ── Андрей Волков — critical-lab patient (HbA1c ≥ 10) ──
            if not await _already_enriched(andrey):
                p = await session.get(Patient, andrey)
                assert p is not None
                p.attending_doctor_id = doctor.internal_id
                p.prep_started_at = now - dt.timedelta(days=1)  # in progress, not completed
                _appointment(andrey, 10, 30)
                session.add(
                    ConditionContext(
                        partner_id=partner_id,
                        patient_internal_id=andrey,
                        label="Сахарный диабет 2 типа",
                        is_confirmed_by_clinic=True,
                        source="clinic",
                    )
                )
                await _add_analysis(
                    session,
                    partner_id=partner_id,
                    patient_internal_id=andrey,
                    analysis_type="HbA1c",
                    label="Гликированный гемоглобин",
                    lab_date=lab_date,
                    uploaded_at=uploaded_at,
                    status=str(AnalysisStatus.ACKNOWLEDGED),
                    fields=[
                        {
                            "field_key": "HbA1c",
                            "raw_value": "10.4 %",
                            "normalized_value": 10.4,
                            "unit": "%",
                            "reference_text": "< 6.5 %",
                            "reference_max": 6.5,
                            "confidence": 0.97,
                        }
                    ],
                )
                enriched.append("andrey")

            # ── Игорь Лебедев — prep not started, no uploads ──
            if not await _already_enriched(igor):
                p = await session.get(Patient, igor)
                assert p is not None
                p.attending_doctor_id = doctor.internal_id
                _appointment(igor, 11, 0)
                enriched.append("igor")

    return {
        "department_public_id": dept_public,
        "doctor_username": DEMO_DOCTOR_USERNAME,
        "patients": {
            "maria_internal_id": str(maria),
            "andrey_internal_id": str(andrey),
            "igor_internal_id": str(igor),
        },
    }


async def refresh_demo_dates() -> dict[str, Any]:
    """Re-anchor the demo data to the current day (spec §Mock data — demo freshness).

    The base seed stamps appointments / labs / prep relative to the seed-time clock.
    On a persistently-hosted DB seeded once, that "today" goes stale. Re-running this
    (before a demo, or via cron) re-points every demo patient's appointment to today,
    re-dates labs/uploads, refreshes prep timestamps, and keeps the overdue plan item
    overdue — without recreating patients (so public_ids / grants are preserved).

    Idempotent and safe to run repeatedly. No-op fields (igor has no prep/analyses)
    are left untouched, preserving each patient's distinct demo state.
    """
    now = dt.datetime.now(tz=dt.UTC)
    today = now.date()
    lab_date = today - dt.timedelta(days=3)
    uploaded_at = now - dt.timedelta(days=3)

    async with app_sessionmaker()() as session:
        async with session.begin():
            partner = await session.scalar(select(Partner).where(Partner.short_name == "Эндокор"))
            if partner is None:
                return {"refreshed": 0, "note": "base seed missing — run --doctor first"}
            doctor = await session.scalar(
                select(Doctor).where(Doctor.partner_id == partner.internal_id)
            )
            if doctor is None:
                return {"refreshed": 0, "note": "demo doctor missing — run --doctor first"}

            patients = (
                await session.scalars(
                    select(Patient).where(Patient.attending_doctor_id == doctor.internal_id)
                )
            ).all()

            for p in patients:
                # Appointment → today, preserving the original time-of-day.
                appts = (
                    await session.scalars(
                        select(Appointment).where(
                            Appointment.patient_internal_id == p.internal_id,
                            Appointment.doctor_id == doctor.internal_id,
                        )
                    )
                ).all()
                for appt in appts:
                    appt.scheduled_at = dt.datetime.combine(
                        today, appt.scheduled_at.timetz()
                    )

                # Prep timestamps — preserve the shape (completed vs in-progress vs none).
                if p.prep_completed_at is not None:
                    p.prep_started_at = now - dt.timedelta(days=2)
                    p.prep_completed_at = now - dt.timedelta(hours=6)
                elif p.prep_started_at is not None:
                    p.prep_started_at = now - dt.timedelta(days=1)

                # Analyses + their documents → re-dated.
                analyses = (
                    await session.scalars(
                        select(Analysis).where(
                            Analysis.patient_internal_id == p.internal_id,
                            Analysis.deleted_at.is_(None),
                        )
                    )
                ).all()
                for a in analyses:
                    a.uploaded_at = uploaded_at
                    a.lab_date = lab_date
                    doc = await session.get(MedicalDocument, a.medical_document_id)
                    if doc is not None:
                        doc.document_date = lab_date
                        doc.uploaded_at = uploaded_at

                # Keep assigned plan items overdue (the микроальбумин gap).
                items = (
                    await session.scalars(
                        select(PlanItem).where(
                            PlanItem.patient_internal_id == p.internal_id,
                            PlanItem.status == str(PlanItemStatus.ASSIGNED),
                        )
                    )
                ).all()
                for item in items:
                    item.due_date = today - dt.timedelta(days=1)

    return {"refreshed": len(patients), "anchored_to": today.isoformat()}


if __name__ == "__main__":
    if "--refresh" in sys.argv:
        print(asyncio.run(refresh_demo_dates()))
    elif "--admin" in sys.argv:
        from app.seed.admin_seed import seed_admin_demo

        print(asyncio.run(seed_admin_demo()))
    elif "--doctor" in sys.argv:
        print(asyncio.run(seed_doctor_demo()))
    else:
        print(asyncio.run(seed_demo()))
