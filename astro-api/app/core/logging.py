"""Structured logs. JSON in production (one line per event, easy to search), readable in development.

The request ID, and the user and company once known, are bound per request with contextvars, so
every log line from that request carries them without being passed around.
"""

import logging
import sys

import structlog


def setup_logging(level: str, json: bool) -> None:
    processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]
    processors.append(structlog.processors.JSONRenderer() if json else structlog.dev.ConsoleRenderer(colors=False))
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(logging.getLevelName(level.upper())),
        logger_factory=structlog.PrintLoggerFactory(sys.stdout),
        cache_logger_on_first_use=True,
    )
    logging.basicConfig(level=level.upper(), stream=sys.stdout, format="%(levelname)s %(name)s %(message)s")
    # Uvicorn's own access log duplicates ours.
    logging.getLogger("uvicorn.access").disabled = True


log = structlog.get_logger("astro")
