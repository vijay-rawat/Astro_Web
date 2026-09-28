"""Email content. Plain text for every client plus a small HTML version in Astro's colours.
Everything interpolated into HTML is escaped."""

from dataclasses import dataclass
from html import escape


@dataclass(frozen=True, slots=True)
class Email:
    to: str
    subject: str
    text: str
    html: str


def _html(title: str, paragraphs: list[str], button: tuple[str, str] | None = None, footer: str = "") -> str:
    body = "".join(f'<p style="margin:0 0 14px;line-height:1.55">{p}</p>' for p in paragraphs)
    cta = ""
    if button:
        label, href = button
        cta = (f'<p style="margin:22px 0"><a href="{escape(href)}" style="background:#4046C8;color:#fff;'
               f'padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">{escape(label)}</a></p>'
               f'<p style="margin:0 0 14px;font-size:12px;color:#5E6882">Or paste this link into your browser:<br>'
               f'<span style="word-break:break-all">{escape(href)}</span></p>')
    return (
        '<div style="background:#EEF1F6;padding:32px 12px;font-family:Segoe UI,Helvetica,Arial,sans-serif">'
        '<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:28px 28px 20px;'
        'color:#1C2744;border:1px solid #D5DBE6">'
        '<div style="font:700 13px monospace;letter-spacing:.14em;color:#4046C8;margin-bottom:14px">ASTRO</div>'
        f'<h1 style="font-size:20px;margin:0 0 14px;color:#14203A">{escape(title)}</h1>{body}{cta}'
        f'<p style="margin:18px 0 0;font-size:12px;color:#5E6882">{footer}</p></div></div>'
    )


def verify_email(to: str, name: str, link: str, company: str, joining: bool, hours: int) -> Email:
    where = f"You'll join {company} on Astro." if joining else f"This creates the {company} workspace."
    text = (f"Hi {name},\n\nConfirm your email to finish creating your Astro account. {where}\n\n{link}\n\n"
            f"The link works once and expires in {hours} hours. If you didn't sign up, ignore this email.")
    html = _html("Confirm your email", [f"Hi {escape(name)},",
                                        f"Confirm your email to finish creating your Astro account. {escape(where)}"],
                 ("Confirm email", link), f"The link works once and expires in {hours} hours. "
                                          "If you didn't sign up, you can ignore this email.")
    return Email(to, "Confirm your email for Astro", text, html)


def reset_password(to: str, name: str, link: str, minutes: int) -> Email:
    text = (f"Hi {name},\n\nSomeone asked to reset the password for your Astro account. If it was you, "
            f"open this link:\n\n{link}\n\nIt works once and expires in {minutes} minutes. "
            "If it wasn't you, ignore this email; your password hasn't changed.")
    html = _html("Reset your password", [f"Hi {escape(name)},",
                                         "Someone asked to reset the password for your Astro account. "
                                         "If it was you, choose a new one below."],
                 ("Choose a new password", link), f"The link works once and expires in {minutes} minutes. "
                                                  "If it wasn't you, ignore this email; nothing has changed.")
    return Email(to, "Reset your Astro password", text, html)


def password_changed(to: str, name: str, login_link: str) -> Email:
    text = (f"Hi {name},\n\nYour Astro password was just changed, and every other device was signed out. "
            f"If this wasn't you, reset your password now: {login_link}")
    html = _html("Your password was changed", [f"Hi {escape(name)},",
                                                "Your Astro password was just changed, and every other device "
                                                "was signed out."],
                 ("Open Astro", login_link), "If this wasn't you, reset your password right away.")
    return Email(to, "Your Astro password was changed", text, html)


def existing_account(to: str, name: str, login_link: str, reset_link: str) -> Email:
    text = (f"Hi {name},\n\nSomeone tried to create an Astro account with this email, but you already have one. "
            f"Sign in: {login_link}\nForgot your password? {reset_link}\n\nIf it wasn't you, ignore this email.")
    html = _html("You already have an account", [f"Hi {escape(name)},",
                                                  "Someone tried to create an Astro account with this email, "
                                                  "but you already have one."],
                 ("Sign in", login_link), f'Forgot your password? <a href="{escape(reset_link)}">Reset it</a>. '
                                          "If it wasn't you, ignore this email.")
    return Email(to, "You already have an Astro account", text, html)


def voice_enabled(to: str, name: str) -> Email:
    text = (f"Hi {name},\n\nVoice sign-in was just turned on for your Astro account. If this wasn't you, "
            "sign in with your password and change it; that also turns voice sign-in off.")
    html = _html("Voice sign-in is on", [f"Hi {escape(name)},",
                                          "Voice sign-in was just turned on for your Astro account."],
                 None, "If this wasn't you, sign in with your password and change it; that also turns voice "
                       "sign-in off.")
    return Email(to, "Voice sign-in is on for your Astro account", text, html)
