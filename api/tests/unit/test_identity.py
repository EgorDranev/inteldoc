from __future__ import annotations

import pytest
from app.domain.identity import (
    InvalidPhoneError,
    audit_subject_id,
    normalize_phone_e164,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("+7 (916) 555-12-02", "+79165551202"),
        ("8 916 555 12 02", "+79165551202"),
        ("79165551202", "+79165551202"),
        ("9165551202", "+79165551202"),
        ("+7-916-555-12-02", "+79165551202"),
    ],
)
def test_normalize_phone_e164(raw: str, expected: str) -> None:
    assert normalize_phone_e164(raw) == expected


def test_normalize_phone_is_idempotent() -> None:
    once = normalize_phone_e164("+7 (916) 555-12-02")
    assert normalize_phone_e164(once) == once


@pytest.mark.parametrize("raw", ["", "abc", "12345", "+7 916 555 12 02 99"])
def test_normalize_phone_rejects_garbage(raw: str) -> None:
    with pytest.raises(InvalidPhoneError):
        normalize_phone_e164(raw)


def test_audit_subject_id_stable_and_keyed() -> None:
    iid = "11111111-1111-1111-1111-111111111111"
    a = audit_subject_id("pepper-A", iid)
    b = audit_subject_id("pepper-A", iid)
    assert a == b  # stable: same patient -> same audit id
    assert a != audit_subject_id("pepper-B", iid)  # keyed by pepper
    assert len(a) == 64  # sha256 hexdigest


def test_audit_subject_id_distinguishes_subjects() -> None:
    p = "pepper"
    assert audit_subject_id(p, "a" * 36) != audit_subject_id(p, "b" * 36)
