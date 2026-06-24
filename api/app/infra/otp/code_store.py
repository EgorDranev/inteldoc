"""Redis-backed one-time code store for patient OTP login (ENG-09).

Only used when a real SMS provider is active; the mock provider path accepts the
fixed dev code without ever issuing or storing one. Defenses:

- A code is stored hashed (never in clear), expires after ``otp_ttl_seconds``, and
  is burned after one correct verify or ``otp_max_attempts`` wrong tries.
- A per-phone resend cooldown throttles issuance.
- A PERSISTENT per-phone failure budget (``otp_max_failures`` over
  ``otp_failure_window_seconds``) that survives code rotation — without it,
  re-issuing a fresh code would reset the per-code attempt counter and let an
  attacker brute-force the small numeric space indefinitely. Once tripped, both
  verify and re-issue are locked for the window; a correct verify clears it.
"""

from __future__ import annotations

import hashlib
import secrets

from app.core.config import get_settings
from app.infra.redis import get_redis


class OtpThrottledError(Exception):
    """Raised when a new code is requested during the resend cooldown, or while the
    phone is locked out after too many failed verifications."""


def _key(scope: str, phone_e164: str) -> str:
    return f"otp:{scope}:{phone_e164}"


def _cooldown_key(scope: str, phone_e164: str) -> str:
    return f"otp:{scope}:cooldown:{phone_e164}"


def _fails_key(scope: str, phone_e164: str) -> str:
    return f"otp:{scope}:fails:{phone_e164}"


def _hash(code: str) -> str:
    # Pepper with a dedicated OTP secret so a Redis dump alone can't be brute-forced
    # against the tiny numeric code space.
    pepper = get_settings().otp_pepper
    return hashlib.sha256(f"{pepper}:{code}".encode()).hexdigest()


def _random_code(length: int) -> str:
    # Uniform over [0, 10**length); zero-padded so leading zeros are preserved.
    return str(secrets.randbelow(10**length)).zfill(length)


async def _is_locked(scope: str, phone_e164: str) -> bool:
    raw = await get_redis().get(_fails_key(scope, phone_e164))  # type: ignore[misc]
    return raw is not None and int(raw) >= get_settings().otp_max_failures


async def _record_failure(scope: str, phone_e164: str) -> None:
    redis = get_redis()
    key = _fails_key(scope, phone_e164)
    count = await redis.incr(key)  # type: ignore[misc]
    if int(count) == 1:  # first failure in this window → start the TTL clock
        await redis.expire(key, get_settings().otp_failure_window_seconds)


async def issue(phone_e164: str, *, scope: str = "login") -> str:
    """Generate, store (hashed, TTL), and return a fresh code. Raises
    ``OtpThrottledError`` while the phone is locked out or within the resend
    cooldown window."""
    settings = get_settings()
    redis = get_redis()
    if await _is_locked(scope, phone_e164):
        raise OtpThrottledError("phone temporarily locked after too many failed codes")
    placed = await redis.set(
        _cooldown_key(scope, phone_e164),
        "1",
        ex=settings.otp_resend_cooldown_seconds,
        nx=True,
    )
    if not placed:
        raise OtpThrottledError("resend cooldown active")

    code = _random_code(settings.otp_code_length)
    key = _key(scope, phone_e164)
    async with redis.pipeline(transaction=True) as pipe:
        pipe.delete(key)
        pipe.hset(key, mapping={"hash": _hash(code), "attempts": "0"})
        pipe.expire(key, settings.otp_ttl_seconds)
        await pipe.execute()
    return code


async def check(phone_e164: str, code: str, *, scope: str = "login") -> bool:
    """True iff ``code`` matches the outstanding code for this phone+scope.

    Wrong tries increment both a per-code attempt counter (burns the code at the
    cap) and a persistent per-phone failure counter (locks the phone at its cap). A
    correct match consumes the code AND clears the failure lockout."""
    settings = get_settings()
    redis = get_redis()
    if await _is_locked(scope, phone_e164):
        return False
    key = _key(scope, phone_e164)
    data = await redis.hgetall(key)  # type: ignore[misc]  # redis-py sync/async overload
    if not data:
        return False  # expired or never issued
    if int(data.get("attempts", 0)) >= settings.otp_max_attempts:
        await redis.delete(key)
        return False
    if data.get("hash") == _hash(code):
        await redis.delete(key)
        await redis.delete(_fails_key(scope, phone_e164))  # success clears the lockout
        return True
    await redis.hincrby(key, "attempts", 1)  # type: ignore[misc]  # redis-py overload
    await _record_failure(scope, phone_e164)
    return False
