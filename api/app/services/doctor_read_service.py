"""Doctor READ surface (spec §7.7 read-side, data-model §10.2) — D01 queue + D02 summary.

READ-ONLY on clinical content. These endpoints never mutate analyses / complaints /
values; the ONLY write is the ``doctor_view`` audit event + the ``last_viewed_at``
projection on the active grant (INV-AU-5). The doctor's capability (the grant) is
re-derived per request from ``access_grant`` (INV-AC-2), never read from the token.

The rich analytics here are a server-side port of the frontend ``doctorSelectors.ts``
(THE source of truth). Thresholds, ordering and gating are preserved exactly so a later
frontend→backend swap is mechanical. Two gating rules from that file are load-bearing:

  * **Acknowledged-only** — key metrics, deltas and critical-lab flags compute over
    ACKNOWLEDGED analyses only (the call-site on the frontend Сводка restricts source
    data to accepted uploads). A still-pending upload contributes nothing here.
  * **All / prep-window** — the prep-uploads list and the visit agenda use every
    analysis (uploads) / the current-prep window. A low-confidence reading on a pending
    upload still surfaces as an agenda gap so the doctor sees it before accepting.

``medical_summary`` is DERIVED + built-on-read (not a stored entity); the disclaimer
copy-key travels in the payload (INV-AI-8). Patient existence is hidden behind
``not_found`` (never ``forbidden``) so a cross-partner / no-grant probe cannot tell a
real patient from a missing one — consistent with ``plan_service``.
"""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import emit_audit
from app.core.errors import forbidden, not_found
from app.core.security import TokenClaims
from app.db.models.clinical import Analysis, Complaint, MedicalDocument, OcrField
from app.db.models.core import (
    Appointment,
    ConditionContext,
    Doctor,
    Patient,
    UserAccount,
)
from app.db.models.plan import PlanItem
from app.db.resolver import resolve_patient_pii, resolve_public_id
from app.domain.enums import (
    ActorRole,
    AnalysisStatus,
    AppointmentStatus,
    AppointmentType,
    AuditEventType,
    DocumentType,
    PlanItemStatus,
)
from app.services.access_service import active_grant_for_doctor
from app.services.uow import transaction

# ─── Constants ported verbatim from doctorSelectors.ts ──────────────────────────

# Structural OCR fields excluded from doctor-facing readings (NON_VALUE_FIELD).
_NON_VALUE_FIELD = frozenset({"дата", "норма", "date", "reference"})

# Curated whitelist + ordering for the «Ключевые показатели» grid (KEY_METRIC_ORDER).
KEY_METRIC_ORDER: tuple[str, ...] = (
    "HbA1c",
    "Глюкоза",
    "Креатинин",
    "Холестерин",
    "ЛПНП",
    "ТТГ",
)
_KEY_METRIC_INDEX = {k: i for i, k in enumerate(KEY_METRIC_ORDER)}

# Minimal absolute change to count as a meaningful delta, by metric (DELTA_FLAT_THRESHOLD).
_DELTA_FLAT_THRESHOLD: dict[str, float] = {
    "HbA1c": 0.2,
    "Глюкоза": 0.3,
    "Креатинин": 5.0,
    "Холестерин": 0.2,
    "ЛПНП": 0.2,
    "ТТГ": 0.3,
}

# Conservative critical thresholds (CRITICAL_RULES) — endocrinology-relevant, kept rare.
_CRITICAL_RULES: list[tuple[str, float, str]] = [
    ("HbA1c", 10.0, "выраженная гипергликемия за период"),
    ("Глюкоза", 13.0, "высокий уровень натощак"),
    ("Креатинин", 200.0, "значительно выше референса"),
]

DISCLAIMER_KEY = "disclaimer.not_a_substitute"  # «Это не заменяет консультацию врача»


def _now() -> dt.datetime:
    return dt.datetime.now(tz=dt.UTC)


# ─── Reading model (MetricReading) ──────────────────────────────────────────────


class _Reading:
    """Server analogue of the frontend MetricReading. Built from an OcrField row +
    its parent Analysis. ``measured_at`` is the lab/upload date used for recency."""

    __slots__ = (
        "analysis_label",
        "analysis_public_id",
        "analysis_type",
        "display",
        "field",
        "low_confidence",
        "measured_at",
        "numeric_value",
        "range",
        "ref",
        "ref_max",
        "ref_min",
        "unit",
        "verification",
        "verified_at",
        "verified_by",
    )

    def __init__(
        self,
        *,
        field: str,
        display: str,
        numeric_value: float | None,
        unit: str | None,
        ref: str | None,
        ref_min: float | None,
        ref_max: float | None,
        range_flag: str,
        low_confidence: bool,
        verification: str | None,
        verified_by: str | None,
        verified_at: str | None,
        measured_at: str,
        analysis_public_id: str,
        analysis_label: str,
        analysis_type: str,
    ) -> None:
        self.field = field
        self.display = display
        self.numeric_value = numeric_value
        self.unit = unit
        self.ref = ref
        self.ref_min = ref_min
        self.ref_max = ref_max
        self.range = range_flag
        self.low_confidence = low_confidence
        self.verification = verification
        self.verified_by = verified_by
        self.verified_at = verified_at
        self.measured_at = measured_at
        self.analysis_public_id = analysis_public_id
        self.analysis_label = analysis_label
        self.analysis_type = analysis_type


