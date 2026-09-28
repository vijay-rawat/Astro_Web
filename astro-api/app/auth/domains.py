"""Email domains shared by many unrelated people. A company never claims one of these, so two
strangers with gmail.com addresses never end up in the same workspace."""

PUBLIC_EMAIL_DOMAINS = frozenset({
    "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com",
    "yahoo.co.in", "yahoo.co.uk", "ymail.com", "icloud.com", "me.com", "mac.com", "aol.com",
    "proton.me", "protonmail.com", "pm.me", "zoho.com", "zohomail.in", "gmx.com", "gmx.de", "mail.com",
    "yandex.com", "yandex.ru", "rediffmail.com", "fastmail.com", "hey.com", "tutanota.com", "qq.com",
    "163.com", "126.com", "naver.com", "web.de", "hotmail.co.uk", "outlook.in", "live.in",
})


def domain_of(email: str) -> str:
    return email.rsplit("@", 1)[1].lower()


def is_public(domain: str) -> bool:
    return domain in PUBLIC_EMAIL_DOMAINS
