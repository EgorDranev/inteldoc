"""Patient OTP unit tests (ENG-09) — the dev↔prod gate, the provider seam, and
the Redis code-store logic.

Infra-free: a tiny in-memory fake stands in for Redis, and the provider id is the
only thing toggled. The load-bearing security claim — a real provider rejects the
fixed «0000» code — is asserted directly here; the existing integration suite
proves the mock posture still accepts «0000».
"""

from __future__ import annotations

import pytest
from app.core.config import get_settings
from app.infra import otp
from app.infra.otp import code_store
from app.infra.otp.providers import (
    MockOtpProvider,
    SmsRuProvider,
    get_otp_provider,
)

# ─── Fake Redis (only the calls code_store makes) ────────────────────────────


class _Pipe:
    def __init__(self, redis: FakeRedis) -> None:
        self._redis = redis
        self._ops: list[tuple] = []

    async def __aenter__(self) -> _Pipe:
        return self

    async def __aexit__(self, *exc: object) -> bool:
        return False

    def delete(self, key: str) -> None:
        self._ops.append(("delete", key))

    def hset(self, key: str, mapping: dict) -> None:
        self._ops.append(("hset", key, mapping))

    def expire(self, key: str, ttl: int) -> None:
        self._ops.append(("expire", key, ttl))  # TTL not modelled in the fake

    async def execute(self) -> None:
        for op in self._ops:
            if op[0] == "delete":
                self._redis.store.pop(op[1], None)
            elif op[0] == "hset":
                self._redis.store[op[1]] = {k: str(v) for k, v in op[2].items()}
        self._ops.clear()


class FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, object] = {}

    async def set(self, key: str, value: str, ex: int | None = None, nx: bool = False):
        if nx and key in self.store:
            return None
        self.store[key] = value
        return True

    def pipeline(self, transaction: bool = True) -> _Pipe:
        return _Pipe(self)

    async def hgetall(self, key: str) -> dict:
        v = self.store.get(key)
        return dict(v) if isinstance(v, dict) else {}

    async def hincrby(self, key: str, field: str, amount: int) -> int:
        h = self.store.setdefault(key, {})
        assert isinstance(h, dict)
        cur = int(h.get(field, 0)) + amount
        h[field] = str(cur)
        return cur

    async def get(self, key: str) -> str | None:
        v = self.store.get(key)
        return v if isinstance(v, str) else None

    async def incr(self, key: str) -> int:
        cur = int(self.store.get(key, 0)) + 1  # type: ignore[arg-type]
        self.store[key] = str(cur)
        return cur

    async def expire(self, key: str, ttl: int) -> bool:
        return True  # TTL not modelled in the fake

    async def delete(self, key: str) -> None:
        self.store.pop(key, None)


@pytest.fixture
def fake_redis(monkeypatch: pytest.MonkeyPatch) -> FakeRedis:
    redis = FakeRedis()
    monkeypatch.setattr(code_store, "get_redis", lambda: redis)
    return redis


