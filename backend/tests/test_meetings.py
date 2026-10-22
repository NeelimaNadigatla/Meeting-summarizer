from tests.conftest import register

TRANSCRIPT = """Priya: Let's review the launch plan for the new mobile app this week.
Arjun: The login screen and the payment flow are both finished and tested.
Priya: We agreed to launch the beta on the 15th.
Arjun: I will send the release notes to the marketing team by Friday.
Kavya: The analytics dashboard still has a few bugs we need to look at."""


def create(client, headers, transcript=TRANSCRIPT, title=None):
    response = client.post("/api/meetings", json={"transcript": transcript, "title": title}, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_create_meeting_returns_structured_summary(client):
    headers = register(client)
    meeting = create(client, headers, title="Launch sync")

    assert meeting["title"] == "Launch sync"
    summary = meeting["summary"]
    assert summary["summary"]
    assert any("launch the beta" in d for d in summary["decisions"])
    assert any(item["owner"] == "Arjun" for item in summary["action_items"])


def test_title_falls_back_to_generated_title(client):
    headers = register(client)
    meeting = create(client, headers)
    assert meeting["title"]


def test_transcript_too_short_is_rejected(client):
    headers = register(client)
    response = client.post("/api/meetings", json={"transcript": "hi"}, headers=headers)
    assert response.status_code == 422


def test_list_get_and_search(client):
    headers = register(client)
    first = create(client, headers, title="Launch sync")
    create(client, headers, transcript="Ravi: We discussed the hiring plan for next quarter today.", title="Hiring")

    all_meetings = client.get("/api/meetings", headers=headers).json()
    assert [m["title"] for m in all_meetings] == ["Hiring", "Launch sync"]  # newest first

    found = client.get("/api/meetings", params={"q": "payment"}, headers=headers).json()
    assert [m["id"] for m in found] == [first["id"]]

    detail = client.get(f"/api/meetings/{first['id']}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["transcript"] == TRANSCRIPT


def test_users_cannot_see_each_others_meetings(client):
    owner = register(client, email="owner@example.com")
    other = register(client, email="other@example.com")
    meeting = create(client, owner)

    assert client.get(f"/api/meetings/{meeting['id']}", headers=other).status_code == 404
    assert client.delete(f"/api/meetings/{meeting['id']}", headers=other).status_code == 404
    assert client.get("/api/meetings", headers=other).json() == []


def test_delete_meeting(client):
    headers = register(client)
    meeting = create(client, headers)

    assert client.delete(f"/api/meetings/{meeting['id']}", headers=headers).status_code == 204
    assert client.get(f"/api/meetings/{meeting['id']}", headers=headers).status_code == 404
