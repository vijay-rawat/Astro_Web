"""Typed settings, read once from the environment (and .env in development).

Production refuses to start with settings that would be unsafe there: no Redis (rate limits and
sessions would not be shared between containers), insecure cookies, a non-HTTPS web origin or no
SMTP server.
"""

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"

    # Postgres: three roles, see scripts/db_roles.sql.
    database_url: str = "postgresql+asyncpg://astro_app:astro@localhost:5433/astro"
    auth_database_url: str = "postgresql+asyncpg://astro_auth:astro@localhost:5433/astro"
    migrations_database_url: str = "postgresql+asyncpg://astro_owner:astro@localhost:5433/astro"
    test_database_name: str = "astro_test"
    db_pool_size: int = 10
    db_max_overflow: int = 5
    db_pool_timeout: float = 5.0
    db_behind_pgbouncer: bool = False

    redis_url: str = ""

    web_origin: str = "http://localhost:5173"
    extra_origins: str = ""

    session_cookie_name: str = "astro_session"
    session_ttl_hours: int = 12
    session_remember_days: int = 30
    session_cache_seconds: int = 60
    cookie_secure: bool | None = None

    verify_token_hours: int = 48
    reset_token_minutes: int = 30

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = True
    app_name: str = "Astro"
    email_from: str = ""  # empty = "APP_NAME <SMTP_USER>"
    email_suppress_domains: str = ""  # comma-separated; these recipients only get the dev mailbox copy

    argon2_time_cost: int = 3
    argon2_memory_kib: int = 65536
    argon2_parallelism: int = 4
    hash_concurrency: int = 4

    login_max_failures: int = 5
    login_window_seconds: int = 15 * 60
    voice_max_failures: int = 5

    max_body_bytes: int = 1_000_000
    log_level: str = "INFO"

    @field_validator("web_origin")
    @classmethod
    def _strip_slash(cls, v: str) -> str:
        return v.rstrip("/")

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def is_dev(self) -> bool:
        return self.app_env == "development"

    @property
    def secure_cookies(self) -> bool:
        return self.is_production if self.cookie_secure is None else self.cookie_secure

    @property
    def allowed_origins(self) -> frozenset[str]:
        extra = {o.strip().rstrip("/") for o in self.extra_origins.split(",") if o.strip()}
        return frozenset({self.web_origin, *extra})

    @property
    def console_email(self) -> bool:
        return not self.smtp_host

    @property
    def sender(self) -> str:
        if self.email_from:
            return self.email_from
        return f"{self.app_name} <{self.smtp_user}>" if self.smtp_user else f"{self.app_name} <no-reply@astro.local>"

    def email_suppressed(self, address: str) -> bool:
        domain = address.rsplit("@", 1)[-1].lower()
        return domain in {d.strip().lower() for d in self.email_suppress_domains.split(",") if d.strip()}

    def check_production(self) -> None:
        if not self.is_production:
            return
        problems = []
        if not self.redis_url:
            problems.append("REDIS_URL is required so limits and sessions are shared across containers")
        if not self.secure_cookies:
            problems.append("cookies must be Secure")
        if not self.web_origin.startswith("https://"):
            problems.append("WEB_ORIGIN must be https")
        if not self.smtp_host:
            problems.append("SMTP_HOST is required to send verification and reset emails")
        if problems:
            raise RuntimeError("Unsafe production settings: " + "; ".join(problems))


@lru_cache
def get_settings() -> Settings:
    return Settings()
