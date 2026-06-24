"""Plan service (spec §5.4) — the doctor→patient loop, transaction owner.

``create_doctor_request`` is all-or-nothing (INV-TX-1): one transaction inserts the
``doctor_request`` + N ``plan_item`` rows, emits audit (DOCTOR_REQUEST_CREATED +
PLAN_ITEM_REQUESTED), and enqueues ONE ``send_notification`` outbox event whose
payload is PII-free (copy-keys + UUIDs only — INV-AU-2/RES-2). Idempotent by
``Idempotency-Key``.

GATE (INV-AC-2): the doctor may only create a request for a patient they currently
hold an ACTIVE access grant to — capability is re-derived per request from
``access_grant``, never the token. Revoke blocks the next request.

The patient side (``list_plan_for_patient`` / ``mark_request_seen``) is scoped to
the caller's own internal id (INV-AC-5). A plan item advances assigned→uploaded off
the analysis lifecycle (``advance_on_analysis_linked``). The uploaded→acknowledged
transition lands with the doctor acknowledge / OCR-verify slice (not in Slice C).
"""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import emit_audit
from app.core.errors import forbidden, not_found
from app.core.outbox import enqueue
from app.core.security import TokenClaims
from app.db.models.clinical import Analysis
from app.db.models.core import Appointment, Doctor, Patient
from app.db.models.plan import DoctorRequest, PlanItem
from app.db.resolver import resolve_public_id
from app.domain.enums import (
    ActorRole,
    AuditEventType,
    DoctorRequestStatus,
    OutboxEventType,
    PlanItemStatus,
)
from app.services import idempotency
from app.services.access_service import active_grant_for_doctor
from app.services.uow import transaction

_ENDPOINT = "plan.create_doctor_request"


def _now() -> dt.datetime:
    return dt.datetime.now(tz=dt.UTC)


def _plan_item_view(
    item: PlanItem, request_public_id: str, analysis_public: str | None
) -> dict[str, Any]:
    return {
        "public_id": str(item.public_id),
        "request_public_id": request_public_id,
        "analysis_type": item.analysis_type,
        "label": item.label,
        "reason": item.reason,
        "status": item.status,
        "linked_analysis_public_id": analysis_public,
        "due_date": item.due_date.isoformat() if item.due_date else None,
        "last_requested_at": item.last_requested_at.isoformat() if item.last_requested_at else None,
        "kind": item.kind,
        "prep": item.prep,
        "created_at": item.created_at.isoformat(),
    }


def _derive_request_progress(item_statuses: list[str]) -> str:
    """Derive request doneness from its plan items — canon §12.7: doneness is DERIVED
    from plan-items, never a stored parallel status (two sources of truth is a bug).

    open → nothing started · in_progress → some items uploaded/acknowledged ·
    completed → all items acknowledged."""
    if not item_statuses:
        return "open"
    acknowledged = str(PlanItemStatus.ACKNOWLEDGED)
    assigned = str(PlanItemStatus.ASSIGNED)
    if all(st == acknowledged for st in item_statuses):
        return "completed"
    if any(st != assigned for st in item_statuses):
        return "in_progress"
    return "open"


def _request_view(
    request: DoctorRequest,
    doctor_public_id: str,
    item_public_ids: list[str],
    progress: str,
) -> dict[str, Any]:
    return {
        "public_id": str(request.public_id),
        "from_doctor_public_id": doctor_public_id,
        "title": request.title,
        "body": request.body,
        "intent": request.intent,
        "plan_item_public_ids": item_public_ids,
        "seen_by_patient": request.seen_by_patient,
        "progress": progress,
        "created_at": request.created_at.isoformat(),
    }


