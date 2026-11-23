"""Exercise real production planning and independently assess its emitted evidence."""

import json
import subprocess
import sys
from base64 import b64decode
from hashlib import sha256

import pytest
from fastapi.testclient import TestClient

from server import demo_lab
from server.app import app
from server.production_plan import ProductionInput, build_plan


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr("server.app.request_window", [])
    with TestClient(app) as session:
        yield session


@pytest.fixture
def job():
    return json.loads(demo_lab.production_input())


@pytest.mark.parametrize(
    ("length", "stocks", "scrap"),
    [
        (2997, 1, 0),
        (2998, 2, 5998),
    ],
)
def test_cut_stock_respects_physical_boundary(client, job, length, stocks, scrap):
    job["cuts"].pop("rail-entry")
    for cut in job["cuts"].values():
        cut["length_mm"] = length
    response = client.post("/api/production-plan", json=job)
    assert response.status_code == 200, response.text
    plan = response.json()
    assert plan["profile_bom"] == {"LAB-RAIL": stocks}
    assert sum(row["scrap_mm"] for row in plan["stock"]) == scrap
    assert {cut["id"] for row in plan["stock"] for cut in row["cuts"]} == {"rail-east", "rail-west"}
    for stock in plan["stock"]:
        assert sum(cut["length_mm"] + 3 for cut in stock["cuts"]) + stock["scrap_mm"] == 6000


def test_route_responds_to_available_segments_and_reserve(client, job):
    circuit = job["circuits"]["circuit-a"]
    circuit["reserve_mm"] = 500
    response = client.post("/api/production-plan", json=job)
    assert response.status_code == 200, response.text
    route = response.json()["wires"]["circuit-a"]
    assert route["segments"] == ["path-ridge", "path-entry"]
    assert route["length_mm"] == 6000

    job["segments"].pop("path-entry")
    alternate = client.post("/api/production-plan", json=job)
    assert alternate.status_code == 200, alternate.text
    assert alternate.json()["wires"]["circuit-a"]["segments"] == ["path-alternate"]
    assert alternate.json()["wires"]["circuit-a"]["length_mm"] == 7500

    job["segments"].pop("path-alternate")
    missing = client.post("/api/production-plan", json=job)
    assert missing.status_code == 422
    assert missing.json()["detail"] == "route_missing: circuit-a"


@pytest.mark.parametrize(
    ("section", "key", "field", "value", "code"),
    [
        ("sheets", "east", "trim_mm", {"right": 31}, "trim_limit"),
        ("cuts", "rail-east", "length_mm", 5998, "cut_exceeds_stock"),
        ("circuits", "circuit-a", "sheet_ids", ["infill", "ridge", "east"], "active_sheet_membership"),
        ("circuits", "circuit-a", "sheet_ids", ["west", "ridge", "ridge", "east"], "active_sheet_membership"),
        ("circuits", "circuit-a", "end", "roof-out", "invalid_ports"),
    ],
)
def test_input_is_rejected_with_a_domain_reason(client, job, section, key, field, value, code):
    job[section][key][field] = value
    response = client.post("/api/production-plan", json=job)
    assert response.status_code == 422
    assert response.json()["detail"].split(":")[0] == code


def test_fixture_ui_api_cli_and_artifacts_agree(client, tmp_path):
    input_response = client.get("/api/demo/specimens/production")
    assert input_response.status_code == 200
    normal = client.post("/api/production-plan", json=input_response.json())
    assert normal.status_code == 200, normal.text
    lab = client.post("/api/demo/tests/production-plan")
    assert lab.status_code == 200, lab.text
    report = lab.json()
    assert report["passed"], report["checks"]
    assert report["reference"]["id"] == "ET-PROD-01"
    assert len(report["checks"]) == 8
    assert normal.json()["stc_mwp"] == 84000
    assert normal.json()["strings"]["circuit-a"] == ["west", "ridge", "east"]

    out = tmp_path / "certified"
    subprocess.run(
        [
            sys.executable,
            "-m",
            "scripts.run_electrotile_production_case",
            str(out),
            "--version",
            report["version"],
        ],
        check=True,
    )
    local_report = json.loads((out / "report.json").read_bytes())
    for key in ("passed", "reference", "checks", "artifacts", "version"):
        assert local_report[key] == report[key]

    mats = {}
    for meta in report["artifacts"]:
        raw = b64decode(report["artifact_payloads"][meta["name"]], validate=True)
        assert raw == (out / meta["name"]).read_bytes()
        assert len(raw) == meta["bytes"] and sha256(raw).hexdigest() == meta["sha256"]
        mats[meta["name"]] = raw
    assert mats["zlecenie.json"] == input_response.content
    assert json.loads(mats["plan-produkcji.json"]) == normal.json()


def test_planner_is_order_independent_for_mapping_inputs(job):
    first = build_plan(ProductionInput.model_validate(job))
    for key in ("sheet_catalog", "sheets", "profiles", "cuts", "segments", "ports", "circuits"):
        job[key] = dict(reversed(list(job[key].items())))
    assert build_plan(ProductionInput.model_validate(job)) == first


@pytest.mark.parametrize(
    ("path", "value", "failing_check"),
    [
        (("sheets", "east", "sku"), "LAB-RIGHT", "SKU, wzór, wymiary i cięcia arkuszy"),
        (("stock", 0, "kerf_passes"), 1, "Profile, cięcia, rzaz i bilans materiału"),
        (("wires", "circuit-a", "end"), "other-in", "Trasa, końcówki i długość wiązki"),
        (("wires", "circuit-a", "segments"), ["path-alternate"], "Trasa, końcówki i długość wiązki"),
    ],
)
def test_independent_checker_is_sensitive_to_local_output_changes(monkeypatch, path, value, failing_check):
    def adapted(job):
        plan = build_plan(job)
        parent = plan
        for key in path[:-1]:
            parent = parent[key]
        parent[path[-1]] = value
        return plan

    monkeypatch.setattr(demo_lab, "build_plan", adapted)
    report, _ = demo_lab.case_report("production-plan", "internal-probe")
    assert not report["passed"]
    assert [check["label"] for check in report["checks"] if not check["passed"]] == [failing_check]


@pytest.mark.parametrize("case,extension,cases", [("pv", "-uklad.json", 3), ("obj", ".obj", 2)])
def test_studio_pv_and_geometry_report_exposes_verified_files(client, case, extension, cases):
    response = client.post(f"/api/demo/tests/{case}")
    assert response.status_code == 200, response.text
    report = response.json()
    assert report["passed"] and len(report["checks"]) == cases
    artifacts = [row for row in report["artifacts"] if row["name"].endswith(extension)]
    assert len(artifacts) == cases
    for artifact in artifacts:
        body = b64decode(report["artifact_payloads"][artifact["name"]], validate=True)
        assert sha256(body).hexdigest() == artifact["sha256"]
        if case == "obj":
            assert body.startswith(b"#")
        else:
            assert isinstance(json.loads(body)["variant"]["placements"], list)
