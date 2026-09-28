"""Random tokens for session cookies and emailed links.

A token is 32 random bytes (256 bits) in URL-safe base64. Only its SHA-256 hash is stored: fast to
look up by index, and useless to anyone who reads the database. SHA-256 (not Argon2) is right
here because the token is already long and random; there is nothing to brute-force.
"""

import hashlib
import secrets


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
