"""Pure support-ticket routing logic (spec §5.6, CLAUDE.md §7). No framework, no I/O.

The one rule that makes this a domain primitive rather than an if-branch in the
service: integrity/safety reports route to TWO named destinations by default —
IntelDoc (аудит/безопасность) + Эндокор (исправление записи) — while tech-only issues
route to a single IntelDoc destination (INV-SR-1). Every destination carries a
NAMED human label and an SLA expectation, so the patient confirmation can always
state «куда ушло» + «когда ждать» (INV-SR-2) — both are mandatory, neither optional.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.enums import SupportCategory, TicketDestination

# Integrity / safety categories — the dual-destination set (INV-SR-1).
INTEGRITY_CATEGORIES: frozenset[SupportCategory] = frozenset(
    {
        SupportCategory.NOT_MY_ANALYSIS,
        SupportCategory.NOT_MY_CLINIC,
        SupportCategory.SUSPICIOUS_ACTIVITY,
    }
)


@dataclass(frozen=True, slots=True)
class Destination:
    destination: TicketDestination
    label: str  # named human destination, RU
    sla_hours: int
    sla_label: str  # «когда ждать ответа», RU


# Named human destinations + SLA expectations (Q5 — values are pilot defaults).
_DEST_META: dict[TicketDestination, tuple[str, int, str]] = {
    TicketDestination.INTELDOC_SUPPORT: ("поддержка IntelDoc", 24, "в течение 24 часов"),
    TicketDestination.INTELDOC_SECURITY: (
        "служба безопасности IntelDoc",
        4,
        "в течение 4 часов",
    ),
    TicketDestination.ENC_ADMIN: ("администратор Эндокор", 24, "в течение рабочего дня"),
    TicketDestination.ENC_REGISTRY: ("регистратура Эндокор", 48, "в течение 2 рабочих дней"),
}


def _dest(d: TicketDestination) -> Destination:
    label, sla_hours, sla_label = _DEST_META[d]
    return Destination(destination=d, label=label, sla_hours=sla_hours, sla_label=sla_label)


def is_integrity(category: SupportCategory) -> bool:
    return category in INTEGRITY_CATEGORIES


def route_for(category: SupportCategory) -> list[Destination]:
    """Destinations a ticket of ``category`` fans out to — dual for integrity/safety
    (IntelDoc-security + Эндокор record-correction), single (IntelDoc support) otherwise."""
    if category in INTEGRITY_CATEGORIES:
        return [
            _dest(TicketDestination.INTELDOC_SECURITY),
            _dest(TicketDestination.ENC_ADMIN),
        ]
    return [_dest(TicketDestination.INTELDOC_SUPPORT)]


def describe(destination: str) -> Destination | None:
    """Resolve a stored ``destination`` value back to its named label + SLA, for
    rendering routing rows on a ticket read. ``None`` for an unknown value."""
    try:
        return _dest(TicketDestination(destination))
    except (ValueError, KeyError):
        return None
