# Astro API

The backend for Astro: Phase 0 of the roadmap. Accounts and companies, email + password sign-up
with email verification, password and **voice passphrase** sign-in, sign-out, forgot/reset
password, sessions, `/api/me`, and tenant isolation enforced twice (in the app and by Postgres
row-level security).

Stack: Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.0 (async) with asyncpg, Alembic,
PostgreSQL 16, Redis (optional locally), Arq, Argon2id.

## Run it locally (Windows, no Docker, no admin rights)

```powershell
cd astro-api
python -m venv .venv
.venv\Scripts\python -m pip install -e ".[dev]"
.venv\Scripts\python scripts\dev_db.py setup     # downloads Postgres 16 into .local/, creates roles, writes .env
.venv\Scripts\alembic upgrade head               # tables, indexes, row-level security
.venv\Scripts\python scripts\seed.py             # two demo companies
.venv\Scripts\uvicorn app.main:app --reload --port 8000
```

Then run the web app (`cd ../astro-web && npm run dev`) and open http://localhost:5173.

| Demo account | Password | Notes |
| --- | --- | --- |
| aarav@kestrel.io | orbit-demo-2026 | Member. Voice passphrase: **"space is everything"** |
| maya@kestrel.io | orbit-demo-2026 | Admin of Kestrel Labs (sees Knowledge, Agents, Setup) |
| dana@northwind.health | orbit-demo-2026 | Admin of a second company, for isolation checks |

Emails (verification, reset) aren't sent in development: open **http://localhost:5173/api/dev/outbox**.

After a restart: `python scripts\dev_db.py start` (and `stop` when done).
Tests: `pytest` (uses the separate `astro_test` database). API docs: http://localhost:8000/docs.

