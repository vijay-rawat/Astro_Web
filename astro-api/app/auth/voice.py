"""Voice passphrase sign-in: a spoken secret phrase, checked like a password.

This is a *passphrase*, not voice biometrics: it proves someone knows the phrase, not that it's
you speaking. So it is treated as a password in every way that matters: stored only as an Argon2id
hash, rate-limited per account and per IP, locked after VOICE_MAX_FAILURES wrong attempts until the
next password sign-in, and never shown on screen while spoken.

Speech recognition returns text that varies in small ways ("Space is everything." vs "space is
everything", "4" vs "four"), so both the enrolled phrase and every spoken attempt go through the
same normalization before hashing and comparing. The browser can send up to three alternative
transcripts per attempt; they count as one attempt.
"""

import re
import unicodedata

MIN_WORDS = 3
MIN_CHARS = 12
MAX_CHARS = 120
MAX_ALTERNATIVES = 3

_NUMBERS = {
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "six": "6",
    "seven": "7", "eight": "8", "nine": "9", "ten": "10", "eleven": "11", "twelve": "12",
}
_SPOKEN = {"&": " and ", "@": " at ", "+": " plus "}
_WEAK = frozenset({
    "open sesame please", "hello astro hello", "my voice is my password", "this is my password",
    "let me in now", "one two three four", "hey astro sign in",
})


def normalize_phrase(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).lower()
    for symbol, word in _SPOKEN.items():
        text = text.replace(symbol, word)
    # Drop punctuation and symbols; keep letters, digits and spaces.
    text = "".join(ch if (ch.isalnum() or ch.isspace()) else " " for ch in text)
    words = [_NUMBERS.get(w, w) for w in text.split()]
    return re.sub(r"\s+", " ", " ".join(words)).strip()


def phrase_problem(normalized: str, email: str) -> str | None:
    if len(normalized.split()) < MIN_WORDS:
        return f"Use a phrase of at least {MIN_WORDS} words."
    if len(normalized) < MIN_CHARS:
        return f"Use a phrase of at least {MIN_CHARS} letters."
    if len(normalized) > MAX_CHARS:
        return "That phrase is too long."
    if normalized in _WEAK:
        return "That phrase is too easy to guess. Pick something personal."
    local = email.split("@", 1)[0].lower()
    if len(local) >= 4 and local in normalized.replace(" ", ""):
        return "Don't use your email address in your phrase."
    return None


def candidates(transcripts: list[str]) -> list[str]:
    """Distinct, non-empty normalized alternatives, at most MAX_ALTERNATIVES."""
    seen: list[str] = []
    for t in transcripts[:MAX_ALTERNATIVES]:
        n = normalize_phrase(t)
        if n and n not in seen and len(n) <= MAX_CHARS:
            seen.append(n)
    return seen
