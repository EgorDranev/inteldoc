"""structlog JSON logging — no PII/medical in logs (INV-RES-2).

Logs carry opaque ids and a trace_id only. Never log ФИО/phone/СНИЛС/ОМС,
complaint text, analysis values, raw OCR, or LLM prompt/response.
"""

from __future__ import annotations

import logging
import re
import sys
from collections.abc import MutableMapping
from typing import Any

import structlog

# Defensive PII scrubbing (INV-RES-2). The codebase logs opaque ids by discipline;
# this is the backstop that redacts a sensitive value if one ever slips into an event.
_SENSITIVE_KEYS = frozenset(
    {
        "full_name", "name", "phone", "phone_e164", "dob", "birth_date",
        "snils", "oms", "email", "password", "token", "access_token",
        "refresh_token", "authorization", "raw_value", "body", "text",
    }
)
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
# Require a leading '+' (E.164) so the heuristic can't fire on the bare digit runs
# inside opaque ids — a UUID like 550e8400-…-446655440000 or an object key has no '+',
# so stringified ids (logged verbatim for debuggability) are never corrupted.
_PHONE_RE = re.compile(r"\+\d[\d\-\s()]{7,}\d")
_REDACTED = "[redacted]"


def _scrub_text(value: str) -> str:
    value = _EMAIL_RE.sub("[email]", value)
    return _PHONE_RE.sub("[phone]", value)


def _scrub_value(value: Any) -> Any:
    """Recurse into the value: redact sensitive KEYS inside nested mappings, scrub
    strings, walk lists/tuples — so PII embedded in a structured log field (an outbox
    payload, a list of values) can't slip past the top level."""
    if isinstance(value, MutableMapping):
        return {
            k: (_REDACTED if k.lower() in _SENSITIVE_KEYS else _scrub_value(v))
            for k, v in value.items()
        }
    if isinstance(value, list | tuple):
        return [_scrub_value(v) for v in value]
    if isinstance(value, str):
        return _scrub_text(value)
    return value


def _scrub_pii(
    _logger: object, _method: str, event_dict: MutableMapping[str, Any]
) -> MutableMapping[str, Any]:
    for key in list(event_dict.keys()):
        if key.lower() in _SENSITIVE_KEYS:
            event_dict[key] = _REDACTED
        else:
            event_dict[key] = _scrub_value(event_dict[key])
    return event_dict


def configure_logging(level: str = "INFO") -> None:
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            _scrub_pii,  # last before render — redact any PII that slipped in
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelName(level)
        ),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    logger: structlog.stdlib.BoundLogger = structlog.get_logger(name)
    return logger
