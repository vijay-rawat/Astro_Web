from app.config import Settings
from app.email.sender import Mailer
from app.email.templates import Email


def test_sender_defaults_to_app_name_and_smtp_user():
    s = Settings(app_name="Astro", smtp_user="me@gmail.com", email_from="")
    assert s.sender == "Astro <me@gmail.com>"
    assert Settings(email_from="Team <team@x.io>", smtp_user="me@gmail.com").sender == "Team <team@x.io>"


def test_suppressed_domains_match_case_insensitively():
    s = Settings(email_suppress_domains="kestrel.io, Northwind.Health")
    assert s.email_suppressed("Priya@KESTREL.io")
    assert s.email_suppressed("dana@northwind.health")
    assert not s.email_suppressed("someone@gmail.com")


async def test_suppressed_recipients_never_reach_smtp(monkeypatch):
    calls = []

    async def fake_send(*args, **kwargs):
        calls.append(kwargs)

    monkeypatch.setattr("app.email.sender.aiosmtplib.send", fake_send)
    s = Settings(app_env="development", smtp_host="smtp.example.com", smtp_user="me@gmail.com",
                 email_suppress_domains="kestrel.io")
    mailer = Mailer(s)
    await mailer.send(Email("aarav@kestrel.io", "Hi", "text", "<p>html</p>"))
    await mailer.send(Email("friend@gmail.com", "Hi", "text", "<p>html</p>"))
    assert len(calls) == 1
    assert len(mailer.outbox) == 2  # development keeps a copy of both for the dev mailbox
