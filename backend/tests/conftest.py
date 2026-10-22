import os

# Point the app at a throwaway SQLite database and the offline summarizer
# BEFORE the app is imported (settings are read at import time).
os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["SUMMARIZER_PROVIDER"] = "mock"
os.environ["JWT_SECRET"] = "test-secret"

import pytest
from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as c:
        yield c
    Base.metadata.drop_all(bind=engine)


def register(client, email="neelima@example.com", password="password123"):
    response = client.post("/api/auth/register", json={"email": email, "password": password})
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}