def _classify_range(
    numeric_value: float | None, ref_min: float | None, ref_max: float | None
) -> str:
    """RangeFlag derivation (classifyRange): below / above / in / unknown."""
    if numeric_value is None:
        return "unknown"
    if ref_min is not None and numeric_value < ref_min:
        return "below"
    if ref_max is not None and numeric_value > ref_max:
        return "above"
    if ref_min is not None or ref_max is not None:
        return "in"
    return "unknown"


def _verdict_to_verification(verdict: str) -> str | None:
    """Map the stored doctor_metadata_verdict (none|confirmed|rejected) onto the
    frontend's verification.decision (confirmed|rejected|undefined)."""
    if verdict in ("confirmed", "rejected"):
        return verdict
    return None


def _display_value(f: OcrField) -> str:
    """Display form for a reading — mirrors the frontend `display` = raw recognized
    value. Falls back to raw_value; appends unit only when raw lacks it is NOT done on
    the frontend, so keep raw_value verbatim (the OCR fixture raw_value is bare)."""
    return f.raw_value


def _readings_from_analysis(analysis: Analysis, fields: list[OcrField]) -> list[_Reading]:
    """Flatten an analysis's OCR fields into doctor-facing readings (readingsFromAnalysis).
    Excludes structural fields («дата» / «норма»). ``measured_at`` = lab_date or upload."""
    out: list[_Reading] = []
    # Reference fallback: the frontend falls back to ocrFields['норма'] when a field has
    # no per-field ref. Mirror by capturing any structural «норма» raw value.
    norma_fallback: str | None = None
    for f in fields:
        if f.field_key.lower() == "норма":
            norma_fallback = f.raw_value
            break

    measured_at = (
        analysis.lab_date.isoformat()
        if analysis.lab_date is not None
        else analysis.uploaded_at.isoformat()
    )
    for f in fields:
        if f.field_key.lower() in _NON_VALUE_FIELD:
            continue
        numeric = float(f.normalized_value) if f.normalized_value is not None else None
        ref_min = float(f.reference_min) if f.reference_min is not None else None
        ref_max = float(f.reference_max) if f.reference_max is not None else None
        out.append(
            _Reading(
                field=f.field_key,
                display=_display_value(f),
                numeric_value=numeric,
                unit=f.unit,
                ref=f.reference_text or norma_fallback,
                ref_min=ref_min,
                ref_max=ref_max,
                range_flag=_classify_range(numeric, ref_min, ref_max),
                low_confidence=bool(f.low_confidence),
                verification=_verdict_to_verification(f.doctor_metadata_verdict),
                verified_by=f.doctor_verdict_by,
                verified_at=f.doctor_verdict_at.isoformat() if f.doctor_verdict_at else None,
                measured_at=measured_at,
                analysis_public_id=str(analysis.public_id),
                analysis_label=analysis.label,
                analysis_type=analysis.analysis_type,
            )
        )
    return out


# ─── Patient clinical bundle (one read of the patient's rows) ───────────────────


class _PatientBundle:
    """Everything the read-model needs for one patient, loaded once. Holds analyses
    split into ``all`` (uploads / agenda) and ``acknowledged`` (metrics / deltas /
    criticals), plus their OCR fields, plan items, complaints, documents, diagnosis,
    and the patient's prep facts. Pure data — no DB after construction."""

    def __init__(
        self,
        *,
        patient: Patient,
        analyses: list[Analysis],
        fields_by_analysis: dict[uuid.UUID, list[OcrField]],
        plan_items: list[PlanItem],
        complaints: list[Complaint],
        documents: list[MedicalDocument],
        diagnosis_label: str | None,
        last_completed_main_at: dt.datetime | None,
    ) -> None:
        self.patient = patient
        self.analyses = analyses
        self.fields_by_analysis = fields_by_analysis
        self.plan_items = plan_items
        self.complaints = complaints
        self.documents = documents
        self.diagnosis_label = diagnosis_label
        self.last_completed_main_at = last_completed_main_at

    def _fields(self, a: Analysis) -> list[OcrField]:
        return self.fields_by_analysis.get(a.internal_id, [])

    def readings(self, *, acknowledged_only: bool) -> list[_Reading]:
        out: list[_Reading] = []
        for a in self.analyses:
            if acknowledged_only and a.status != str(AnalysisStatus.ACKNOWLEDGED):
                continue
            out.extend(_readings_from_analysis(a, self._fields(a)))
        return out

    def analyses_for_current_prep(self) -> list[Analysis]:
        """selectAnalysesForCurrentPrep — uploads strictly after the last completed
        'main' appointment, newest-first. No completed visit ⇒ every upload qualifies."""
        cutoff = self.last_completed_main_at
        chosen = [
            a
            for a in self.analyses
            if cutoff is None or a.uploaded_at > cutoff
        ]
        return sorted(chosen, key=lambda a: a.uploaded_at, reverse=True)


