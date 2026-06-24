"""Canonical enums (data-model.md). Stored as text; values are the wire form.

Identifiers English; these mirror the data-model catalog exactly.
"""

from __future__ import annotations

from enum import StrEnum


class UserRole(StrEnum):
    PATIENT = "patient"
    DOCTOR = "doctor"
    CLINIC_ADMIN = "clinic_admin"


class Gender(StrEnum):
    MALE = "male"
    FEMALE = "female"


class ConsentType(StrEnum):
    PDN_GENERAL = "pdn_general"
    PDN_SPECIAL = "pdn_special"
    MEDICAL_DATA = "medical_data"
    CLINIC_TRANSFER = "clinic_transfer"
    OCR_AI = "ocr_ai"
    CROSS_BORDER = "cross_border"
    MARKETING = "marketing"


class AckMechanism(StrEnum):
    SCROLL_TO_END = "scroll_to_end"
    A11Y_CHECKBOX = "a11y_checkbox"
    DIRECT_TICK = "direct_tick"
    NOT_APPLICABLE = "not_applicable"


class AcceptanceMethod(StrEnum):
    MOCK_NO_OTP = "mock_no_otp"  # honest mock e-sign — never "ЭП" (INV-CO-6)
    OTP = "otp"
    SMS = "sms"
    ESIGN_PROVIDER = "esign_provider"


class ConsentBundleStatus(StrEnum):
    ACTIVE = "active"
    SUPERSEDED = "superseded"
    REVOKED = "revoked"
    ARCHIVED = "archived"


class GrantedToType(StrEnum):
    CLINIC = "clinic"
    DEPARTMENT = "department"
    DOCTOR = "doctor"
    CAREGIVER = "caregiver"  # reserved seat (Q6)


class DataScope(StrEnum):
    ANALYSES_PREP = "analyses_prep"
    DOCUMENTS = "documents"
    ANALYSES = "analyses"
    COMPLAINTS = "complaints"
    SUMMARY = "summary"
    ALL = "all"


class CreatedByType(StrEnum):
    PATIENT = "patient"
    SYSTEM = "system"


class ConditionSource(StrEnum):
    CLINIC = "clinic"
    PATIENT_REPORTED = "patient_reported"
    REFERRAL = "referral"
    # never "ai"


class AppointmentType(StrEnum):
    MAIN = "main"
    PREPARATORY = "preparatory"


class AppointmentStatus(StrEnum):
    SCHEDULED = "scheduled"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"


class AppointmentSource(StrEnum):
    MANUAL = "manual"
    QR = "qr"
    MIS = "mis"
    IMPORT = "import"
    MOCK = "mock"


class OutboxEventType(StrEnum):
    REVOKE_ACCESS = "revoke_access"
    INVALIDATE_SUMMARY = "invalidate_summary"
    INVALIDATE_DOCTOR_QUEUE = "invalidate_doctor_queue"
    INVALIDATE_PREP = "invalidate_prep"
    SEND_NOTIFICATION = "send_notification"
    EXPIRE_ACCESS_GRANTS = "expire_access_grants"
    DISPATCH_TICKET_ROUTING = "dispatch_ticket_routing"


class OutboxStatus(StrEnum):
    PENDING = "pending"
    DISPATCHED = "dispatched"
    DONE = "done"
    FAILED = "failed"
    DEAD_LETTER = "dead_letter"


class RefreshTokenStatus(StrEnum):
    ISSUED = "issued"
    ROTATED = "rotated"
    REVOKED = "revoked"
    EXPIRED = "expired"


