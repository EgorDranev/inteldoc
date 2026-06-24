"""Pure capability shaping from an access grant (spec §6.2).

The DB lookup of the active grant lives in the service/deps layer; this module
only turns an *already-resolved* active grant's ``data_scope`` into a Capability.
A missing/inactive grant is a DENY decided by the caller (404/403, never partial
— INV-AC-1). JWT never carries capabilities (INV-AC-4).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class DataScope(StrEnum):
    ANALYSES_PREP = "analyses_prep"
    DOCUMENTS = "documents"
    ANALYSES = "analyses"
    COMPLAINTS = "complaints"
    SUMMARY = "summary"
    ALL = "all"


@dataclass(frozen=True, slots=True)
class Capability:
    read_clinical: bool
    scope: DataScope
    patient_internal_id: str


def capability_from_scope(patient_internal_id: str, scope: DataScope) -> Capability:
    return Capability(read_clinical=True, scope=scope, patient_internal_id=patient_internal_id)
