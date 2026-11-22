import json
import runpy
from pathlib import Path
from urllib.parse import urlsplit

import pytest
from fastapi.testclient import TestClient

from scripts.electrotile_geometry import GeometryEvidence, check_geometry, read_obj
from scripts.electrotile_lab import GeometryCase, Manifest, digest
from scripts.electrotile_studio_adapter import collect
from server.app import app

FIXTURES = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "electrotile-lab"
SUITE = FIXTURES / "studio-geometry"


@pytest.fixture(scope="module")
def captures():
    manifest = Manifest.model_validate_json((SUITE / "manifest.json").read_bytes())
    results = {}
    with TestClient(app) as client, pytest.MonkeyPatch.context() as patch:

        def post(url, *, json, timeout):
            return client.post(urlsplit(url).path, json=json)

        patch.setattr("scripts.electrotile_studio_adapter.httpx.post", post)
        for case in manifest.cases:
            assert isinstance(case, GeometryCase)
            data = (SUITE / "inputs" / f"{case.id}.json").read_bytes()
            assert digest(data) == case.input_sha256
            outcomes = collect("http://studio.test", case.criterion, json.loads(data))
            results[case.id] = case.reference, outcomes
    return results


@pytest.mark.parametrize("case_id", ["survey-pitched-opening", "survey-facade"])
def test_independent_geometry_accepts_live_exports(captures, case_id):
    reference, raw = captures[case_id]
    assert check_geometry(reference, GeometryEvidence.model_validate(raw)) == []


@pytest.mark.parametrize(
    ("mode", "expected"),
    [
        ("scale", "surface_coverage"),
        ("winding", "surface_winding"),
        ("duplicate-face", "surface_overlap_m2"),
        ("opening", "module_outside_placement_m2"),
        ("power-units", "module_stc_power_kwp"),
        ("layout-shift", "module_layout_position_uv_m"),
    ],
)
def test_independent_geometry_rejects_plausible_damaged_results(captures, mode, expected):
    mutate = runpy.run_path(str(FIXTURES / "geometry_control.py"))["mutate"]
    case_id = "survey-pitched-opening"
    reference, raw = captures[case_id]
    altered = GeometryEvidence.model_validate(mutate(raw, mode, case_id))
    assert expected in {defect.code for defect in check_geometry(reference, altered)}


def test_obj_rejects_zero_index_and_resolves_relative_indices():
    obj = "v 0 0 0\nv 1 0 0\nv 0 1 0\ng surface_roof\nf "
    assert len(read_obj(obj + "-3 -2 -1")["surface_roof"]) == 1
    with pytest.raises(ValueError, match="invalid vertex indices"):
        read_obj(obj + "0 2 3")
