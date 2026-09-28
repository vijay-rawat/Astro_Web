from conftest import PASSWORD, signup_verified

from app.auth.voice import normalize_phrase

PHRASE = "Space is everything"


async def _enroll(client, phrase=PHRASE, confirm=None, password=PASSWORD):
    return await client.put("/api/auth/voice-passphrase",
                            json={"password": password, "phrase": phrase, "confirm": confirm or phrase})


def test_normalization_absorbs_speech_differences():
    assert normalize_phrase("Space is everything.") == normalize_phrase("space  is EVERYTHING")
    assert normalize_phrase("four moons & two suns") == normalize_phrase("4 moons and 2 suns")


async def test_enroll_then_sign_in_by_voice(app, client, new_client):
    await signup_verified(app, client, "ada@orbital.example.com")
    assert (await _enroll(client)).status_code == 204
    me = (await client.get("/api/me")).json()
    assert me["user"]["voiceEnabled"] is True

    browser = new_client()
    r = await browser.post("/api/auth/voice-login", json={
        "email": "ada@orbital.example.com", "transcripts": ["space is every thing", "Space is everything!"]})
    assert r.status_code == 200, r.text
    assert (await browser.get("/api/me")).status_code == 200


async def test_enroll_needs_the_password_and_matching_takes(app, client):
    await signup_verified(app, client, "bo@orbital.example.com")
    wrong_pw = await _enroll(client, password="not-my-password")
    assert wrong_pw.status_code == 422 and wrong_pw.json()["error"]["code"] == "invalid_credentials"
    differ = await _enroll(client, confirm="space is nothing at all")
    assert differ.json()["error"]["code"] == "phrases_differ"
    weak = await _enroll(client, phrase="hi there")
    assert weak.json()["error"]["code"] == "weak_phrase"


async def test_wrong_phrase_and_unknown_account_look_the_same(app, client, new_client):
    await signup_verified(app, client, "cy@orbital.example.com")
    await _enroll(client)
    wrong = await new_client().post("/api/auth/voice-login",
                                    json={"email": "cy@orbital.example.com", "transcripts": ["space is nothing"]})
    unknown = await new_client("198.51.100.3").post("/api/auth/voice-login",
                                                    json={"email": "ghost@orbital.example.com", "transcripts": [PHRASE]})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


async def test_voice_locks_after_failures_and_password_unlocks(app, client, new_client):
    await signup_verified(app, client, "di@orbital.example.com")
    await _enroll(client)
    attacker = new_client()
    for _ in range(5):
        r = await attacker.post("/api/auth/voice-login",
                                json={"email": "di@orbital.example.com", "transcripts": ["open the pod bay doors"]})
        assert r.status_code == 401
    blocked = await new_client("198.51.100.4").post("/api/auth/voice-login",
                                                    json={"email": "di@orbital.example.com", "transcripts": [PHRASE]})
    assert blocked.status_code in (401, 429)  # locked: even the right phrase is refused

    owner = new_client("198.51.100.5")
    assert (await owner.post("/api/auth/login",
                             json={"email": "di@orbital.example.com", "password": PASSWORD})).status_code == 200
    again = await new_client("198.51.100.6").post("/api/auth/voice-login",
                                                  json={"email": "di@orbital.example.com", "transcripts": [PHRASE]})
    assert again.status_code == 200


async def test_password_reset_turns_voice_off(app, client):
    await signup_verified(app, client, "ed@orbital.example.com")
    await _enroll(client)
    from conftest import outbox, token_from

    await client.post("/api/auth/forgot-password", json={"email": "ed@orbital.example.com"})
    token = token_from(next(m for m in await outbox(app) if "Reset" in m.subject))
    await client.post("/api/auth/reset-password", json={"token": token, "password": "fresh-secret-value"})
    assert (await client.get("/api/me")).json()["user"]["voiceEnabled"] is False
