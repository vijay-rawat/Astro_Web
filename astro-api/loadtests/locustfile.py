"""Load test for CP0 (plan §2.5). Seed first, then:

    pip install -e ".[load]"
    locust -f loadtests/locustfile.py --host http://localhost:8000 -u 1000 -r 50

Every virtual user signs in once, then reads /api/me in a loop, which is the hottest path in the app.
Targets to check: /api/me p95 under 150 ms and errors under 0.1%.

Rate limits apply per IP, so from one machine the sign-in step will be limited long before the API
is; for sign-in bursts, run from several machines or raise the limits in a staging config.
"""

import random

from locust import HttpUser, between, task

ACCOUNTS = ["maya@kestrel.io", "aarav@kestrel.io", "priya@kestrel.io", "rohan@kestrel.io",
            "dana@northwind.health", "sam@northwind.health"]
PASSWORD = "orbit-demo-2026"  # noqa: S105 - seeded demo accounts


class SignedInUser(HttpUser):
    wait_time = between(0.5, 2)

    def on_start(self) -> None:
        email = random.choice(ACCOUNTS)  # noqa: S311
        self.client.post("/api/auth/login", json={"email": email, "password": PASSWORD}, name="login")

    @task
    def me(self) -> None:
        self.client.get("/api/me", name="/api/me")
