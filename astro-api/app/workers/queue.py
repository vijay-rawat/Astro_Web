"""Background jobs, so slow work (sending email) never delays a response.

With Redis configured, jobs go to Arq and run in the worker process (`arq app.workers.worker.
WorkerSettings`), with retries. Without Redis (local development) they run as tasks in the API
process right after the response; the result is the same, only less durable.
"""

import asyncio
from dataclasses import asdict

from arq.connections import ArqRedis

from app.core.logging import log
from app.email.sender import Mailer
from app.email.templates import Email


class JobQueue:
    def __init__(self, mailer: Mailer, arq: ArqRedis | None = None):
        self._mailer = mailer
        self._arq = arq
        self._tasks: set[asyncio.Task] = set()

    async def send_email(self, email: Email) -> None:
        if self._arq is not None:
            await self._arq.enqueue_job("send_email", asdict(email))
            return
        task = asyncio.create_task(self._send_inline(email))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _send_inline(self, email: Email) -> None:
        try:
            await self._mailer.send(email)
        except Exception:  # noqa: BLE001 - logged; a failed email must not crash the process
            log.exception("email.failed", to=email.to, subject=email.subject)

    async def drain(self) -> None:
        """Wait for in-process jobs (used at shutdown and in tests)."""
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