async def _load_patient_bundle(
    s: AsyncSession, patient: Patient
) -> _PatientBundle:
    internal_id = patient.internal_id
    # Deterministic ORDER BY everywhere: the frontend operates on a stable seed-array
    # order, so the port's "first low-confidence field" / intra-bucket gap ordering must
    # not ride on Postgres heap order. created_at → public_id is a total, reproducible key.
    analyses = list(
        (
            await s.scalars(
                select(Analysis)
                .where(
                    Analysis.patient_internal_id == internal_id,
                    Analysis.deleted_at.is_(None),
                )
                .order_by(Analysis.created_at.asc(), Analysis.public_id.asc())
            )
        ).all()
    )
    fields_by_analysis: dict[uuid.UUID, list[OcrField]] = {}
    if analyses:
        analysis_ids = [a.internal_id for a in analyses]
        rows = (
            await s.scalars(
                select(OcrField)
                .where(OcrField.analysis_id.in_(analysis_ids))
                .order_by(
                    OcrField.analysis_id.asc(),
                    OcrField.created_at.asc(),
                    OcrField.internal_id.asc(),
                )
            )
        ).all()
        for f in rows:
            if f.analysis_id is None:
                continue
            fields_by_analysis.setdefault(f.analysis_id, []).append(f)

    plan_items = list(
        (
            await s.scalars(
                select(PlanItem)
                .where(
                    PlanItem.patient_internal_id == internal_id,
                    PlanItem.deleted_at.is_(None),
                )
                .order_by(PlanItem.created_at.asc(), PlanItem.public_id.asc())
            )
        ).all()
    )
    complaints = list(
        (
            await s.scalars(
                select(Complaint)
                .where(
                    Complaint.patient_internal_id == internal_id,
                    Complaint.deleted_at.is_(None),
                )
                .order_by(Complaint.created_at.asc(), Complaint.public_id.asc())
            )
        ).all()
    )
    # Identity / referral documents only — the FE source of truth (selectPrepMeta,
    # doc-unstructured gap) reads ``s.documents``, which never contains the
    # MedicalDocument every analysis upload auto-creates (document_type=analysis_result,
    # upload_service). Exclude it so ``bundle.documents`` ≡ FE ``s.documents``:
    # docs_count / doc-unstructured / has_passport-has_oms all count real patient docs.
    documents = list(
        (
            await s.scalars(
                select(MedicalDocument)
                .where(
                    MedicalDocument.patient_internal_id == internal_id,
                    MedicalDocument.deleted_at.is_(None),
                    MedicalDocument.document_type != str(DocumentType.ANALYSIS_RESULT),
                )
                .order_by(MedicalDocument.created_at.asc(), MedicalDocument.public_id.asc())
            )
        ).all()
    )
    diagnosis_label = await s.scalar(
        select(ConditionContext.label)
        .where(
            ConditionContext.patient_internal_id == internal_id,
            ConditionContext.deleted_at.is_(None),
        )
        .order_by(ConditionContext.created_at.desc())
        .limit(1)
    )
    last_completed_main_at = await s.scalar(
        select(Appointment.scheduled_at)
        .where(
            Appointment.patient_internal_id == internal_id,
            Appointment.type == str(AppointmentType.MAIN),
            Appointment.status == str(AppointmentStatus.COMPLETED),
            Appointment.deleted_at.is_(None),
        )
        .order_by(Appointment.scheduled_at.desc())
        .limit(1)
    )
    return _PatientBundle(
        patient=patient,
        analyses=analyses,
        fields_by_analysis=fields_by_analysis,
        plan_items=plan_items,
        complaints=complaints,
        documents=documents,
        diagnosis_label=diagnosis_label,
        last_completed_main_at=last_completed_main_at,
    )


# ─── Section 1: Анализы (key metrics + deltas + criticals) — ACKNOWLEDGED only ──


