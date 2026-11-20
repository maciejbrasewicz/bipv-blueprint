from fastapi.testclient import TestClient

from server.app import app, request_window


def test_api_contract_and_limits():
    request_window.clear()
    with TestClient(app) as client:
        health = client.get("/api/health")
        assert health.status_code == 200
        assert health.headers["cache-control"] == "no-store"
        assert health.headers["x-frame-options"] == "DENY"
        result = client.post("/api/layout", json={})
        assert result.status_code == 200
        assert result.json()["variants"][0]["module_count"] > 0
        assert client.post("/api/layout", json={"roof": {"width_m": -1}}).status_code == 422
        assert client.post("/api/layout", content="x"*70001).status_code == 413
        assert client.get("/api/does-not-exist").status_code == 404
        assert client.get("/api/projects").status_code in (401, 503)
        assert client.get("/api/catalog").json()["is_manufacturer_data"] is False