With Docker instead: `docker compose up --build` runs Postgres, PgBouncer, Redis, Mailpit
(http://localhost:8025), the API and a worker, shaped like production.

## Email

Real delivery is on through Gmail (`SMTP_*` in `.env`, with a Google **app password**). Every
account email goes out from `Astro <SMTP_USER>`:

| When | Email |
| --- | --- |
| Someone creates an account | "Confirm your email" with a one-time link (48 hours) |
| Someone signs up with an address that already has an account | "You already have an account", with sign-in and reset links |
| Forgot password | "Reset your password" with a one-time link (30 minutes) |
| Password reset completed | "Your password was changed" (other devices were signed out) |
| Voice sign-in turned on | "Voice sign-in is on", in case it wasn't you |

- `python scripts/send_test_email.py you@example.com` checks the SMTP settings.
- In development a copy of every email also appears at http://localhost:5173/api/dev/outbox.
- The demo accounts' domains (`EMAIL_SUPPRESS_DOMAINS`) never get real email.
- Links in emails point to `WEB_ORIGIN`. While that is `http://localhost:5173`, links only work on
  this computer; set it to the app's public address once it's deployed.
- Gmail allows about 500 recipients a day. For real users, switch the `SMTP_*` values to a sending
  service (Brevo, Resend, Amazon SES) with your own domain; no code changes.

## How a request works

```
browser ──► AstroMiddleware ──► router ──► current_ctx ──► service ──► Postgres
            request ID            │         cookie → SHA-256            astro_app: SET LOCAL
            Origin check          │         → cache (Redis, 60 s)       app.company_id, then RLS
            security headers      │         → sessions table            hides other companies
            metrics + access log  │           as astro_auth
                                  └─► Pydantic validates in and out
```

1. **Middleware** (`core/middleware.py`) tags the request, rejects writes from other sites and
   oversized bodies, and adds security headers.
2. **Routing** hands the request to an endpoint whose inputs Pydantic has already validated.
3. **`current_ctx`** (`tenancy/deps.py`) turns the session cookie into a `RequestCtx` (who, which
   company, which roles). Usually from cache, so most requests never touch Postgres for this.
4. **The service** does the work in one transaction. Data queries run in a *tenant session*: its
   first statement sets `app.company_id`, and Postgres row-level security then returns only that
   company's rows, even if a query forgot its filter.
5. **Slow work** (sending email) is queued and happens after the response.

## Security model, briefly

- **Three database roles.** `astro_owner` owns tables and runs migrations. `astro_app` serves
  requests; RLS confines it to one company per transaction. `astro_auth` only reads what sign-in
  needs before the company is known. None can bypass RLS (a test checks this).
- **Sessions.** A random 256-bit token in an HttpOnly, SameSite=Lax (Secure in production) cookie;
  only its SHA-256 hash is stored. Sign-out, reset and "sign out everywhere" revoke instantly.
- **Passwords.** Argon2id in a bounded thread pool (never blocks the event loop); common passwords
  and ones containing your name or email are refused.
- **Voice passphrase.** A spoken *secret phrase*, not biometrics. Normalized ("Space is
  everything." = "space is everything"), stored as an Argon2id hash, 5 wrong attempts lock it until
  the next password sign-in, and a password reset turns it off.
- **No account enumeration.** Sign-up, resend and forgot-password reply the same for every
  address; failed sign-ins always say "Email or password is incorrect"; unknown emails still cost
  a hash so timing matches.
- **Email verification before first sign-in**, so nobody can join a company's workspace with an
  address they don't own. A company claims its email domain only when its creator verifies.
- **Rate limits** per IP, per account and per action (Redis in production).

## What every file does

### Project root

| File | What it does |
| --- | --- |
| `pyproject.toml` | Dependencies, plus ruff, mypy and pytest settings. `pip install -e ".[dev]"` installs everything. |
| `.env.example` | Every setting with a safe local default. `dev_db.py setup` copies it to `.env` with generated passwords. |
| `alembic.ini` | Points Alembic at `app/db/migrations`. The database URL comes from settings, not this file. |
| `Dockerfile` | One small, non-root image for the API, the worker and migrations. Runs Uvicorn with several processes and graceful shutdown. |
| `docker-compose.yml` | The full local stack: Postgres + pgvector, PgBouncer (transaction pooling), Redis, Mailpit, a migrate job, the API and a worker. |
| `docker/postgres/init.sh` | Runs `db_roles.sql` when the compose Postgres volume is first created. |
| `docker/pgbouncer/` | PgBouncer's user list for local compose, and a note on why transaction pooling is safe here. |
| `loadtests/locustfile.py` | The CP0 load test: users sign in, then call `/api/me` in a loop. |
| `../.github/workflows/astro-api.yml` | CI: lint, create roles, run every test against a real Postgres, then build and push the image on `main`. |

### `scripts/`

| File | What it does |
| --- | --- |
| `db_roles.sql` | Creates `astro_owner`, `astro_app`, `astro_auth` (none superuser, none BYPASSRLS), sets 5-second statement timeouts, creates the database. Run once per server; works on Neon too. |
| `dev_db.py` | Local Postgres with no installer: downloads the official portable binaries, `initdb`, starts on port 5433 fully detached, runs `db_roles.sql` for `astro` and `astro_test`. |
| `seed.py` | Two demo companies with users in different roles. Idempotent; refuses to run in production. |
| `send_test_email.py` | Sends one test email with the SMTP settings in `.env`, to confirm delivery works. |

### `app/` (top level)

| File | What it does |
| --- | --- |
| `main.py` | `create_app()`: builds the FastAPI app, installs error handlers and the middleware, mounts routers. Its **lifespan** creates the shared state once per process (database engines, Redis or in-memory fallbacks, mailer, job queue) and closes it on shutdown after draining queued jobs. |
| `config.py` | Typed settings from environment variables and `.env` (pydantic-settings). `check_production()` refuses to start with unsafe production values: no Redis, insecure cookies, non-HTTPS origin, no SMTP. |
| `state.py` | `AppState`: the per-process shared objects, reached through `get_state(request)`, so nothing uses module-level globals and tests can build their own. |

### `app/core/` (plumbing every feature uses)

| File | What it does |
| --- | --- |
| `middleware.py` | One pure-ASGI middleware (no body buffering, so streams pass straight through): request ID, Origin check on writes (CSRF defence), body-size limit, security headers, Prometheus metrics and one JSON access-log line per request. |
| `errors.py` | `ApiError` and handlers, so every failure has one shape: `{"error": {"code", "message", "fields"}}`. Validation errors are mapped to per-field messages. |
| `cache.py` | A tiny TTL cache: Redis in production, a bounded dict locally. Holds resolved sessions for 60 seconds. |
| `ratelimit.py` | Fixed-window limits (`hit`, `check`, `reset`): one Redis round trip per check, shared by every container; an in-memory version for local use. |
| `metrics.py` | Prometheus counters and histograms, labelled by route template so series stay few. |
| `logging.py` | structlog setup: JSON in production, readable locally; request, user and company IDs attached automatically. |
| `ids.py` | UUIDv7 ids: time-ordered, so inserts stay at the end of indexes as tables grow. |

### `app/db/` (database)

| File | What it does |
| --- | --- |
| `engine.py` | Two async engines and session factories. `tenant(company_id)` sessions connect as `astro_app`; a hook runs `set_config('app.company_id', …, true)` at the start of every transaction, which RLS then enforces. `system()` sessions connect as `astro_auth` for sign-in lookups. Pool settings and PgBouncer compatibility live here. |
| `base.py` | Declarative base with fixed constraint names, UTC timestamps, UUIDv7 id columns. |
| `models/company.py` | `Company`: the tenant. Its email domain is claimed only after the creator verifies. |
| `models/user.py` | `User` (incl. voice passphrase hash, failure count and lock), `Role`, `UserRole`, and the six roles from the roadmap. |
| `models/auth.py` | `AuthSession` (hashed cookie token, expiry, device, method) and `AuthToken` (hashed one-time links). |
| `models/audit.py` | `AuditLog`: who did what, when, from where. |
| `migrations/env.py` | Async Alembic, run as `astro_owner`. |
| `migrations/versions/0001_foundations.py` | Creates the Phase 0 tables and indexes, grants each role only what it needs, and turns on forced RLS with two policies per table (tenant isolation for `astro_app`, sign-in lookups for `astro_auth`). |

### `app/tenancy/` (who is asking)

| File | What it does |
| --- | --- |
| `context.py` | `RequestCtx`: user, company, session and roles for the current request, and its cache encoding. |
| `deps.py` | FastAPI dependencies: `CtxDep` (401 without a valid session), `TenantDb` (a company-scoped session), `AdminCtx` / `require_roles` (403), `ensure_same_company` (403 for another company's ID in a path). |

### `app/auth/` (accounts and sign-in)

| File | What it does |
| --- | --- |
| `router.py` | The endpoints: `/api/auth/signup`, `verify-email`, `resend-verification`, `login`, `voice-login`, `logout`, `logout-all`, `forgot-password`, `reset-password`, `voice-passphrase` (PUT/DELETE), `sessions`, and `/api/me`. Parses input, calls the service, sets or clears the cookie. |
| `service.py` | Every account rule. Hashes before opening a transaction, does each action in one transaction with its audit row, queues email after commit, never reveals whether an account exists, claims company domains safely, locks voice after repeated failures. |
| `schemas.py` | Pydantic request and reply models, camelCase to match the web app's TypeScript. |
| `sessions.py` | Create, resolve (cache, then Postgres), slide and revoke sessions. The hot path for every signed-in request. |
| `passwords.py` | Argon2id hashing in a bounded thread pool, dummy-hash timing for unknown emails, rehash on parameter changes, password rules. |
| `common_passwords.txt` | Passwords refused outright. |
| `voice.py` | Passphrase normalization (case, punctuation, "4" = "four", "&" = "and"), phrase rules, and choosing up to three alternative transcripts per attempt. |
| `tokens.py` | 256-bit random tokens and their SHA-256 hashes. |
| `cookies.py` | Session cookie flags per environment. |
| `domains.py` | Public email domains (gmail.com and so on) that never become a company's domain. |

### `app/api/`, `app/audit/`, `app/email/`, `app/workers/`, `app/dev/`

| File | What it does |
| --- | --- |
| `api/companies.py` | `GET /api/companies/{id}` and `/members` (admins), 403 for any other company. |
| `api/audit.py` | `GET /api/audit` for admins, newest first, cursor-paginated so it stays fast on huge tables. |
| `api/health.py` | `/healthz` (alive), `/readyz` (Postgres and Redis answer), `/metrics` (Prometheus; keep it internal). |
| `audit/log.py` | `record(...)`: adds an audit row to the caller's transaction. |
| `email/templates.py` | The emails (verify, reset, password changed, existing account, voice enabled) in text and escaped HTML. |
| `email/sender.py` | SMTP via aiosmtplib (Gmail or any provider), sending as `APP_NAME <SMTP_USER>`. Skips `EMAIL_SUPPRESS_DOMAINS`; in development also keeps a copy for the dev mailbox. |
| `workers/queue.py` | `JobQueue.send_email`: to Arq when Redis is set (durable, retried), otherwise an in-process task after the response. |
| `workers/worker.py` | The Arq worker (`arq app.workers.worker.WorkerSettings`): sends email with retries and purges expired sessions and tokens nightly. |
| `dev/outbox.py` | The development mailbox page. Only mounted when `APP_ENV=development` and no SMTP is set. |

### `tests/`

| File | What it proves |
| --- | --- |
| `conftest.py` | Migrates `astro_test` from scratch once, truncates before every test, builds a fresh app per test, light Argon2 settings. |
| `test_auth_flows.py` | Sign-up, verification (once only), sign-in, identical errors for wrong password and unknown email, existing-email sign-up, weak passwords, domain join, public domains, sign-out, reset ending other sessions, device list, sign out everywhere, remember-me cookies. |
| `test_voice.py` | Normalization, enrollment rules, voice sign-in with alternatives, identical errors, lock after 5 failures and unlock by password, reset turning voice off. |
| `test_cross_tenant.py` | **CP0**: signed in as company A, every route with a company ID refuses company B; members, audit and sessions stay within the company. |
| `test_rls.py` | Raw SQL as `astro_app`: sees nothing without a company, only its company with one, can't write into another company; no role can bypass RLS. |
| `test_security.py` | **CP0**: every private route returns 401 signed out; security headers; foreign-origin writes refused; cookie flags; failed-login limit; oversized bodies refused. |
| `test_email.py` | Sender name, suppressed domains, and that suppressed addresses never reach SMTP. |

## Scaling notes

- The API holds no state: add containers to serve more people. Set `REDIS_URL` so limits and
  session cache are shared.
- Point `DATABASE_URL` and `AUTH_DATABASE_URL` at PgBouncer (or Neon's pooled URL) with
  `DB_BEHIND_PGBOUNCER=true`; keep `MIGRATIONS_DATABASE_URL` direct. Postgres connections then stay
  flat no matter how many containers run.
- Argon2 concurrency per process is `HASH_CONCURRENCY` (default 4); sign-in bursts queue instead of
  exhausting memory.
- Run migrations once per deploy (`alembic upgrade head` as a job) before new containers start.

## Not in this phase yet

Google and Microsoft sign-in (step P0.6) need OAuth apps registered in your Google Cloud and
Microsoft Entra accounts; the endpoints come once those exist. Everything after Phase 0 follows
`Astro-Backend-Plan.pdf`.
