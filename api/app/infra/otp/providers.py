"""Patient OTP delivery providers (ENG-09) — vendor-neutral seam.

``get_otp_provider()`` resolves ``settings.otp_provider`` to a concrete provider.
Adding a real RU SMS vendor means implementing one ``send()`` here (or a sibling
module) and pointing ``OTP_PROVIDER`` at it — no call-site changes anywhere else.
"""

from __future__ import annotations

import logging
from typing import Protocol, runtime_checkable

from app.core.config import get_settings

logger = logging.getLogger("app.otp")


@runtime_checkable
class OtpProvider(Protocol):
    name: str

    async def send(self, phone_e164: str, code: str) -> None:
        """Deliver ``code`` to ``phone_e164``. Raise on a hard delivery failure."""
        ...


class MockOtpProvider:
    """Dev / demo provider — sends nothing.

    No real code is ever issued on this provider: the fixed dev code is accepted
    at verify time (see ``config.dev_otp_enabled``). This is the only posture that
    keeps the «0000» shortcut alive, so it must never run in a real-PHI deploy.
    """

    name = "mock"

    async def send(self, phone_e164: str, code: str) -> None:
        # `code` intentionally unused: nothing is delivered on the mock provider.
        logger.info("otp.mock.send phone=%s (no SMS sent; fixed dev code in effect)", phone_e164)


class SmsRuProvider:
    """Stub seam for sms.ru (or any RU SMS vendor). Implement before launch.

    Wire the vendor credentials (e.g. ``settings.smsru_api_key``), POST the code to
    the vendor HTTP API, and raise on a non-OK response. Kept as an explicit
    ``NotImplementedError`` so a production deploy that flips ``OTP_PROVIDER``
    fails loud instead of silently never delivering a code.
    """

    name = "smsru"

    async def send(self, phone_e164: str, code: str) -> None:
        raise NotImplementedError(
            "SmsRuProvider.send is a seam — implement the vendor HTTP call "
            "(app/infra/otp/providers.py) and configure credentials before running "
            "with OTP_PROVIDER=smsru."
        )


_PROVIDERS: dict[str, type] = {
    MockOtpProvider.name: MockOtpProvider,
    SmsRuProvider.name: SmsRuProvider,
}


def get_otp_provider() -> OtpProvider:
    provider_id = get_settings().otp_provider_id
    cls = _PROVIDERS.get(provider_id)
    if cls is None:
        raise RuntimeError(
            f"Unknown OTP_PROVIDER={provider_id!r}. Known: {', '.join(sorted(_PROVIDERS))}."
        )
    return cls()  # type: ignore[no-any-return]
