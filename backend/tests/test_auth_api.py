"""Integration tests for cookie-based JWT auth (register / login / me / refresh / logout)."""


def _new_client():
    from fastapi.testclient import TestClient
    from app.main import app

    return TestClient(app)


def _admin_login(client):
    r = client.post("/api/auth/login", json={"email": "admin@test.com", "password": "adminpass"})
    assert r.status_code == 200, r.text
    return r


def test_register_student():
    client = _new_client()
    r = client.post(
        "/api/auth/register",
        data={"full_name": "New Kid", "email": "newkid@test.com", "password": "pw12345"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["email"] == "newkid@test.com"
    assert body["id"]


def test_register_duplicate_email_conflicts():
    client = _new_client()
    data = {"full_name": "Dup", "email": "dup@test.com", "password": "pw12345"}
    assert client.post("/api/auth/register", data=data).status_code == 201
    assert client.post("/api/auth/register", data=data).status_code == 409


def test_login_sets_httponly_cookies(student):
    client = _new_client()
    r = client.post("/api/auth/login", json={"email": "student@test.com", "password": "studentpass"})
    assert r.status_code == 200
    set_cookies = r.headers.get_list("set-cookie")
    joined = "; ".join(set_cookies)
    assert "access_token=" in joined
    assert "refresh_token=" in joined
    assert "HttpOnly" in joined
    # Tokens are also returned in the body for legacy clients.
    assert r.json()["access_token"]
    assert r.json()["user"]["email"] == "student@test.com"


def test_me_via_cookie_after_login(student):
    client = _new_client()
    client.post("/api/auth/login", json={"email": "student@test.com", "password": "studentpass"})
    r = client.get("/api/auth/me")  # cookie jar sends the token automatically
    assert r.status_code == 200, r.text
    assert r.json()["email"] == "student@test.com"


def test_me_without_token_is_401():
    client = _new_client()
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_me_with_authorization_header_fallback(student):
    client = _new_client()
    login = client.post("/api/auth/login", json={"email": "student@test.com", "password": "studentpass"})
    token = login.json()["access_token"]
    # Fresh client with NO cookies, only a Bearer header — fallback must work.
    fresh = _new_client()
    r = fresh.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["email"] == "student@test.com"


def test_refresh_uses_refresh_cookie(student):
    client = _new_client()
    client.post("/api/auth/login", json={"email": "student@test.com", "password": "studentpass"})
    # Drop the access cookie only — the refresh cookie must still work.
    client.cookies.delete("access_token", path="/")
    r = client.post("/api/auth/token/refresh")
    assert r.status_code == 200, r.text
    assert r.json()["access_token"]
    set_cookies = r.headers.get_list("set-cookie")
    assert any("access_token=" in c for c in set_cookies)


def test_refresh_without_cookie_is_401():
    client = _new_client()
    r = client.post("/api/auth/token/refresh")
    assert r.status_code == 401


def test_logout_clears_cookies(student):
    client = _new_client()
    client.post("/api/auth/login", json={"email": "student@test.com", "password": "studentpass"})
    r = client.post("/api/auth/logout")
    assert r.status_code == 200
    set_cookies = r.headers.get_list("set-cookie")
    joined = "; ".join(set_cookies)
    assert "access_token=" in joined and "refresh_token=" in joined
    assert "Max-Age=0" in joined
    # After logout the cookie jar no longer authenticates.
    assert client.get("/api/auth/me").status_code == 401