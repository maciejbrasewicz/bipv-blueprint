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