class IdempotencyStatus(StrEnum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class ActorRole(StrEnum):
    PATIENT = "patient"
    DOCTOR = "doctor"
    CLINIC_ADMIN = "clinic_admin"
    SYSTEM = "system"


class AuditEventType(StrEnum):
    ONBOARDING_COMMITTED = "onboarding_committed"
    CONSENT_RECORDED = "consent_recorded"
    CONSENT_REVOKED = "consent_revoked"
    CONSENT_RESIGNED = "consent_resigned"
    ACCESS_GRANTED = "access_granted"
    ACCESS_REVOKED = "access_revoked"
    ACCESS_EXPIRED = "access_expired"
    ACCESS_EXTENDED = "access_extended"
    ACCESS_SUSPENDED = "access_suspended"
    DOCUMENT_UPLOADED = "document_uploaded"
    DOCUMENT_ACCEPTED = "document_accepted"
    DOCUMENT_REJECTED = "document_rejected"
    OCR_COMPLETED = "ocr_completed"
    OCR_FIELD_EDITED = "ocr_field_edited"
    OCR_FIELD_VERDICT_STAMPED = "ocr_field_verdict_stamped"
    ANALYSIS_ACKNOWLEDGED = "analysis_acknowledged"
    ANALYSIS_REJECTED = "analysis_rejected"
    ANALYSIS_RESEND_REQUESTED = "analysis_resend_requested"
    DOCTOR_VIEW = "doctor_view"
    DOCTOR_REQUEST_CREATED = "doctor_request_created"
    DOCTOR_REQUEST_SEEN = "doctor_request_seen"
    PLAN_ITEM_REQUESTED = "plan_item_requested"
    SUPPORT_TICKET_CREATED = "support_ticket_created"
    SUSPICIOUS_ACTIVITY_REPORTED = "suspicious_activity_reported"
    ADMIN_KPI_VIEWED = "admin_kpi_viewed"
    ACCOUNT_DELETED = "account_deleted"
    IDENTITY_UPDATED = "identity_updated"
    BASELINE_UPDATED = "baseline_updated"
    PREP_STARTED = "prep_started"
    PREP_COMPLETED = "prep_completed"


# --- Slice B (clinical) ---


class StorageZone(StrEnum):
    QUARANTINE = "quarantine"
    ACCEPTED = "accepted"
    PROCESSED = "processed"
    ARCHIVED = "archived"
    DELETED = "deleted"


class DocumentType(StrEnum):
    ANALYSIS_RESULT = "analysis_result"
    PASSPORT = "passport"
    OMS = "oms"
    SNILS = "snils"
    REFERRAL = "referral"
    DISCHARGE = "discharge"
    OTHER = "other"


class DocumentProcessingStatus(StrEnum):
    UPLOADED = "uploaded"
    SCANNING = "scanning"
    ACCEPTED = "accepted"
    OCR_RUNNING = "ocr_running"
    OCR_DONE = "ocr_done"
    ORIGINAL_ONLY = "original_only"
    REJECTED = "rejected"
    DELETED = "deleted"


class DocumentFailureReason(StrEnum):
    VIRUS = "virus"
    FILE_TYPE = "file_type"
    SIZE = "size"
    POOR_QUALITY = "poor_quality"
    OCR_ERROR = "ocr_error"


class QualityCheck(StrEnum):
    CLEAR = "clear"
    ACCEPTABLE = "acceptable"


class AnalysisType(StrEnum):
    HBA1C = "HbA1c"
    GLUCOSE = "glucose"
    CREATININE = "creatinine"
    CHOLESTEROL = "cholesterol"
    OTHER = "other"


class AnalysisStatus(StrEnum):
    UPLOADED = "uploaded"
    STRUCTURED = "structured"
    ACKNOWLEDGED = "acknowledged"
    REJECTED = "rejected"
    RESEND_REQUESTED = "resend_requested"


class AnalysisRejectionReason(StrEnum):
    NOT_MY_CLINIC = "not_my_clinic"
    WRONG_PATIENT = "wrong_patient"
    WRONG_PANEL = "wrong_panel"
    DUPLICATE = "duplicate"
    OTHER = "other"


class AnalysisResendReason(StrEnum):
    POOR_QUALITY = "poor_quality"
    MISSING_PAGES = "missing_pages"
    DATE_UNREADABLE = "date_unreadable"
    LAB_STAMP_MISSING = "lab_stamp_missing"
    OTHER = "other"


class PatientTranscriptionState(StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"


class DoctorMetadataVerdict(StrEnum):
    NONE = "none"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"


class OcrEditedByType(StrEnum):
    PATIENT = "patient"
    DOCTOR = "doctor"
    SYSTEM = "system"
    TRUSTED_SOURCE = "trusted_source"


class ComplaintKind(StrEnum):
    COMPLAINT = "complaint"
    QUESTION = "question"


# --- Slice C (plan: doctor→patient loop) ---


class DoctorRequestStatus(StrEnum):
    CREATED = "created"
    SENT = "sent"
    SEEN = "seen"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class PlanItemStatus(StrEnum):
    ASSIGNED = "assigned"
    UPLOADED = "uploaded"
    ACKNOWLEDGED = "acknowledged"


class OrderIntent(StrEnum):
    # Wire form is hyphenated to match the frontend store union (OrderIntent in
    # store/types.ts) and data-model-decisions.md. See test_enum_frontend_contract.
    BEFORE_VISIT = "before-visit"
    DYNAMICS_CONTROL = "dynamics-control"
    ADDITIONAL_CHECK = "additional-check"
    OCR_CLARIFICATION = "ocr-clarification"


class OrderKind(StrEnum):
    LAB = "lab"
    INSTRUMENTAL = "instrumental"
    REFERRAL = "referral"
    SELF_MONITOR = "self-monitor"  # hyphenated to match the frontend union


# --- Slice E (support: tickets + dual-destination routing) ---


class SupportCategory(StrEnum):
    TECH_ISSUE = "tech_issue"
    QUESTION = "question"
    # Integrity / safety categories — route to TWO destinations (INV-SR-1).
    NOT_MY_ANALYSIS = "not_my_analysis"
    NOT_MY_CLINIC = "not_my_clinic"
    SUSPICIOUS_ACTIVITY = "suspicious_activity"
    OTHER = "other"


class TicketDestination(StrEnum):
    INTELDOC_SUPPORT = "inteldoc_support"
    INTELDOC_SECURITY = "inteldoc_security"
    PARTNER_REGISTRY = "partner_registry"
    PARTNER_ADMIN = "partner_admin"


class TicketDeliveryStatus(StrEnum):
    PENDING = "pending"
    DISPATCHED = "dispatched"
    DELIVERED = "delivered"
    FAILED = "failed"
    DEAD_LETTER = "dead_letter"


class SupportTicketStatus(StrEnum):
    OPEN = "open"
    ROUTED = "routed"
    RESOLVED = "resolved"
    CLOSED = "closed"
