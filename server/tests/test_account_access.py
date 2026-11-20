import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from server import accounts, cloud
from server.app import get_project

ORG = "26110000-0000-4000-8000-000000000010"
PROJECT = "26110000-0000-4000-8000-000000000011"


def test_password_token_in_cookie_and_claim_requires_both_credentials(monkeypatch):
    recorded = []

    async def fake_upstream(request, method, path, headers, **kwargs):
        recorded.append((path, headers, kwargs))
        if path == "auth/v1/token":
            return httpx.Response(
                200, json={"access_token": "abc.def.ghi", "refresh_token": "discarded", "expires_in": 3600}
            )
        return httpx.Response(200, json=[{"id": PROJECT}] if method == "GET" else PROJECT)

    monkeypatch.setattr(cloud, "CLOUD", True)
    monkeypatch.setattr(cloud, "upstream", fake_upstream)
    monkeypatch.setattr(accounts, "upstream", fake_upstream)
    monkeypatch.setattr(cloud, "RAILWAY_DOMAIN", "")
    monkeypatch.setattr(accounts, "RAILWAY_DOMAIN", "")
    app = FastAPI()
    app.include_router(accounts.router)
    app.get("/projects/{project_id}")(get_project)

    with TestClient(app, base_url="https://testserver") as client:
        origin = {"Origin": "https://testserver"}
        credentials = {"email": "studio@example.test", "password": "fake-password"}
        for bad_origin in ({}, {"Origin": "https://foreign.test"}):
            assert (
                client.post("/api/account/sign-in", json=credentials, headers=bad_origin).status_code == 403
            )
        assert recorded == []

        claim = {"project_id": PROJECT, "organization_id": ORG, "expected_revision": 3}
        assert client.post("/api/account/claim", json=claim, headers=origin).status_code == 401
        signed_in = client.post("/api/account/sign-in", json=credentials, headers=origin)
        assert signed_in.status_code == 204
        assert not signed_in.content
        cookie = signed_in.headers["set-cookie"]
        assert "HttpOnly" in cookie and "Secure" in cookie and "SameSite=strict" in cookie
        assert "discarded" not in cookie and "fake-password" not in cookie

        with_guest_key = {**origin, "X-Workspace-Key": "f" * 64}
        assert client.post("/api/account/claim", json=claim, headers=origin).status_code == 401
        assert client.post("/api/account/claim", json=claim, headers=with_guest_key).json() == {"id": PROJECT}
        path, headers, arguments = recorded[-1]
        assert path == "rest/v1/rpc/bipv_claim_project"
        assert headers["Authorization"] == "Bearer abc.def.ghi"
        assert headers["x-workspace-key"] == "f" * 64
        assert arguments["json"] == {"p_organization": ORG, "p_project": PROJECT, "p_revision": 3}

        fake_headers = {"X-Organization-Id": ORG, "X-Workspace-Key": "f" * 64}
        assert client.get("/projects/" + PROJECT, headers=fake_headers).status_code == 200
        _, headers, arguments = recorded[-1]
        assert "x-workspace-key" not in headers
        assert arguments["params"]["organization_id"] == f"eq.{ORG}"

        assert client.post("/api/account/sign-out", headers=origin).status_code == 204
        assert client.get("/api/account/organizations").status_code == 401
