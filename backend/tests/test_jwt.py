"""Tests for the JWT handler (tokens used in HttpOnly cookies)."""

import uuid


def test_access_and_refresh_tokens_roundtrip():
    from app.auth.jwt_handler import (
        create_access_token,
        create_refresh_token,
        verify_token,
    )

    sub = str(uuid.uuid4())
    access = create_access_token({"sub": sub, "role": "student"})
    refresh = create_refresh_token({"sub": sub, "role": "student"})

    ap = verify_token(access)
    rp = verify_token(refresh)

    assert ap is not None and ap["sub"] == sub and ap["type"] == "access"
    assert rp is not None and rp["sub"] == sub and rp["type"] == "refresh"


def test_invalid_token_returns_none():
    from app.auth.jwt_handler import verify_token

    assert verify_token("garbage.token.here") is None