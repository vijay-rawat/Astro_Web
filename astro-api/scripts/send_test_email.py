"""Check that email delivery works with the SMTP settings in .env.

    python scripts/send_test_email.py you@example.com

Sends one message through the same mailer the API uses. If it fails, the error says why (wrong
app password, blocked port, and so on).
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402
from app.email.sender import Mailer  # noqa: E402
from app.email.templates import Email, _html  # noqa: E402


async def main(to: str) -> None:
    settings = get_settings()
    if settings.console_email:
        sys.exit("SMTP_HOST is empty in .env, so nothing would be sent. Fill in the SMTP settings first.")
    text = (f"This is a test from {settings.app_name}. Email delivery is working: verification links, "
            "password resets and account notices will arrive like this one.")
    email = Email(to, f"{settings.app_name} email is working", text,
                  _html("Email is working", [text], None, f"Sent by {settings.sender} via {settings.smtp_host}."))
    await Mailer(settings).send(email)
    print(f"Sent to {to} from {settings.sender} via {settings.smtp_host}:{settings.smtp_port}.")


if __name__ == "__main__":
    if len(sys.argv) != 2 or "@" not in sys.argv[1]:
        sys.exit("usage: python scripts/send_test_email.py you@example.com")
    asyncio.run(main(sys.argv[1]))
