import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from scripts.sync_product_contracts import CONTRACTS, schema_text
from server.geometry import compute
from server.models import Scene
from server.product_contracts import PRODUCT_CONTRACTS, CatalogV1, JobV1, SceneV2

FIXTURES = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "product"


def fixture(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.mark.parametrize("name, model", PRODUCT_CONTRACTS.items())
def test_generated_contract_in_sync(name, model):
    schema = (CONTRACTS / f"{name}.schema.json").read_text(encoding="utf-8")
    assert schema == schema_text(model)


@pytest.mark.parametrize("scene", [Scene(), Scene(surfaces=["north"])], ids=["default", "north"])
def test_legacy_scene_round_trip(scene):
    restored = SceneV2.model_validate_json(SceneV2.from_v1(scene).model_dump_json())
    assert restored.geometry == scene
    assert compute(restored.geometry)["source_hash"] == compute(scene)["source_hash"]
    assert not restored.surface_evidence


@pytest.mark.parametrize("case", fixture("manifest.json")["cases"], ids=["roof", "facade"])
def test_reference_geometry_against_independent_rectangular_oracle(case):
    scene = SceneV2.model_validate(fixture(case["scene"])).geometry
    layout = compute(scene)
    assert layout["surfaces"][0]["normal"] == pytest.approx(case["expected_normal_enu"])
    for variant in layout["variants"]:
        assert variant["roof_area_m2"] == pytest.approx(case["expected_area_m2"])
        assert variant["module_count"] > 0
        for panel in variant["placements"]:
            x, y = panel["u"], panel["v"]
            x1 = x + panel["width_m"]
            y1 = y + panel["height_m"]
            for fx0, fy0, fx1, fy1 in case["forbidden_uv_rectangles"]:
                width = min(x1, fx1) - max(x, fx0)
                height = min(y1, fy1) - max(y, fy0)
                assert width <= 1e-6 or height <= 1e-6


def test_scene_rejects_measurements_without_source_and_unknown_surfaces():
    payload = fixture("roof.json")
    payload["surface_evidence"][0]["status"] = "measured"
    with pytest.raises(ValidationError, match="requires a source asset"):
        SceneV2.model_validate(payload)
    payload["surface_evidence"][0].update(status="estimated", surface_id="unknown")
    with pytest.raises(ValidationError, match="distinct surfaces"):
        SceneV2.model_validate(payload)


def test_verified_catalog_requires_sources_and_covers_within_external_dimensions():
    payload = fixture("catalog.json")
    assert CatalogV1.model_validate(payload).status == "fixture"
    payload["status"] = "verified"
    with pytest.raises(ValidationError, match="requires a source reference"):
        CatalogV1.model_validate(payload)
    payload["products"][0]["coverage"]["width_m"] = 1.3
    with pytest.raises(ValidationError, match="cannot exceed"):
        CatalogV1.model_validate(payload)


def test_job_success_requires_artifact_and_attempt():
    payload = fixture("job.json")
    assert JobV1.model_validate(payload).state == "queued"
    payload["state"] = "succeeded"
    with pytest.raises(ValidationError, match="needs an attempt"):
        JobV1.model_validate(payload)
    payload["attempt"] = 1
    with pytest.raises(ValidationError, match="result artifact"):
        JobV1.model_validate(payload)
    payload["artifacts"] = [{"artifact_id": payload["job_id"], "sha256": "a" * 64}]
    assert JobV1.model_validate(payload).state == "succeeded"


def test_v2_validation_preserves_provenance_and_does_not_change_layout():
    from fastapi.testclient import TestClient

    from server.app import app, request_window

    payload = fixture("roof.json")
    payload["origin"] = {"latitude_deg": 53.43, "longitude_deg": 14.55}
    payload["surface_evidence"][0].update(
        status="measured", source_asset_ids=["f945ff7a-6a3e-4848-a321-07f60530b25d"]
    )
    request_window.clear()
    with TestClient(app) as client:
        validated = client.post("/api/scene/v2/validate", json=payload)
        assert validated.status_code == 200
        assert validated.json()["surface_evidence"] == payload["surface_evidence"]
        assert validated.json()["origin"] == payload["origin"]
        raw = client.post("/api/layout", json=payload["geometry"])
        restored = client.post("/api/layout", json=validated.json()["geometry"])
        assert raw.status_code == restored.status_code == 200
        assert raw.json()["source_hash"] == restored.json()["source_hash"]
        assert raw.json()["variants"] == restored.json()["variants"]

        payload["surface_evidence"][0]["source_asset_ids"] = []
        assert client.post("/api/scene/v2/validate", json=payload).status_code == 422


@pytest.mark.parametrize("version", ["1.0.0", "2.0.0"])
def test_project_saves_document_in_current_and_next_revision(monkeypatch, version):
    from fastapi.testclient import TestClient

    import server.app as api_module
    from server import cloud

    payload = fixture("roof.json")
    payload["surface_evidence"][0]["source_asset_ids"] = ["f945ff7a-6a3e-4848-a321-07f60530b25d"]
    if version == "1.0.0":
        payload = payload["geometry"]
    calls = []
    project_id = "26110000-0000-4000-8000-000000000090"

    async def fake_db(request, method, path, headers, **kwargs):
        assert path == "bipv_projects"
        assert headers["x-workspace-key"] == "f" * 64
        calls.append((method, kwargs))
        return [{"id": project_id, **kwargs["json"]}]

    monkeypatch.setattr(cloud, "CLOUD", True)
    monkeypatch.setattr(api_module, "db", fake_db)
    api_module.request_window.clear()
    headers = {"X-Workspace-Key": "f" * 64}
    with TestClient(api_module.app) as client:
        created = client.post("/api/projects", json={"scene": payload}, headers=headers)
        assert created.status_code == 201
        body = created.json()
        assert body["name"] == fixture("roof.json")["geometry"]["name"]
        assert body["scene"]["schema_version"] == version
        if version == "2.0.0":
            assert body["scene"]["surface_evidence"] == payload["surface_evidence"]
        updated = client.patch(
            f"/api/projects/{project_id}",
            json={"scene": body["scene"], "expected_revision": 1},
            headers=headers,
        )
        assert updated.status_code == 200
        assert updated.json()["scene"] == body["scene"]
        assert updated.json()["revision"] == 2
        assert calls[-1][1]["params"]["revision"] == "eq.1"
