"""Doctor READ schemas (D01 queue + D02 rich summary). snake_case; field names mirror
the frontend ``doctorSelectors.ts`` read-models where practical so a later frontend→
backend swap is mechanical. Pydantic response models (not ORM).

The summary is the RICH option — the analytics are computed server-side, not deferred
to the client. The 3 sections (Анализы / Пробелы / Вопросы) plus prep meta and the
disclaimer copy-key (INV-AI-8) all travel in the payload.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

# ─── Doctor writes — OCR verdict + acknowledge (spec §7.6) ──────────────────────


class VerdictIn(BaseModel):
    # Structuring-metadata axis only (INV-AI-4): the doctor trusts the reading or flags
    # it as an OCR error — never rewrites the value. 'none' is not a settable verdict.
    verdict: Literal["confirmed", "rejected"]


class DoctorOcrFieldOut(BaseModel):
    field_key: str
    low_confidence: bool
    verification: str | None = None  # confirmed | rejected | None
    verified_by: str | None = None
    verified_at: str | None = None


class DoctorAnalysisOut(BaseModel):
    """Compact doctor-facing analysis state returned after a verdict / acknowledge —
    status + the metadata-verdict axis per field (never raw clinical values)."""

    patient_public_id: str
    analysis_public_id: str
    status: str  # uploaded | structured | acknowledged | rejected | resend_requested
    fields: list[DoctorOcrFieldOut]


# ─── D01 queue ──────────────────────────────────────────────────────────────────


class OutOfRangeIndicator(BaseModel):
    field: str
    display: str
    range: str  # above | below


class QueueRowOut(BaseModel):
    patient_public_id: str
    name: str
    scheduled_at: str
    appointment_type: str  # main | preparatory
    # готов | в процессе | не начал
    prep_status: str  # ready | in_progress | not_started
    plan_total: int
    plan_assigned: int
    plan_uploaded: int
    plan_acknowledged: int
    required_docs_present: int  # of passport + oms (0..2)
    has_passport: bool
    has_oms: bool
    has_analyses: bool
    has_complaints: bool
    unseen_doctor_requests: bool
    out_of_range_indicators: list[OutOfRangeIndicator]


class QueueOut(BaseModel):
    as_of: str
    doctor_public_id: str
    rows: list[QueueRowOut]


# ─── D02 summary — Section 1: Анализы ───────────────────────────────────────────


class AnalyteOut(BaseModel):
    """One OCR-extracted analyte reading (MetricReading)."""

    field: str
    display: str
    numeric_value: float | None = None
    unit: str | None = None
    ref: str | None = None
    ref_min: float | None = None
    ref_max: float | None = None
    range: str  # in | above | below | unknown
    low_confidence: bool
    verification: str | None = None  # confirmed | rejected | None
    verified_by: str | None = None
    verified_at: str | None = None
    measured_at: str
    analysis_public_id: str
    analysis_label: str
    analysis_type: str


class DeltaPointOut(BaseModel):
    value: float
    display: str
    measured_at: str
    range: str


class MetricDeltaOut(BaseModel):
    field: str
    unit: str | None = None
    ref: str | None = None
    current: DeltaPointOut
    previous: DeltaPointOut
    delta: float
    trend: str  # improved | worsened | flat


class CriticalLabOut(BaseModel):
    field: str
    display: str
    ref: str | None = None
    measured_at: str
    analysis_public_id: str
    analysis_label: str
    reason: str


class PrepUploadOut(BaseModel):
    public_id: str
    analysis_type: str
    label: str
    status: str  # uploaded | structured | acknowledged | rejected | resend_requested
    lab_date: str | None = None
    uploaded_at: str
    linked_plan_item: bool
    analytes: list[AnalyteOut]


class AnalysesSectionOut(BaseModel):
    # ACKNOWLEDGED-only gating: key metrics / deltas / criticals compute over accepted
    # analyses only (parity with the frontend Сводка call-site).
    key_metrics: list[AnalyteOut]
    deltas: list[MetricDeltaOut]
    critical_labs: list[CriticalLabOut]
    out_of_range_count: int
    has_acknowledged_metrics: bool
    # Prep-window uploads use ALL analyses since the last completed 'main' visit.
    prep_uploads: list[PrepUploadOut]


# ─── D02 summary — Section 2: Пробелы (merged visit agenda) ─────────────────────


class AgendaRequestableOut(BaseModel):
    plan_item_public_id: str | None = None
    analysis_type: str | None = None
    label: str | None = None
    reason: str | None = None
    last_requested_at: str | None = None


class AgendaItemOut(BaseModel):
    id: str
    label: str
    # plan-overdue | plan-pending | ocr-low-conf | doc-unstructured | patient-question
    # | lab-out-of-range | lab-target-gap | data-gap | emotional-signal
    sources: list[str]
    rationale: str | None = None
    requestable: AgendaRequestableOut | None = None


class GapsSectionOut(BaseModel):
    credit: str  # «Что заметил Василий»
    agenda: list[AgendaItemOut]


# ─── D02 summary — Section 3: Вопросы ───────────────────────────────────────────


class RankedQuestionOut(BaseModel):
    public_id: str
    text: str
    kind: str  # complaint | question
    tags: list[str]
    priority: int | None = None
    created_at: str


class QuestionsSectionOut(BaseModel):
    ranked: list[RankedQuestionOut]
    total: int


# ─── D02 summary — prep meta + envelope ─────────────────────────────────────────


class PrepMetaOut(BaseModel):
    prepared_at: str | None = None
    time_spent_min: int | None = None
    docs_count: int
    questions_count: int


class DiagnosisOut(BaseModel):
    label: str
    confirmed: bool  # is_confirmed_by_clinic


class SummaryOut(BaseModel):
    patient_public_id: str
    display_name: str
    # Clinical-context demographics for the record header (the attending doctor
    # already sees display_name; dob/gender/diagnosis travel with the same grant).
    dob: str | None = None
    gender: str | None = None
    diagnosis: DiagnosisOut | None = None
    prep_meta: PrepMetaOut
    analyses: AnalysesSectionOut
    gaps: GapsSectionOut
    questions: QuestionsSectionOut
    # INV-AI-8: disclaimer travels in the payload as a copy-key, not just the UI.
    disclaimer_key: str