def _round1(x: float) -> float:
    """Round to 1 decimal, ties away from zero — matches the frontend's
    ``+(x).toFixed(1)``. Python's built-in ``round()`` is banker's rounding
    (round-half-to-even) and silently diverges on ``.x5`` values (e.g. a 2.25
    delta), so deltas / target-gaps must use this to stay byte-for-byte with
    ``doctorSelectors.ts``."""
    return float(Decimal(str(x)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def _latest_metrics_by_field(readings: list[_Reading]) -> list[_Reading]:
    """selectLatestMetricsByField — latest reading per field, newest-first."""
    by_field: dict[str, _Reading] = {}
    for r in readings:
        prev = by_field.get(r.field)
        if prev is None or prev.measured_at < r.measured_at:
            by_field[r.field] = r
    return sorted(by_field.values(), key=lambda r: r.measured_at, reverse=True)


def _key_metrics(readings: list[_Reading]) -> list[_Reading]:
    """selectKeyMetrics — latest-per-field restricted to the whitelist, in KEY_METRIC_ORDER."""
    latest = _latest_metrics_by_field(readings)
    whitelisted = [r for r in latest if r.field in _KEY_METRIC_INDEX]
    return sorted(whitelisted, key=lambda r: _KEY_METRIC_INDEX[r.field])


def _out_of_range_count(readings: list[_Reading]) -> int:
    return sum(1 for r in _latest_metrics_by_field(readings) if r.range in ("above", "below"))


def _deltas_since_last_visit(readings: list[_Reading]) -> list[dict[str, Any]]:
    """selectDeltaSinceLastVisit — signed current−previous per whitelisted metric with
    ≥2 numeric readings; trend = improved/worsened/flat relative to the reference range.
    Output ordered by KEY_METRIC_ORDER."""
    by_field: dict[str, list[_Reading]] = {}
    for r in readings:
        if r.field not in _KEY_METRIC_INDEX or r.numeric_value is None:
            continue
        by_field.setdefault(r.field, []).append(r)

    out: list[dict[str, Any]] = []
    for field, lst in by_field.items():
        if len(lst) < 2:
            continue
        ordered = sorted(lst, key=lambda r: r.measured_at, reverse=True)
        cur, prev = ordered[0], ordered[1]
        if cur.numeric_value is None or prev.numeric_value is None:
            continue
        delta = _round1(cur.numeric_value - prev.numeric_value)
        flat_limit = _DELTA_FLAT_THRESHOLD.get(field, 0.1)
        trend = "flat"
        if abs(delta) >= flat_limit:
            if cur.range == "in" and prev.range != "in":
                trend = "improved"
            elif cur.range != "in" and prev.range == "in":
                trend = "worsened"
            elif cur.range == "above":
                trend = "improved" if delta < 0 else "worsened"
            elif cur.range == "below":
                trend = "improved" if delta > 0 else "worsened"
            else:
                trend = "flat"
        out.append(
            {
                "field": field,
                "unit": cur.unit,
                "ref": cur.ref,
                "current": {
                    "value": cur.numeric_value,
                    "display": cur.display,
                    "measured_at": cur.measured_at,
                    "range": cur.range,
                },
                "previous": {
                    "value": prev.numeric_value,
                    "display": prev.display,
                    "measured_at": prev.measured_at,
                    "range": prev.range,
                },
                "delta": delta,
                "trend": trend,
            }
        )
    out.sort(key=lambda d: _KEY_METRIC_INDEX[str(d["field"])])
    return out


def _critical_labs(readings: list[_Reading]) -> list[dict[str, Any]]:
    """selectCriticalLabs — latest-per-field crossing a conservative critical threshold."""
    out: list[dict[str, Any]] = []
    for r in _latest_metrics_by_field(readings):
        if r.numeric_value is None:
            continue
        for field, threshold, reason in _CRITICAL_RULES:
            if r.field == field and r.numeric_value >= threshold:
                out.append(
                    {
                        "field": r.field,
                        "display": r.display,
                        "ref": r.ref,
                        "measured_at": r.measured_at,
                        "analysis_public_id": r.analysis_public_id,
                        "analysis_label": r.analysis_label,
                        "reason": reason,
                    }
                )
                break
    return out


def _analyte_view(r: _Reading) -> dict[str, Any]:
    return {
        "field": r.field,
        "display": r.display,
        "numeric_value": r.numeric_value,
        "unit": r.unit,
        "ref": r.ref,
        "ref_min": r.ref_min,
        "ref_max": r.ref_max,
        "range": r.range,
        "low_confidence": r.low_confidence,
        "verification": r.verification,
        "verified_by": r.verified_by,
        "verified_at": r.verified_at,
        "measured_at": r.measured_at,
        "analysis_public_id": r.analysis_public_id,
        "analysis_label": r.analysis_label,
        "analysis_type": r.analysis_type,
    }


# ─── Section 2: Пробелы (visit gaps + Vasily observations, merged into agenda) ──


def _visit_gaps(bundle: _PatientBundle, now: dt.datetime) -> list[dict[str, Any]]:
    """selectVisitGaps — plan-overdue / plan-pending / low-confidence-ocr /
    doc-unstructured, ordered: overdue protocol → remaining protocol → patient-discovered."""
    gaps: list[dict[str, Any]] = []

    for p in bundle.plan_items:
        if p.status in (str(PlanItemStatus.UPLOADED), str(PlanItemStatus.ACKNOWLEDGED)):
            continue
        # FE parity: an item due TODAY counts as overdue. doctorSelectors.ts compares
        # ``new Date(dueDate) < now`` (date-only dueDate parses to midnight, always < now
        # on its own day), so ``<= today`` matches it for all realistic values.
        overdue = p.due_date is not None and p.due_date <= now.date()
        gaps.append(
            {
                "id": f"plan-{p.public_id}",
                "kind": "plan-overdue" if overdue else "plan-pending",
                "source": "protocol",
                "label": f"{p.label} — не сдан",
                "subtext": "просрочен план визита" if overdue else "по плану ожидаем результат",
                "_plan_item_public_id": str(p.public_id),
                "_plan_analysis_type": p.analysis_type,
                "_plan_label": p.label,
                "_plan_reason": p.reason,
                "_plan_last_requested_at": (
                    p.last_requested_at.isoformat() if p.last_requested_at else None
                ),
            }
        )

    for a in bundle.analyses:
        for f in bundle.fields_by_analysis.get(a.internal_id, []):
            if not f.low_confidence:
                continue
            # Resolved (confirmed/rejected) readings no longer belong on the list.
            if f.doctor_metadata_verdict in ("confirmed", "rejected"):
                continue
            gaps.append(
                {
                    "id": f"ocr-{a.public_id}-{f.field_key}",
                    "kind": "low-confidence-ocr",
                    "source": "patient-discovered",
                    "label": f"{f.field_key} — низкая уверенность OCR",
                    "subtext": f"«{a.label}» · стоит свериться с оригиналом",
                }
            )

    for d in bundle.documents:
        if d.processing_status == "original_only":
            label = d.label or _document_label(d.document_type)
            gaps.append(
                {
                    "id": f"doc-{d.public_id}",
                    "kind": "doc-unstructured",
                    "source": "patient-discovered",
                    "label": f"{label} — не структурировано",
                    "subtext": "сохранён только оригинал, ручная сверка",
                }
            )

    def rank(g: dict[str, Any]) -> int:
        if g["kind"] == "plan-overdue":
            return 0
        if g["source"] == "protocol":
            return 1
        return 2

    return sorted(gaps, key=rank)


def _document_label(document_type: str) -> str:
    return {
        str(DocumentType.PASSPORT): "Паспорт",
        str(DocumentType.OMS): "Полис ОМС",
        str(DocumentType.SNILS): "СНИЛС",
        str(DocumentType.REFERRAL): "Направление",
    }.get(document_type, "Документ")


def _vasily_observations(bundle: _PatientBundle, now: dt.datetime) -> list[dict[str, Any]]:
    """selectVasilyObservations — deterministic RULE patterns over the same store
    (NOT an LLM): data-gap (ТТГ for diabetics), kidneys+microalbumin, low-conf OCR,
    HbA1c-vs-target, lipids, emotional. Capped at 4 (slice(0, 4))."""
    out: list[dict[str, Any]] = []
    complaints = bundle.complaints
    analyses = bundle.analyses
    plan_items = bundle.plan_items

    all_readings = bundle.readings(acknowledged_only=False)

    # Pattern 0: data-gap synthesis — ТТГ never measured for a diabetic, not already
    # in an open plan item. Diabetic profile is the only one wired for the pilot.
    label_lower = (bundle.diagnosis_label or "").lower()
    is_diabetic = bool(bundle.diagnosis_label) and "диабет" in label_lower
    if is_diabetic:
        has_tsh_reading = any(r.field.lower() == "ттг" for r in all_readings)
        has_open_tsh_plan = any(
            ("ттг" in p.label.lower() or "щитовид" in p.label.lower())
            and p.status in (str(PlanItemStatus.ASSIGNED), str(PlanItemStatus.UPLOADED))
            for p in plan_items
        )
        if not has_tsh_reading and not has_open_tsh_plan:
            out.append(
                {
                    "id": "v-gap-tsh",
                    "anchor": "пробел в данных",
                    "text": (
                        "ТТГ ни разу не сдавался — для пациента с диабетом стоит хотя бы "
                        "базовое измерение. Можно запросить."
                    ),
                    "data_gap": {
                        "field": "ТТГ",
                        "analysis_type": "other",
                        "label": "ТТГ (щитовидная железа)",
                        "reason": "Базовая проверка щитовидной железы — рутинно при диабете.",
                    },
                }
            )

    # Pattern 1: patient asks about kidneys + микроальбумин plan item still assigned.
    asks_kidneys = any(
        _matches(c.text, ("почк", "микроальбумин", "нефро")) for c in complaints
    )
    micro_albumin = any(
        _matches(p.label, ("микроальбумин", "альбумин"))
        and p.status == str(PlanItemStatus.ASSIGNED)
        for p in plan_items
    )
    if asks_kidneys and micro_albumin:
        out.append(
            {
                "id": "v-kidneys-microalbumin",
                "anchor": "жалобы + план",
                "text": (
                    "Пациент сам спрашивает про почки — микроальбумин по плану ещё не "
                    "сдан. Уместно обсудить."
                ),
                "data_gap": None,
            }
        )

    # Pattern 2: low-confidence OCR concentrated on one lab (first such analysis).
    for a in analyses:
        low_conf_fields = [
            f for f in bundle.fields_by_analysis.get(a.internal_id, []) if f.low_confidence
        ]
        if not low_conf_fields:
            continue
        f = low_conf_fields[0]
        out.append(
            {
                "id": f"v-ocr-{a.public_id}",
                "anchor": a.label,
                "text": (
                    f"{f.field_key} {f.raw_value} — Василий не уверен в распознавании. "
                    "Стоит свериться с оригиналом."
                ),
                "data_gap": None,
            }
        )

    # Pattern 3: HbA1c gap from target (acknowledged readings drive the metric, but
    # the frontend uses all-analysis readings here — keep parity with all_readings).
    hba = next(
        (
            r
            for r in all_readings
            if r.field == "HbA1c" and r.numeric_value is not None
        ),
        None,
    )
    if hba is not None and hba.numeric_value is not None and hba.range == "above":
        target = 6.5
        gap = _round1(hba.numeric_value - target)
        sign = f"+{gap}" if gap > 0 else f"{gap}"
        out.append(
            {
                "id": "v-hba1c-target",
                "anchor": "HbA1c",
                "text": f"HbA1c {hba.display} — выше целевого {target}%. Разрыв {sign}.",
                "data_gap": None,
            }
        )

    # Pattern 4: lipid panel — both Холестерин and ЛПНП elevated.
    chol_high = any(r.field == "Холестерин" and r.range == "above" for r in all_readings)
    ldl_high = any(r.field == "ЛПНП" and r.range == "above" for r in all_readings)
    if chol_high and ldl_high:
        chol = next(r for r in all_readings if r.field == "Холестерин" and r.range == "above")
        ldl = next(r for r in all_readings if r.field == "ЛПНП" and r.range == "above")
        out.append(
            {
                "id": "v-lipids",
                "anchor": "липидный профиль",
                "text": (
                    f"Холестерин {chol.display} и ЛПНП {ldl.display} — оба выше нормы. "
                    "Стоит обсудить липидный статус."
                ),
                "data_gap": None,
            }
        )

    # Pattern 5: emotional / anxiety signal in complaints.
    _emotional = ("тревог", "переживаю", "беспокою", "боюсь", "страшно")
    anxious = next(
        (c for c in complaints if _matches(c.text, _emotional)),
        None,
    )
    if anxious is not None:
        anchor = f"жалоба №{anxious.priority}" if anxious.priority else "жалоба"
        out.append(
            {
                "id": "v-emotional",
                "anchor": anchor,
                "text": (
                    "Пациент написал об эмоциональных переживаниях. Стоит акцентировать "
                    "поддержку в разговоре."
                ),
                "data_gap": None,
            }
        )

    _ = now  # reserved for future temporal patterns (parity with selector signature)
    return out[:4]


def _matches(text: str, needles: tuple[str, ...]) -> bool:
    low = text.lower()
    return any(n in low for n in needles)


def _visit_agenda(bundle: _PatientBundle, now: dt.datetime) -> list[dict[str, Any]]:
    """selectVisitAgenda — MERGE gaps + observations. An observation on the same
    artefact as a gap becomes that gap's rationale; standalone observations are appended.
    Data-gap synthesis ranks first (the active «чего тут нет» job)."""
    gaps = _visit_gaps(bundle, now)
    obs = _vasily_observations(bundle, now)
    used_obs: set[str] = set()
    items: list[dict[str, Any]] = []

    # Data-gap synthesis first.
    for o in obs:
        if not o.get("data_gap"):
            continue
        dg = o["data_gap"]
        items.append(
            {
                "id": o["id"],
                "label": o["text"],
                "sources": ["data-gap"],
                "rationale": None,
                "requestable": {
                    "plan_item_public_id": None,
                    "analysis_type": dg["analysis_type"],
                    "label": dg["label"],
                    "reason": dg["reason"],
                    "last_requested_at": None,
                },
            }
        )
        used_obs.add(o["id"])

    for g in gaps:
        kind = g["kind"]
        sources: list[str] = []
        if kind == "plan-overdue":
            sources.append("plan-overdue")
        elif kind == "plan-pending":
            sources.append("plan-pending")
        elif kind == "low-confidence-ocr":
            sources.append("ocr-low-conf")
        else:
            sources.append("doc-unstructured")

        rationale: str | None = g.get("subtext")

        # Match: «patient asks about kidneys + микроальбумин по плану».
        if kind in ("plan-overdue", "plan-pending") and _matches(
            g["label"], ("микроальбумин", "альбумин")
        ):
            m = next((o for o in obs if o["id"] == "v-kidneys-microalbumin"), None)
            if m is not None:
                rationale = m["text"]
                sources.append("patient-question")
                used_obs.add(m["id"])

        # Match: OCR observation attached to the same analysis as the gap.
        if kind == "low-confidence-ocr":
            m = next(
                (
                    o
                    for o in obs
                    if o["id"].startswith("v-ocr-")
                    and g["id"].startswith(f"ocr-{o['id'][len('v-ocr-'):]}-")
                ),
                None,
            )
            if m is not None:
                rationale = m["text"]
                used_obs.add(m["id"])

        requestable: dict[str, Any] | None = None
        if kind in ("plan-overdue", "plan-pending") and g.get("_plan_item_public_id"):
            overdue = kind == "plan-overdue"
            requestable = {
                "plan_item_public_id": g["_plan_item_public_id"],
                "analysis_type": g.get("_plan_analysis_type"),
                "label": g.get("_plan_label"),
                "reason": g.get("_plan_reason")
                or (
                    "Просрочен план визита — нужно к этому приёму"
                    if overdue
                    else "По плану ожидаем результат к приёму"
                ),
                "last_requested_at": g.get("_plan_last_requested_at"),
            }

        items.append(
            {
                "id": g["id"],
                "label": g["label"],
                "sources": sources,
                "rationale": rationale,
                "requestable": requestable,
            }
        )

    # Standalone observations — not anchored to a gap.
    for o in obs:
        if o["id"] in used_obs:
            continue
        source = "lab-out-of-range"
        if o["id"] == "v-hba1c-target":
            source = "lab-target-gap"
        elif o["id"] == "v-emotional":
            source = "emotional-signal"
        items.append(
            {
                "id": o["id"],
                "label": o["text"],
                "sources": [source],
                "rationale": None,
                "requestable": None,
            }
        )

    return items


# ─── Section 3: Вопросы (ranked complaints) ─────────────────────────────────────


def _ranked_questions(bundle: _PatientBundle, limit: int = 3) -> list[dict[str, Any]]:
    """selectRankedQuestions — top-N by patient priority asc (1 = highest), newest-first
    tiebreak; recency fallback when no priority set."""
    INF = float("inf")

    def sort_key(c: Complaint) -> tuple[float, str]:
        priority = c.priority if c.priority is not None else INF
        # Negated recency via reverse-sortable ISO string: sort priority asc, then
        # createdAt desc. Emulate the frontend's two-key compare with a stable sort.
        return (priority, _neg_iso(c.created_at.isoformat()))

    ordered = sorted(bundle.complaints, key=sort_key)
    return [
        {
            "public_id": str(c.public_id),
            "text": c.text,
            "kind": c.kind,
            "tags": c.tags or [],
            "priority": c.priority,
            "created_at": c.created_at.isoformat(),
        }
        for c in ordered[:limit]
    ]


def _neg_iso(iso: str) -> str:
    """A sort key that orders ISO timestamps descending (newest first) under ascending
    sort. Inverts each character so lexicographic ascending == chronological descending."""
    return "".join(chr(0x10FFFF - ord(ch)) if ord(ch) < 0x10FFFF else ch for ch in iso)


# ─── Prep meta (selectPrepMeta) ─────────────────────────────────────────────────


def _prep_meta(bundle: _PatientBundle) -> dict[str, Any]:
    p = bundle.patient
    return {
        "prepared_at": p.prep_completed_at.isoformat() if p.prep_completed_at else None,
        "time_spent_min": p.prep_time_spent_min,
        "docs_count": len(bundle.documents),
        "questions_count": len(bundle.complaints),
    }


# ─── Queue (D01) ────────────────────────────────────────────────────────────────


def _prep_status(patient: Patient) -> str:
    """Derive prep status: готов (completed) → в процессе (started) → не начал."""
    if patient.prep_completed_at is not None:
        return "ready"
    if patient.prep_started_at is not None:
        return "in_progress"
    return "not_started"


async def _resolve_calling_doctor(s: AsyncSession, claims: TokenClaims) -> Doctor:
    """Resolve the calling Doctor from claims via the UserAccount join — same pattern
    as create_doctor_request. ``forbidden`` if the subject is not a doctor in this partner."""
    partner_id = uuid.UUID(claims.partner_id)
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
    return doctor


def _queue_row_view(
    *,
    patient: Patient,
    name: str,
    bundle: _PatientBundle,
    appointment: Appointment,
) -> dict[str, Any]:
    """D01 row inputs derived per the frontend buildRow precedence. We expose the raw
    inputs (counts, presence flags, out-of-range indicators) plus the derived prep
    status; row-status / sortRank precedence is re-derivable on the client from these."""
    plan_items = bundle.plan_items
    uploaded_plan = sum(1 for p in plan_items if p.status == str(PlanItemStatus.UPLOADED))
    assigned_plan = sum(1 for p in plan_items if p.status == str(PlanItemStatus.ASSIGNED))
    acknowledged_plan = sum(
        1 for p in plan_items if p.status == str(PlanItemStatus.ACKNOWLEDGED)
    )
    doc_types = {d.document_type for d in bundle.documents}
    has_passport = str(DocumentType.PASSPORT) in doc_types
    has_oms = str(DocumentType.OMS) in doc_types
    required_docs = int(has_passport) + int(has_oms)

    # Out-of-range indicators: newest-analysis-first, out-of-range only, max 3 distinct
    # fields. Computed over ALL analyses (queue glance, not the acknowledged grid).
    seen: set[str] = set()
    indicators: list[dict[str, Any]] = []
    for a in sorted(bundle.analyses, key=lambda a: a.uploaded_at, reverse=True):
        for r in _readings_from_analysis(a, bundle.fields_by_analysis.get(a.internal_id, [])):
            if r.field in seen or r.range not in ("above", "below"):
                continue
            seen.add(r.field)
            display = (
                f"{r.numeric_value}{(' ' + r.unit) if r.unit else ''}"
                if r.numeric_value is not None
                else r.display
            )
            indicators.append({"field": r.field, "display": display, "range": r.range})
            if len(indicators) >= 3:
                break
        if len(indicators) >= 3:
            break

    return {
        "patient_public_id": str(patient.public_id),
        "name": name,
        "scheduled_at": appointment.scheduled_at.isoformat(),
        "appointment_type": appointment.type,
        "prep_status": _prep_status(patient),
        "plan_total": len(plan_items),
        "plan_assigned": assigned_plan,
        "plan_uploaded": uploaded_plan,
        "plan_acknowledged": acknowledged_plan,
        "required_docs_present": required_docs,
        "has_passport": has_passport,
        "has_oms": has_oms,
        "has_analyses": len(bundle.analyses) > 0,
        "has_complaints": len(bundle.complaints) > 0,
        "unseen_doctor_requests": False,  # filled below from request rows
        "out_of_range_indicators": indicators,
    }


async def list_queue(claims: TokenClaims) -> dict[str, Any]:
    """D01 — today's appointments for the calling doctor, grant-gated per patient.

    No per-row ``doctor_view`` audit: the queue is a SCHEDULING list, not opening
    clinical content. The SUMMARY read is what audits (INV-AU-5). Read-only; runs under
    a plain ``transaction()`` for a consistent snapshot but writes nothing.
    """
    from app.db.models.plan import DoctorRequest

    partner_id = uuid.UUID(claims.partner_id)
    now = _now()
    today = now.date()

    async with transaction() as uow:
        s = uow.session
        doctor = await _resolve_calling_doctor(s, claims)

        appts = list(
            (
                await s.scalars(
                    select(Appointment)
                    .where(
                        Appointment.doctor_id == doctor.internal_id,
                        Appointment.partner_id == partner_id,
                        Appointment.deleted_at.is_(None),
                    )
                    .order_by(Appointment.scheduled_at.asc())
                )
            ).all()
        )
        # Today's appointments only (scheduled_at::date == today).
        appts = [a for a in appts if a.scheduled_at.date() == today]

        rows: list[dict[str, Any]] = []
        for appt in appts:
            patient = await s.get(Patient, appt.patient_internal_id)
            if patient is None or patient.deleted_at is not None:
                continue
            # GATE: only patients who currently grant access to this doctor's clinic.
            grant = await active_grant_for_doctor(
                s,
                partner_id=partner_id,
                patient_internal_id=patient.internal_id,
                clinic_id=doctor.clinic_id,
            )
            if grant is None:
                continue
            pii = await resolve_patient_pii(s, patient.internal_id)
            name = pii.full_name if pii is not None else "—"
            bundle = await _load_patient_bundle(s, patient)
            row = _queue_row_view(
                patient=patient, name=name, bundle=bundle, appointment=appt
            )
            unseen = await s.scalar(
                select(DoctorRequest.internal_id)
                .where(
                    DoctorRequest.patient_internal_id == patient.internal_id,
                    DoctorRequest.seen_by_patient.is_(False),
                    DoctorRequest.deleted_at.is_(None),
                )
                .limit(1)
            )
            row["unseen_doctor_requests"] = unseen is not None
            rows.append(row)

        return {
            "as_of": now.isoformat(),
            "doctor_public_id": str(doctor.public_id),
            "rows": rows,
        }


# ─── Summary (D02) ──────────────────────────────────────────────────────────────


async def build_summary(claims: TokenClaims, patient_public_id: uuid.UUID) -> dict[str, Any]:
    """D02 — the rich 3-section read model for one patient. DERIVED + built-on-read.

    Grant-gated (re-derived per request). SIDE-EFFECT in the same transaction:
    emit ``doctor_view`` audit (PII/medical-free metadata) + stamp ``last_viewed_at``
    on the active grant (INV-AU-5). Missing patient / wrong partner / no grant all
    surface as ``not_found`` (never reveal existence — consistent with plan_service).
    """
    partner_id = uuid.UUID(claims.partner_id)
    now = _now()

    async with transaction() as uow:
        s = uow.session
        doctor = await _resolve_calling_doctor(s, claims)

        patient_internal_id = await resolve_public_id(s, patient_public_id)
        if patient_internal_id is None:
            raise not_found("patient not found")
        patient = await s.get(Patient, patient_internal_id)
        if patient is None or patient.deleted_at is not None:
            raise not_found("patient not found")
        # Cross-partner guard (INV-TX-2) — not_found, never reveal cross-partner existence.
        if patient.partner_id != partner_id:
            raise not_found("patient not found")

        grant = await active_grant_for_doctor(
            s,
            partner_id=partner_id,
            patient_internal_id=patient_internal_id,
            clinic_id=doctor.clinic_id,
        )
        if grant is None:
            # No active grant ⇒ no clinical data, and we do not confirm existence.
            raise not_found("patient not found")

        pii = await resolve_patient_pii(s, patient_internal_id)
        display_name = pii.full_name if pii is not None else "—"

        # Clinical-context header: working diagnosis = most-recent condition, preferring
        # a clinic-confirmed one. Demographics ride the same grant as display_name.
        cond = await s.scalar(
            select(ConditionContext)
            .where(
                ConditionContext.patient_internal_id == patient_internal_id,
                ConditionContext.deleted_at.is_(None),
            )
            .order_by(
                ConditionContext.is_confirmed_by_clinic.desc(),
                ConditionContext.created_at.desc(),
            )
            .limit(1)
        )
        diagnosis = (
            {"label": cond.label, "confirmed": cond.is_confirmed_by_clinic}
            if cond is not None
            else None
        )

        bundle = await _load_patient_bundle(s, patient)

        # Section 1: Анализы — ACKNOWLEDGED-only gating for metrics/deltas/criticals.
        ack_readings = bundle.readings(acknowledged_only=True)
        key_metrics = _key_metrics(ack_readings)
        deltas = _deltas_since_last_visit(ack_readings)
        criticals = _critical_labs(ack_readings)
        out_of_range_count = _out_of_range_count(ack_readings)

        # Prep-window uploads (all analyses in the current prep window) — analyte rows.
        prep_uploads = [
            {
                "public_id": str(a.public_id),
                "analysis_type": a.analysis_type,
                "label": a.label,
                "status": a.status,
                "lab_date": a.lab_date.isoformat() if a.lab_date else None,
                "uploaded_at": a.uploaded_at.isoformat(),
                "linked_plan_item": a.linked_plan_item_id is not None,
                "analytes": [
                    _analyte_view(r)
                    for r in _readings_from_analysis(
                        a, bundle.fields_by_analysis.get(a.internal_id, [])
                    )
                ],
            }
            for a in bundle.analyses_for_current_prep()
        ]

        analyses_section = {
            "key_metrics": [_analyte_view(r) for r in key_metrics],
            "deltas": deltas,
            "critical_labs": criticals,
            "out_of_range_count": out_of_range_count,
            "has_acknowledged_metrics": len(ack_readings) > 0,
            "prep_uploads": prep_uploads,
        }

        # Section 2: Пробелы — merged agenda (gaps + Vasily observations).
        agenda = _visit_agenda(bundle, now)
        gaps_section = {
            "credit": "Что заметил Василий",
            "agenda": agenda,
        }

        # Section 3: Вопросы — ranked complaints.
        questions_section = {
            "ranked": _ranked_questions(bundle),
            "total": len(bundle.complaints),
        }

        result: dict[str, Any] = {
            "patient_public_id": str(patient.public_id),
            "display_name": display_name,
            "dob": pii.birth_date.isoformat() if pii is not None else None,
            "gender": pii.gender if pii is not None else None,
            "diagnosis": diagnosis,
            "prep_meta": _prep_meta(bundle),
            "analyses": analyses_section,
            "gaps": gaps_section,
            "questions": questions_section,
            "disclaimer_key": DISCLAIMER_KEY,
        }

        # SIDE-EFFECT (INV-AU-5): doctor_view audit + last_viewed_at projection. The
        # audit metadata is PII/medical-free — counts only, no names / values / free-text.
        await emit_audit(
            s,
            partner_id=partner_id,
            actor_role=ActorRole.DOCTOR,
            event_type=AuditEventType.DOCTOR_VIEW,
            subject_internal_id=patient_internal_id,
            target_type="patient",
            target_id=patient_internal_id,
            metadata={
                "section_count": 3,
                "key_metric_count": len(key_metrics),
                "agenda_item_count": len(agenda),
                "question_count": len(bundle.complaints),
            },
        )
        grant.last_viewed_at = now

        return result
