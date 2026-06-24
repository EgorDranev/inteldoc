"""arq WorkerSettings (spec §8.2). Run: ``uv run arq app.workers.settings.WorkerSettings``.

- ``dispatch_outbox`` — drains the outbox every 10s (post-commit side-effects).
- ``run_access_expiry`` — nightly + a short midday tick (compliance job).
"""

from __future__ import annotations

from arq import cron
from arq.connections import RedisSettings

from app.core.config import get_settings
from app.workers.access_expiry import run_access_expiry
from app.workers.outbox_dispatcher import dispatch_outbox


class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    functions = [dispatch_outbox, run_access_expiry]
    cron_jobs = [
        cron(dispatch_outbox, second=set(range(0, 60, 10)), run_at_startup=True),
        cron(run_access_expiry, hour={3, 13}, minute=0),
    ]