@pytest.fixture
def mock_provider(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("OTP_PROVIDER", "mock")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def real_provider(monkeypatch: pytest.MonkeyPatch):
    # Pin a deterministic code so assertions never collide with a random «0000».
    monkeypatch.setenv("OTP_PROVIDER", "smsru")
    monkeypatch.setattr(code_store, "_random_code", lambda length: "1234")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


PHONE = "+79991234567"


# ─── The dev↔prod gate ───────────────────────────────────────────────────────


def test_dev_otp_enabled_only_on_mock_provider(
    mock_provider: None,
) -> None:
    assert get_settings().dev_otp_enabled is True


def test_dev_otp_disabled_on_real_provider(real_provider: None) -> None:
    assert get_settings().dev_otp_enabled is False


async def test_mock_provider_accepts_fixed_code(mock_provider: None) -> None:
    # Demo posture: «0000» works without any code ever being issued/stored.
    assert await otp.verify_patient_otp(PHONE, "0000") is True
    assert await otp.verify_patient_otp(PHONE, "9999") is False


async def test_real_provider_rejects_fixed_code(
    real_provider: None, fake_redis: FakeRedis
) -> None:
    # The core ENG-09 claim: under a real provider, «0000» is no longer a key.
    code = await code_store.issue(PHONE)
    assert code == "1234"
    assert await otp.verify_patient_otp(PHONE, "0000") is False


# ─── Code store ──────────────────────────────────────────────────────────────


async def test_issued_code_verifies_once_then_is_consumed(
    real_provider: None, fake_redis: FakeRedis
) -> None:
    code = await code_store.issue(PHONE)
    assert await otp.verify_patient_otp(PHONE, code) is True
    # One-time use: the same code does not verify again.
    assert await otp.verify_patient_otp(PHONE, code) is False


async def test_code_burned_after_max_attempts(
    real_provider: None, fake_redis: FakeRedis
) -> None:
    code = await code_store.issue(PHONE)
    max_attempts = get_settings().otp_max_attempts
    for _ in range(max_attempts):
        assert await code_store.check(PHONE, "0000") is False
    # Cap reached → the correct code no longer works.
    assert await code_store.check(PHONE, code) is False


async def test_resend_cooldown_throttles_reissue(
    real_provider: None, fake_redis: FakeRedis
) -> None:
    await code_store.issue(PHONE)
    with pytest.raises(code_store.OtpThrottledError):
        await code_store.issue(PHONE)


async def test_lockout_persists_across_code_rotation(
    real_provider: None, fake_redis: FakeRedis
) -> None:
    # The core brute-force defense: re-issuing a fresh code resets the per-code
    # attempt counter, but the persistent per-phone failure budget must NOT reset —
    # otherwise an attacker brute-forces forever by rotating codes.
    settings = get_settings()
    cooldown = f"otp:login:cooldown:{PHONE}"
    fails = 0
    while fails < settings.otp_max_failures:
        fake_redis.store.pop(cooldown, None)  # simulate cooldown expiry
        await code_store.issue(PHONE)
        for _ in range(settings.otp_max_attempts):
            assert await code_store.check(PHONE, "0000") is False  # real code is 1234
            fails += 1
            if fails >= settings.otp_max_failures:
                break
    # Locked: a fresh issue is refused even after the cooldown clears…
    fake_redis.store.pop(cooldown, None)
    with pytest.raises(code_store.OtpThrottledError):
        await code_store.issue(PHONE)
    # …and verify is locked too (returns False without consulting any code).
    assert await code_store.check(PHONE, "1234") is False


async def test_unknown_phone_with_no_outstanding_code_fails(
    real_provider: None, fake_redis: FakeRedis
) -> None:
    assert await code_store.check("+79990000000", "1234") is False


# ─── Provider seam ───────────────────────────────────────────────────────────


def test_factory_resolves_mock(mock_provider: None) -> None:
    assert isinstance(get_otp_provider(), MockOtpProvider)


def test_factory_resolves_real(real_provider: None) -> None:
    assert isinstance(get_otp_provider(), SmsRuProvider)


def test_factory_rejects_unknown_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OTP_PROVIDER", "nope")
    get_settings.cache_clear()
    try:
        with pytest.raises(RuntimeError):
            get_otp_provider()
    finally:
        get_settings.cache_clear()


async def test_real_provider_send_is_an_unimplemented_seam() -> None:
    # The seam fails loud, not silent — a prod deploy can't quietly never deliver.
    with pytest.raises(NotImplementedError):
        await SmsRuProvider().send(PHONE, "1234")


# ─── Prod fail-closed boot gate ──────────────────────────────────────────────


async def test_prod_on_mock_refuses_to_boot(monkeypatch: pytest.MonkeyPatch) -> None:
    # APP_ENV=prod + mock provider would keep the «0000» backdoor → must fail closed.
    from app.main import lifespan
    from fastapi import FastAPI

    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("OTP_PROVIDER", "mock")
    monkeypatch.setenv("ALLOW_DEV_OTP", "false")
    get_settings.cache_clear()
    try:
        with pytest.raises(RuntimeError):
            async with lifespan(FastAPI()):
                pass
    finally:
        get_settings.cache_clear()


async def test_prod_on_mock_with_explicit_override_boots(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # The auditable demo escape hatch: ALLOW_DEV_OTP=1 lets prod keep «0000» on purpose.
    from app.main import lifespan
    from fastapi import FastAPI

    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("OTP_PROVIDER", "mock")
    monkeypatch.setenv("ALLOW_DEV_OTP", "1")
    get_settings.cache_clear()
    try:
        async with lifespan(FastAPI()):
            pass  # boots without raising
    finally:
        get_settings.cache_clear()
