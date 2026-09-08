"""Standard-library PBKDF2-HMAC-SHA256 password hashing.

No external auth libraries (bcrypt/passlib/argon2) required. Uses Python's
built-in ``hashlib``, ``hmac``, and ``secrets``.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets

DEFAULT_ITERATIONS = 600_000
ALGORITHM = "pbkdf2_sha256"


def hash_password(password: str, *, iterations: int = DEFAULT_ITERATIONS) -> str:
    """Hash a password using PBKDF2-HMAC-SHA256 with a unique 16-byte salt.

    Returns a string in the format: ``pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>``.
    """
    salt = secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        iterations=iterations,
    )
    return f"{ALGORITHM}${iterations}${salt.hex()}${derived.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Verify a plain-text password against a stored PBKDF2 hash using constant-time comparison."""
    if not stored or not password:
        return False

    parts = stored.split("$")
    if len(parts) != 4:
        return False

    algorithm, iter_str, salt_hex, expected_hash_hex = parts
    if algorithm != ALGORITHM:
        return False

    try:
        iterations = int(iter_str)
        salt = bytes.fromhex(salt_hex)
        expected_hash = bytes.fromhex(expected_hash_hex)
    except (ValueError, TypeError):
        return False

    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        iterations=iterations,
    )
    return hmac.compare_digest(derived, expected_hash)


def generate_temporary_password(nbytes: int = 9) -> str:
    """Generate a high-entropy, human-shareable temporary password."""
    return secrets.token_urlsafe(nbytes)
