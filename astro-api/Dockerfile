# One image for every process: the API, the worker and the migration job.
#   api      (default) uvicorn app.main:app
#   worker   docker run IMAGE arq app.workers.worker.WorkerSettings
#   migrate  docker run IMAGE alembic upgrade head

FROM python:3.12-slim AS build
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /src
RUN python -m venv /venv
COPY pyproject.toml ./
COPY app ./app
RUN /venv/bin/pip install .

FROM python:3.12-slim
ENV PATH=/venv/bin:$PATH PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    APP_ENV=production WEB_CONCURRENCY=2
RUN useradd --create-home --uid 10001 astro
WORKDIR /app
COPY --from=build /venv /venv
COPY --chown=astro:astro app ./app
COPY --chown=astro:astro alembic.ini ./
USER astro
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=2).status == 200 else 1)"
# --proxy-headers: trust X-Forwarded-For from the load balancer for client IPs (rate limits, audit).
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${WEB_CONCURRENCY} --proxy-headers --forwarded-allow-ips='*' --timeout-graceful-shutdown 30 --no-server-header"]
