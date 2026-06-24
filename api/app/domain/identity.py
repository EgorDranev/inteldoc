"""Pure identity helpers: phone normalization + audit subject pseudonym.

No framework, no I/O — unit-testable with zero infra.
"""

from __future__ import annotations

import hashlib
import hmac
import re


class InvalidPhoneError(ValueError):
    """Raised when a phone string cannot be normalized to E.164."""


_DIGITS = re.compile(r"\D+")


def normalize_phone_e164(raw: str) -> str:
    """Normalize a Russian phone string to E.164 (``+7XXXXXXXXXX``).

    Accepts prototype formats like ``+7 (916) 555-12-02``, ``8 916 ...``,
    ``7916...``. The natural key ``UNIQUE(partner_id, phone_e164)`` (Q4) depends
    on this being deterministic, so a QR re-scan resolves to the same patient.
    """
    digits = _DIGITS.sub("", raw or "")
    if not digits:
        raise InvalidPhoneError("empty phone")
    # Russian numbers: 11 digits starting 7 or 8; normalize leading 8 -> 7.
    if len(digits) == 11 and digits[0] in {"7", "8"}:
        digits = "7" + digits[1:]
    elif len(digits) == 10:
        digits = "7" + digits
    else:
        raise InvalidPhoneError(f"unexpected phone length: {len(digits)} digits")
    return "+" + digits


def audit_subject_id(pepper: str, internal_id: str) -> str:
    """Compute the audit pseudonym ``HMAC-SHA256(pepper, internal_id)`` (§6.1).

    Stable (same patient -> same id across events) and non-reversible without
    the pepper. ``internal_id`` is a UUID string.
    """
    return hmac.new(
        pepper.encode("utf-8"),
        internal_id.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
