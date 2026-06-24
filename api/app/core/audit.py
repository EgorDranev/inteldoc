"""Audit emission (spec §11.1). Called from within a service transaction so the
audit row commits atomically with the mutation (INV-AU-4).

``audit_subject_id = HMAC(audit_pepper, internal_id)`` — stable, non-reversible
(§6.1). Metadata must be PII/medical-free (INV-AU-2); the caller is responsible
for passing only safe keys (status_from/to, scope-keys, provider, size-bucket,
quality-code, sanitized-error).
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models.audit import AuditEvent
from app.domain.enums import ActorRole, AuditEventType
from app.domain.identity import audit_subject_id


async def emit_audit(
    session: AsyncSession,
    *,
    partner_id: uuid.UUID,
    actor_role: ActorRole,
    event_type: AuditEventType,
    subject_internal_id: uuid.UUID | None = None,
    actor_ref: str | None = None,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
    trace_id: uuid.UUID | None = None,
    metadata: dict[str, Any] | None = None,
) -> AuditEvent:
    subject = (
        audit_subject_id(get_settings().audit_pepper, str(subject_internal_id))
        if subject_internal_id is not None
        else None
    )
    row = AuditEvent(
        partner_id=partner_id,
        audit_subject_id=subject,
        actor_role=str(actor_role),
        actor_ref=actor_ref,
        event_type=str(event_type),
        target_type=target_type,
        target_id=target_id,
        trace_id=trace_id,
        metadata_json=metadata,
    )
    session.add(row)
    return row
