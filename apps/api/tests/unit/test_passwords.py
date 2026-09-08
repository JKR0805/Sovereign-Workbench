"""Unit tests for PBKDF2 password hashing and verification."""

from vajra.auth.passwords import (
    DEFAULT_ITERATIONS,
    generate_temporary_password,
    hash_password,
    verify_password,
)


def test_hash_password_format():
    hashed = hash_password("secret123", iterations=10_000)
    parts = hashed.split("$")
    assert len(parts) == 4
    assert parts[0] == "pbkdf2_sha256"
    assert parts[1] == "10000"
    assert len(parts[2]) == 32  # 16 bytes hex
    assert len(parts[3]) == 64  # 32 bytes sha256 hex


def test_verify_password_correct():
    pw = "my-secure-password"
    hashed = hash_password(pw, iterations=5_000)
    assert verify_password(pw, hashed) is True


def test_verify_password_incorrect():
    pw = "correct-password"
    hashed = hash_password(pw, iterations=5_000)
    assert verify_password("wrong-password", hashed) is False


def test_verify_password_malformed_hashes():
    assert verify_password("pw", "") is False
    assert verify_password("pw", "invalid") is False
    assert verify_password("pw", "pbkdf2_sha256$notanumber$salt$hash") is False
    assert verify_password("pw", "bcrypt$10$abc$def") is False


def test_salt_uniqueness():
    pw = "same-password"
    h1 = hash_password(pw, iterations=5_000)
    h2 = hash_password(pw, iterations=5_000)
    assert h1 != h2
    assert verify_password(pw, h1) is True
    assert verify_password(pw, h2) is True


def test_generate_temporary_password():
    temp1 = generate_temporary_password(9)
    temp2 = generate_temporary_password(9)
    assert len(temp1) >= 10
    assert temp1 != temp2
