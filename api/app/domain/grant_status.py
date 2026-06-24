"""Pure access-grant effective-status derivation (spec §5.2, data-model §12.1).

Effective status is DERIVED from stored facts on every request — never stored
as a column (only ``is_suspended`` is a stored boolean). Precedence:

    revoked → suspended → expired → active

No framework, no I/O — unit-testable with zero infra.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from enum import StrEnum


class GrantStatus(StrEnum):
    REVOKED = "revoked"
    SUSPENDED = "suspended"
    EXPIRED = "expired"
    ACTIVE = "active"


@dataclass(frozen=True, slots=True)
class GrantFacts:
    """The stored facts an access_grant carries (data-model §access_grant)."""

    valid_from: dt.datetime
    expires_at: dt.datetime | None  # NULL = indefinite-until-revoke (Q3)
    revoked_at: dt.datetime | None
    is_suspended: bool


def effective_status(facts: GrantFacts, now: dt.datetime) -> GrantStatus:
    if facts.revoked_at is not None:
        return GrantStatus.REVOKED
    if facts.is_suspended:
        return GrantStatus.SUSPENDED
    if facts.expires_at is not None and facts.expires_at <= now:
        return GrantStatus.EXPIRED
    if facts.valid_from > now:
        # Not yet in force — treated as not-active (no clinical data).
        return GrantStatus.EXPIRED
    return GrantStatus.ACTIVE


def is_active(facts: GrantFacts, now: dt.datetime) -> bool:
    return effective_status(facts, now) is GrantStatus.ACTIVE
