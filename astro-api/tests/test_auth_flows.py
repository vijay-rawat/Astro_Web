from conftest import PASSWORD, outbox, signup_verified, token_from


async def test_signup_verify_and_me(app, client):
    me = await signup_verified(app, client, "ada@orbital.example.com", "Ada Lovelace", "Orbital")
    assert me["user"]["email"] == "ada@orbital.example.com"
    assert me["user"]["canManage"] is True  # the first person creates the workspace and is its admin
    assert me["company"]["name"] == "Orbital"
    r = await client.get("/api/me")
    assert r.status_code == 200
    assert r.json()["user"]["id"] == me["user"]["id"]


async def test_cannot_sign_in_before_verifying(app, client):
    await client.post("/api/auth/signup", json={"name": "Bo", "email": "bo@orbital.example.com", "password": PASSWORD})
    r = await client.post("/api/auth/login", json={"email": "bo@orbital.example.com", "password": PASSWORD})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "email_unverified"


async def test_verification_link_works_once(app, client, new_client):
    await client.post("/api/auth/signup", json={"name": "Cy", "email": "cy@orbital.example.com", "password": PASSWORD})
    token = token_from((await outbox(app))[0])
    assert (await client.post("/api/auth/verify-email", json={"token": token})).status_code == 200
    again = await new_client().post("/api/auth/verify-email", json={"token": token})
    assert again.status_code == 400
    assert again.json()["error"]["code"] == "invalid_link"


async def test_wrong_password_and_unknown_email_look_the_same(app, client):
    await signup_verified(app, client, "di@orbital.example.com")
    wrong = await client.post("/api/auth/login", json={"email": "di@orbital.example.com", "password": "not-the-password"})
    unknown = await client.post("/api/auth/login", json={"email": "nobody@orbital.example.com", "password": "whatever-1"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


async def test_signup_with_existing_email_gives_same_reply_and_no_second_account(app, client):
    await signup_verified(app, client, "ed@orbital.example.com", "Ed")
    r = await client.post("/api/auth/signup", json={"name": "Imposter", "email": "ed@orbital.example.com",
                                                    "password": "another-strong-one"})
    assert r.status_code == 202
    assert r.json() == {"status": "accepted"}
    mails = await outbox(app)
    assert mails[0].subject == "You already have an Astro account"


async def test_weak_password_is_refused_with_a_field_message(client):
    r = await client.post("/api/auth/signup", json={"name": "Fi", "email": "fi@orbital.example.com", "password": "password1"})
    assert r.status_code == 422
    body = r.json()["error"]
    assert body["code"] == "weak_password"
    assert "password" in body["fields"]


async def test_domain_join_after_the_creator_verifies(app, client, new_client):
    first = await signup_verified(app, client, "gus@kepler.example.com", "Gus", "Kepler Inc")
    second = await signup_verified(app, new_client(), "hal@kepler.example.com", "Hal", "Ignored Name")
    assert second["company"]["id"] == first["company"]["id"]
    assert second["user"]["roles"] == ["member"]


async def test_public_email_domains_never_join_each_other(app, client, new_client):
    a = await signup_verified(app, client, "ivy.test.one@gmail.com", "Ivy")
    b = await signup_verified(app, new_client(), "jo.test.two@gmail.com", "Jo")
    assert a["company"]["id"] != b["company"]["id"]


async def test_logout_ends_the_session(app, client):
    await signup_verified(app, client, "kai@orbital.example.com")
    assert (await client.post("/api/auth/logout")).status_code == 204
    assert (await client.get("/api/me")).status_code == 401


async def test_forgot_and_reset_password(app, client, new_client):
    await signup_verified(app, client, "lu@orbital.example.com", "Lu")
    other_device = new_client()
    await other_device.post("/api/auth/login", json={"email": "lu@orbital.example.com", "password": PASSWORD})
    assert (await other_device.get("/api/me")).status_code == 200

    unknown = await client.post("/api/auth/forgot-password", json={"email": "nobody@orbital.example.com"})
    known = await client.post("/api/auth/forgot-password", json={"email": "lu@orbital.example.com"})
    assert unknown.status_code == known.status_code == 202
    reset_mail = next(m for m in await outbox(app) if "Reset" in m.subject)
    token = token_from(reset_mail)

    r = await client.post("/api/auth/reset-password", json={"token": token, "password": "a-brand-new-secret"})
    assert r.status_code == 200
    assert (await other_device.get("/api/me")).status_code == 401  # every other session ended
    assert (await client.post("/api/auth/reset-password",
                              json={"token": token, "password": "yet-another-one-9"})).status_code == 400
    old = await new_client("198.51.100.9").post("/api/auth/login",
                                                json={"email": "lu@orbital.example.com", "password": PASSWORD})
    assert old.status_code == 401
    new = await new_client("198.51.100.10").post("/api/auth/login",
                                                 json={"email": "lu@orbital.example.com", "password": "a-brand-new-secret"})
    assert new.status_code == 200


async def test_session_list_and_sign_out_other_device(app, client, new_client):
    await signup_verified(app, client, "mo@orbital.example.com")
    phone = new_client()
    await phone.post("/api/auth/login", json={"email": "mo@orbital.example.com", "password": PASSWORD})
    listed = (await client.get("/api/auth/sessions")).json()
    assert len(listed) == 2
    other = next(s for s in listed if not s["current"])
    assert (await client.delete(f"/api/auth/sessions/{other['id']}")).status_code == 204
    assert (await phone.get("/api/me")).status_code == 401
    assert (await client.get("/api/me")).status_code == 200


async def test_logout_all(app, client, new_client):
    await signup_verified(app, client, "ned@orbital.example.com")
    laptop = new_client()
    await laptop.post("/api/auth/login", json={"email": "ned@orbital.example.com", "password": PASSWORD})
    assert (await client.post("/api/auth/logout-all")).status_code == 204
    assert (await laptop.get("/api/me")).status_code == 401
    assert (await client.get("/api/me")).status_code == 401


async def test_remember_me_sets_a_persistent_cookie(app, client, new_client):
    await signup_verified(app, client, "oz@orbital.example.com")
    r = await new_client().post("/api/auth/login",
                                json={"email": "oz@orbital.example.com", "password": PASSWORD, "remember": True})
    cookie = r.headers["set-cookie"].lower()
    assert "max-age=" in cookie and "httponly" in cookie and "samesite=lax" in cookie
    r2 = await new_client("198.51.100.11").post("/api/auth/login",
                                                json={"email": "oz@orbital.example.com", "password": PASSWORD})
    assert "max-age=" not in r2.headers["set-cookie"].lower()
