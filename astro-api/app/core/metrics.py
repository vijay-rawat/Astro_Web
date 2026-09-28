"""Prometheus metrics. Route templates (/api/companies/{company_id}) are used as labels, never raw
paths, so the number of series stays small."""

from prometheus_client import Counter, Histogram

REQUESTS = Counter("astro_http_requests_total", "HTTP requests", ["method", "route", "status"])
LATENCY = Histogram(
    "astro_http_request_seconds",
    "HTTP request latency",
    ["method", "route"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5),
)
AUTH_EVENTS = Counter("astro_auth_events_total", "Sign-in and account events", ["event"])
