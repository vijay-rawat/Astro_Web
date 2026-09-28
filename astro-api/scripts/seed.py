"""Demo data for development: two companies, so tenant isolation can be seen working.

    python scripts/seed.py

Safe to run again: companies that already exist are skipped. Every account uses the password
below and is already verified. Aarav also has the voice passphrase "space is everything".
Never run this against production.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from app.auth.passwords import hash_secret  # noqa: E402
from app.auth.voice import normalize_phrase  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.db.base import utcnow  # noqa: E402
from app.db.engine import Database  # noqa: E402
from app.db.models import ROLE_NAMES, Company, Role, User, UserRole  # noqa: E402

PASSWORD = "orbit-demo-2026"  # noqa: S105 - demo accounts only, never production
VOICE_PHRASE = "space is everything"

COMPANIES = [
    {
        "name": "Kestrel Labs", "domain": "kestrel.io", "preset": "technology",
        "users": [
            ("Maya Iyer", "maya@kestrel.io", ["admin", "leadership", "member"], False),
            ("Aarav Mehta", "aarav@kestrel.io", ["member"], True),
            ("Priya Nair", "priya@kestrel.io", ["hr", "member"], False),
            ("Rohan Das", "rohan@kestrel.io", ["finance", "lead", "member"], False),
        ],
    },
    {
        "name": "Northwind Health", "domain": "northwind.health", "preset": "healthcare",
        "users": [
            ("Dana Brooks", "dana@northwind.health", ["admin", "member"], False),
            ("Sam Okafor", "sam@northwind.health", ["member"], False),
        ],
    },
]


async def main() -> None:
    settings = get_settings()
    if settings.is_production:
        sys.exit("Refusing to seed a production database.")
    db = Database(settings)
    password_hash = await hash_secret(PASSWORD)
    voice_hash = await hash_secret(normalize_phrase(VOICE_PHRASE))
    now = utcnow()
    try:
        for spec in COMPANIES:
            async with db.system() as s, s.begin():
                if await s.scalar(select(Company.id).where(Company.email_domain == spec["domain"])):
                    print(f"- {spec['name']} already exists")
                    continue
                company = Company(name=spec["name"], email_domain=spec["domain"], domain_preset=spec["preset"],
                                  allow_domain_join=True, retention_days=90)
                s.add(company)
                await s.flush()
                roles = {n: Role(company_id=company.id, name=n) for n in ROLE_NAMES}
                s.add_all(roles.values())
                await s.flush()
                for name, email, role_names, voice in spec["users"]:
                    user = User(company_id=company.id, name=name, email=email, password_hash=password_hash,
                                status="active", email_verified_at=now, voice_failures=0,
                                voice_phrase_hash=voice_hash if voice else None,
                                voice_enabled_at=now if voice else None)
                    s.add(user)
                    await s.flush()
                    s.add_all([UserRole(user_id=user.id, role_id=roles[r].id, company_id=company.id)
                               for r in role_names])
                print(f"+ {spec['name']}: " + ", ".join(u[1] for u in spec["users"]))
        print(f"\nPassword for every demo account: {PASSWORD}")
        print(f'Voice passphrase for aarav@kestrel.io: "{VOICE_PHRASE}"')
    finally:
        await db.dispose()


if __name__ == "__main__":
    asyncio.run(main())