async def create_doctor_request(
    claims: TokenClaims,
    patient_public_id: uuid.UUID,
    payload: dict[str, Any],
    idempotency_key: str,
) -> dict[str, Any]:
    now = _now()
    partner_id = uuid.UUID(claims.partner_id)

    async with transaction() as uow:
        s = uow.session

        # Idempotency replay (INV-TX-1)
        replay = await idempotency.find_completed(
            s, partner_id=partner_id, endpoint=_ENDPOINT, key=idempotency_key
        )
        if replay is not None:
            return replay

        # Calling doctor (capability subject)
        from app.db.models.core import UserAccount

        doctor = await s.scalar(
            select(Doctor)
            .join(UserAccount, UserAccount.internal_id == Doctor.user_account_id)
            .where(
                UserAccount.public_id == uuid.UUID(claims.subject_public_id),
                UserAccount.deleted_at.is_(None),
                Doctor.partner_id == partner_id,
            )
        )
        if doctor is None:
            raise forbidden("doctor not found")

        # Resolve patient clinical key (no PII read)
        patient_internal_id = await resolve_public_id(s, patient_public_id)
        if patient_internal_id is None:
            raise not_found("patient not found")

        # Cross-partner guard (INV-TX-2): resolve_public_id is partner-agnostic, so
        # assert the patient belongs to the doctor's partner explicitly rather than
        # relying on the grant filter alone. not_found (not forbidden) so cross-partner
        # existence is never revealed.
        patient_partner_id = await s.scalar(
            select(Patient.partner_id).where(Patient.internal_id == patient_internal_id)
        )
        if patient_partner_id != partner_id:
            raise not_found("patient not found")

        # GATE: active access grant doctor→patient, else 403 (INV-AC-1/2)
        if await active_grant_for_doctor(
            s,
            partner_id=partner_id,
            patient_internal_id=patient_internal_id,
            clinic_id=doctor.clinic_id,
        ) is None:
            raise forbidden("no active access grant to this patient")

        # Optional appointment link (must belong to the same patient + partner)
        appointment_internal_id: uuid.UUID | None = None
        appt_public = payload.get("appointment_public_id")
        if appt_public is not None:
            appt = await s.scalar(
                select(Appointment).where(
                    Appointment.public_id == uuid.UUID(str(appt_public)),
                    Appointment.patient_internal_id == patient_internal_id,
                    Appointment.partner_id == partner_id,
                )
            )
            if appt is None:
                raise not_found("appointment not found")
            appointment_internal_id = appt.internal_id

        # --- atomic write-set: request + N items ---
        request = DoctorRequest(
            partner_id=partner_id,
            patient_internal_id=patient_internal_id,
            from_doctor_id=doctor.internal_id,
            appointment_id=appointment_internal_id,
            title=payload["title"],
            body=payload["body"],
            intent=payload.get("intent"),
            status=str(DoctorRequestStatus.SENT),
        )
        s.add(request)
        await s.flush()

        item_public_ids: list[str] = []
        for raw in payload.get("items", []):
            item = PlanItem(
                partner_id=partner_id,
                patient_internal_id=patient_internal_id,
                doctor_request_id=request.internal_id,
                analysis_type=raw.get("analysis_type"),
                label=raw["label"],
                reason=raw.get("reason"),
                kind=raw.get("kind"),
                prep=raw.get("prep"),
                due_date=dt.date.fromisoformat(raw["due_date"]) if raw.get("due_date") else None,
                status=str(PlanItemStatus.ASSIGNED),
                last_requested_at=now,
            )
            s.add(item)
            await s.flush()
            item_public_ids.append(str(item.public_id))
            await emit_audit(
                s, partner_id=partner_id, actor_role=ActorRole.DOCTOR,
                event_type=AuditEventType.PLAN_ITEM_REQUESTED,
                subject_internal_id=patient_internal_id,
                target_type="plan_item", target_id=item.internal_id,
            )

        await emit_audit(
            s, partner_id=partner_id, actor_role=ActorRole.DOCTOR,
            event_type=AuditEventType.DOCTOR_REQUEST_CREATED,
            subject_internal_id=patient_internal_id,
            target_type="doctor_request", target_id=request.internal_id,
            metadata={"item_count": len(item_public_ids)},
        )

        # ONE notification, PII-free payload: copy-keys + UUIDs only (INV-AU-2/RES-2)
        await enqueue(
            s, partner_id=partner_id, event_type=OutboxEventType.SEND_NOTIFICATION,
            payload={
                "type": "doctor_request",
                "related_type": "doctor_request",
                "related_id": str(request.internal_id),
                "title_key": "notification.doctor_request.title",
                "body_key": "notification.doctor_request.body",
            },
        )

        # A new request changes the patient prep screen + the doctor queue → bust those
        # derived caches in the same txn (mirrors access_service). Opaque ids only.
        for ev in (OutboxEventType.INVALIDATE_PREP, OutboxEventType.INVALIDATE_DOCTOR_QUEUE):
            await enqueue(
                s, partner_id=partner_id, event_type=ev,
                payload={"request_id": str(request.public_id)},
            )

        # Freshly created items are all ASSIGNED → progress "open".
        result = _request_view(request, str(doctor.public_id), item_public_ids, "open")
        req_hash = idempotency.request_hash(
            {"key": idempotency_key, "patient": str(patient_public_id)}
        )
        await idempotency.record(
            s, partner_id=partner_id, endpoint=_ENDPOINT, key=idempotency_key,
            req_hash=req_hash, response=result,
        )
        return result


