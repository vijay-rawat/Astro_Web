"""Sends email over SMTP (any provider: Gmail with an app password, Brevo, Resend, SES).

* No SMTP_HOST: nothing leaves the machine; emails are printed and kept for the dev mailbox.
* In development, a copy of every email is also kept for the dev mailbox at /api/dev/outbox, so
  links can be clicked even while real delivery is on.
* Recipients on EMAIL_SUPPRESS_DOMAINS (the demo accounts' domains) never get real email.
"""

from collections import deque
from datetime import UTC, datetime
from email.message import EmailMessage
from email.utils import make_msgid

import aiosmtplib

from app.config import Settings
from app.core.logging import log
from app.email.templates import Email


class Mailer:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.outbox: deque[tuple[datetime, Email]] = deque(maxlen=50)

    async def send(self, email: Email) -> None:
        s = self.settings
        if s.is_dev or s.console_email:
            self.outbox.appendleft((datetime.now(UTC), email))
        if s.console_email:
            log.info("email.console", to=email.to, subject=email.subject, body=email.text)
            return
        if s.email_suppressed(email.to):
            log.info("email.suppressed", to=email.to, subject=email.subject, reason="EMAIL_SUPPRESS_DOMAINS")
            return

        msg = EmailMessage()
        msg["From"] = s.sender
        msg["To"] = email.to
        msg["Subject"] = email.subject
        msg["Message-ID"] = make_msgid(domain=s.sender.rsplit("@", 1)[-1].strip(">") or None)
        msg.set_content(email.text)
        msg.add_alternative(email.html, subtype="html")
        await aiosmtplib.send(
            msg,
            hostname=s.smtp_host,
            port=s.smtp_port,
            username=s.smtp_user or None,
            password=s.smtp_password or None,
            start_tls=s.smtp_starttls,
            timeout=20,
        )
        log.info("email.sent", to=email.to, subject=email.subject)
