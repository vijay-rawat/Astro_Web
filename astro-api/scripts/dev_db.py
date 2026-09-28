"""Local PostgreSQL for development, with no installer and no admin rights.

    python scripts/dev_db.py setup   download Postgres 16, create the data folder, roles and databases
    python scripts/dev_db.py start   start the server (port 5433)
    python scripts/dev_db.py stop    stop it
    python scripts/dev_db.py status

Everything lives in astro-api/.local (git-ignored). Passwords are generated once and written to
.env, which the API reads. Use Docker or a hosted Postgres instead whenever you like: only the
URLs in .env change.
"""

import os
import secrets
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

PG_VERSION = "16.10-1"
PORT = 5433
ROOT = Path(__file__).resolve().parent.parent
LOCAL = ROOT / ".local"
PGSQL = LOCAL / "pgsql"
DATA = LOCAL / "pgdata"
LOG = LOCAL / "postgres.log"
SUPERUSER_PW_FILE = LOCAL / "postgres-superuser.txt"
ENV_FILE = ROOT / ".env"
ENV_EXAMPLE = ROOT / ".env.example"
EXE = ".exe" if os.name == "nt" else ""
DATABASES = ("astro", "astro_test")


def bin_(name: str) -> str:
    return str(PGSQL / "bin" / f"{name}{EXE}")


def run(args: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(args, check=True, text=True, **kw)


def download() -> None:
    if (PGSQL / "bin" / f"postgres{EXE}").exists():
        return
    if os.name != "nt":
        sys.exit("On macOS or Linux, install Postgres 16 with your package manager or use docker compose.")
    LOCAL.mkdir(exist_ok=True)
    url = f"https://get.enterprisedb.com/postgresql/postgresql-{PG_VERSION}-windows-x64-binaries.zip"
    archive = LOCAL / "postgresql.zip"
    print(f"Downloading PostgreSQL {PG_VERSION} ...")
    urllib.request.urlretrieve(url, archive)
    print("Extracting server binaries ...")
    keep = ("pgsql/bin/", "pgsql/lib/", "pgsql/share/")
    with zipfile.ZipFile(archive) as z:
        for member in z.namelist():
            if member.startswith(keep):
                z.extract(member, LOCAL)
    archive.unlink()


def env_values() -> dict[str, str]:
    values: dict[str, str] = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                values[k.strip()] = v.strip()
    return values


def write_env() -> dict[str, str]:
    """Create .env from .env.example with generated passwords, once."""
    if not ENV_FILE.exists():
        text = ENV_EXAMPLE.read_text(encoding="utf-8")
        for placeholder in ("owner-password", "app-password", "auth-password"):
            text = text.replace(f"<{placeholder}>", secrets.token_urlsafe(18))
        ENV_FILE.write_text(text, encoding="utf-8")
        print("Wrote .env with generated database passwords.")
    return env_values()


def password_of(url: str) -> str:
    return url.split("://", 1)[1].split("@", 1)[0].split(":", 1)[1]


def is_running() -> bool:
    if not DATA.exists():
        return False
    return subprocess.run([bin_("pg_ctl"), "status", "-D", str(DATA)], capture_output=True).returncode == 0


def start() -> None:
    if is_running():
        print(f"Postgres is already running on port {PORT}.")
        return
    # Detached, with no inherited handles: the server outlives this script and never holds the
    # caller's terminal or pipes open.
    flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    run([bin_("pg_ctl"), "start", "-D", str(DATA), "-l", str(LOG), "-w", "-o", f"-p {PORT}"],
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=flags)
    print(f"Postgres is running on localhost:{PORT}.")


def stop() -> None:
    if is_running():
        run([bin_("pg_ctl"), "stop", "-D", str(DATA), "-m", "fast", "-w"], stdout=subprocess.DEVNULL)
    print("Postgres stopped.")


def setup() -> None:
    download()
    env = write_env()
    if not DATA.exists():
        su_pw = secrets.token_urlsafe(18)
        SUPERUSER_PW_FILE.write_text(su_pw, encoding="utf-8")
        pwfile = LOCAL / "pw.tmp"
        pwfile.write_text(su_pw, encoding="utf-8")
        try:
            run([bin_("initdb"), "-D", str(DATA), "-U", "postgres", "--auth=scram-sha-256",
                 f"--pwfile={pwfile}", "-E", "UTF8", "--no-locale"], stdout=subprocess.DEVNULL)
        finally:
            pwfile.unlink(missing_ok=True)
        with open(DATA / "postgresql.conf", "a", encoding="utf-8") as conf:
            conf.write(f"\nport = {PORT}\nlisten_addresses = 'localhost'\nmax_connections = 200\n")
    start()
    psql_env = {**os.environ, "PGPASSWORD": SUPERUSER_PW_FILE.read_text(encoding="utf-8").strip()}
    for db in DATABASES:
        run([bin_("psql"), "-h", "localhost", "-p", str(PORT), "-U", "postgres", "-d", "postgres", "-q",
             "-v", "ON_ERROR_STOP=1",
             "-v", f"owner_pw={password_of(env['MIGRATIONS_DATABASE_URL'])}",
             "-v", f"app_pw={password_of(env['DATABASE_URL'])}",
             "-v", f"auth_pw={password_of(env['AUTH_DATABASE_URL'])}",
             "-v", f"db={db}", "-f", str(ROOT / "scripts" / "db_roles.sql")], env=psql_env)
    print("Roles astro_owner, astro_app and astro_auth and databases astro, astro_test are ready.")
    print("Next: alembic upgrade head, then python scripts/seed.py")


def status() -> None:
    print("running" if is_running() else "stopped")


if __name__ == "__main__":
    commands = {"setup": setup, "start": start, "stop": stop, "status": status}
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd not in commands:
        sys.exit(f"usage: python scripts/dev_db.py [{'|'.join(commands)}]")
    if cmd != "setup" and not shutil.which(bin_("pg_ctl")) and not Path(bin_("pg_ctl")).exists():
        sys.exit("Run `python scripts/dev_db.py setup` first.")
    commands[cmd]()
