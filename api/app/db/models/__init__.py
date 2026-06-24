"""Import all ORM models so ``Base.metadata`` is fully populated.

Migrations and tests import from here to get the complete table set.
"""

from __future__ import annotations

from app.db.models import access, admin_agg, audit, clinical, core, identity, plan, support

__all__ = [
    "access",
    "admin_agg",
    "audit",
    "clinical",
    "core",
    "identity",
    "plan",
    "support",
]