async def list_plan_for_patient(
    s: AsyncSession, user_public_id: uuid.UUID
) -> dict[str, Any]:
    """The caller's own plan (partner-scoped via the patient row)."""
    from app.db.resolver import internal_id_for_user

    internal_id = await internal_id_for_user(s, user_public_id)
    if internal_id is None:
        return {"doctor_requests": [], "plan_items": []}

    requests = (
        await s.scalars(
            select(DoctorRequest)
            .where(
                DoctorRequest.patient_internal_id == internal_id,
                DoctorRequest.deleted_at.is_(None),
            )
            .order_by(DoctorRequest.created_at.desc())
        )
    ).all()
    items = (
        await s.scalars(
            select(PlanItem)
            .where(
                PlanItem.patient_internal_id == internal_id,
                PlanItem.deleted_at.is_(None),
            )
            .order_by(PlanItem.created_at.asc())
        )
    ).all()

    # doctor public ids (one lookup map; no PII)
    doctor_ids = {r.from_doctor_id for r in requests}
    doctor_public: dict[uuid.UUID, str] = {}
    if doctor_ids:
        for d_id, d_pub in (
            await s.execute(
                select(Doctor.internal_id, Doctor.public_id).where(
                    Doctor.internal_id.in_(doctor_ids)
                )
            )
        ).all():
            doctor_public[d_id] = str(d_pub)

    # analysis public ids for linked items
    analysis_ids = {i.linked_analysis_id for i in items if i.linked_analysis_id is not None}
    analysis_public: dict[uuid.UUID, str] = {}
    if analysis_ids:
        for a_id, a_pub in (
            await s.execute(
                select(Analysis.internal_id, Analysis.public_id).where(
                    Analysis.internal_id.in_(analysis_ids)
                )
            )
        ).all():
            analysis_public[a_id] = str(a_pub)

    request_public_by_internal = {r.internal_id: str(r.public_id) for r in requests}

    items_by_request: dict[uuid.UUID, list[PlanItem]] = {}
    for i in items:
        items_by_request.setdefault(i.doctor_request_id, []).append(i)

    return {
        "doctor_requests": [
            _request_view(
                r,
                doctor_public.get(r.from_doctor_id, str(r.from_doctor_id)),
                [str(i.public_id) for i in items_by_request.get(r.internal_id, [])],
                _derive_request_progress(
                    [i.status for i in items_by_request.get(r.internal_id, [])]
                ),
            )
            for r in requests
        ],
        "plan_items": [
            _plan_item_view(
                i,
                request_public_by_internal.get(i.doctor_request_id, str(i.doctor_request_id)),
                analysis_public.get(i.linked_analysis_id) if i.linked_analysis_id else None,
            )
            for i in items
        ],
    }


async def mark_request_seen(
    user_public_id: uuid.UUID, request_public_id: uuid.UUID
) -> dict[str, Any]:
    """Idempotent: flip seen_by_patient on the caller's own request."""
    from app.db.resolver import internal_id_for_user

    now = _now()
    async with transaction() as uow:
        s = uow.session
        internal_id = await internal_id_for_user(s, user_public_id)
        request = await s.scalar(
            select(DoctorRequest).where(DoctorRequest.public_id == request_public_id)
        )
        # Ownership: never reveal another patient's request (INV-AC-1 spirit)
        if request is None or internal_id is None or request.patient_internal_id != internal_id:
            raise not_found("request not found")
        if not request.seen_by_patient:
            request.seen_by_patient = True
            request.seen_by_patient_at = now
            if request.status == str(DoctorRequestStatus.SENT):
                request.status = str(DoctorRequestStatus.SEEN)
            # Audit the first 'seen' for the access-transparency trail (every touch is
            # logged). Inside the if → an idempotent replay never double-logs.
            await emit_audit(
                s, partner_id=request.partner_id, actor_role=ActorRole.PATIENT,
                event_type=AuditEventType.DOCTOR_REQUEST_SEEN,
                subject_internal_id=internal_id,
                target_type="doctor_request", target_id=request.internal_id,
            )
        doctor_public = await s.scalar(
            select(Doctor.public_id).where(Doctor.internal_id == request.from_doctor_id)
        )
        item_rows = (
            await s.execute(
                select(PlanItem.public_id, PlanItem.status).where(
                    PlanItem.doctor_request_id == request.internal_id
                )
            )
        ).all()
        item_public_ids = [str(p) for p, _ in item_rows]
        progress = _derive_request_progress([st for _, st in item_rows])
        return _request_view(
            request, str(doctor_public) if doctor_public else "", item_public_ids, progress
        )


# --- analysis-lifecycle hooks (called from upload/analysis services, same txn) ---


async def advance_on_analysis_linked(
    s: AsyncSession,
    *,
    patient_internal_id: uuid.UUID,
    analysis_internal_id: uuid.UUID,
    plan_item_internal_id: uuid.UUID,
) -> None:
    """A patient's uploaded analysis fulfils a plan item → status 'uploaded' +
    link both directions. No-op if the item is not the patient's own (defensive)."""
    item = await s.get(PlanItem, plan_item_internal_id)
    if item is None or item.patient_internal_id != patient_internal_id:
        return
    item.linked_analysis_id = analysis_internal_id
    if item.status == str(PlanItemStatus.ASSIGNED):
        item.status = str(PlanItemStatus.UPLOADED)
