"""Probes and metrics for the platform, not for people.

* /healthz  the process is alive (no dependencies checked, so a slow database never gets a healthy
            container killed).
* /readyz   Postgres and Redis answer; the load balancer only sends traffic to ready containers.
* /metrics  Prometheus text format. Keep it off the public internet (only the internal network or
            the platform's scraper should reach it).
"""

from fastapi import APIRouter, Response
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.tenancy.deps import StateDep

router = APIRouter(tags=["health"], include_in_schema=False)


@router.get("/healthz")
async def healthz() -> dict:
    return {"status": "ok"}


@router.get("/readyz")
async def readyz(state: StateDep) -> JSONResponse:
    checks: dict[str, str] = {}
    try:
        await state.db.ping()
        checks["postgres"] = "ok"
    except Exception as exc:  # noqa: BLE001 - reported, not raised
        checks["postgres"] = f"error: {type(exc).__name__}"
    if state.redis is not None:
        try:
            await state.redis.ping()
            checks["redis"] = "ok"
        except Exception as exc:  # noqa: BLE001
            checks["redis"] = f"error: {type(exc).__name__}"
    ready = all(v == "ok" for v in checks.values())
    return JSONResponse({"status": "ready" if ready else "not_ready", "checks": checks},
                        status_code=200 if ready else 503)


@router.get("/metrics")
async def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
