from tests.conftest import register


def test_register_and_get_me(client):
    headers = register(client)
    response = client.get("/api/auth/me", headers=headers)
    assert response.status_code == 200
    assert response.json()["email"] == "neelima@example.com"


def test_register_duplicate_email_is_rejected(client):
    register(client)
    response = client.post(
        "/api/auth/register", json={"email": "NEELIMA@example.com", "password": "password123"}
    )
    assert response.status_code == 409


def test_register_rejects_short_password(client):
    response = client.post("/api/auth/register", json={"email": "a@example.com", "password": "short"})
    assert response.status_code == 422


def test_login_success_and_wrong_password(client):
    register(client)
    ok = client.post("/api/auth/login", json={"email": "neelima@example.com", "password": "password123"})
    assert ok.status_code == 200
    assert "access_token" in ok.json()

    bad = client.post("/api/auth/login", json={"email": "neelima@example.com", "password": "wrongpass1"})
    assert bad.status_code == 401


def test_root_explains_the_api(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["docs"] == "/docs"


def test_protected_route_needs_token(client):
    assert client.get("/api/auth/me").status_code == 401
    bad_token = {"Authorization": "Bearer not-a-real-token"}
    assert client.get("/api/auth/me", headers=bad_token).status_code == 401
