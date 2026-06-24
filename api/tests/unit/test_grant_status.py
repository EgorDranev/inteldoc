from __future__ import annotations

import datetime as dt

from app.domain.grant_status import GrantFacts, GrantStatus, effective_status, is_active

NOW = dt.datetime(2026, 6, 17, 12, 0, tzinfo=dt.UTC)
PAST = NOW - dt.timedelta(days=1)
FUTURE = NOW + dt.timedelta(days=1)


def _facts(**kw: object) -> GrantFacts:
    base = {
        "valid_from": PAST,
        "expires_at": None,
        "revoked_at": None,
        "is_suspended": False,
    }
    base.update(kw)
    return GrantFacts(**base)  # type: ignore[arg-type]


def test_indefinite_grant_is_active() -> None:
    # expires_at NULL = indefinite-until-revoke (Q3 decision).
    assert effective_status(_facts(), NOW) is GrantStatus.ACTIVE
    assert is_active(_facts(), NOW)


def test_revoked_takes_precedence_over_everything() -> None:
    facts = _facts(revoked_at=PAST, is_suspended=True, expires_at=PAST)
    assert effective_status(facts, NOW) is GrantStatus.REVOKED


def test_suspended_outranks_expired() -> None:
    facts = _facts(is_suspended=True, expires_at=PAST)
    assert effective_status(facts, NOW) is GrantStatus.SUSPENDED


def test_expired_when_past_expiry() -> None:
    assert effective_status(_facts(expires_at=PAST), NOW) is GrantStatus.EXPIRED


def test_future_expiry_still_active() -> None:
    assert effective_status(_facts(expires_at=FUTURE), NOW) is GrantStatus.ACTIVE


def test_not_yet_valid_is_not_active() -> None:
    assert effective_status(_facts(valid_from=FUTURE), NOW) is GrantStatus.EXPIRED
