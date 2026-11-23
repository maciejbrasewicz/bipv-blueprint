"""Boundary and negative-control tests for the ET/2025/7 evidence assessor."""

import hashlib
import json
import subprocess
import sys
from time import perf_counter_ns

import pytest
from fastapi.testclient import TestClient

from scripts.check_electrotile_run import evaluate
from server.app import app

SECOND = 1_000_000_000
START = 11 * SECOND
HASH = "a" * 64


def sample(criterion):
    size, duration_s = {"I-01": (10, 300), "I-02": (1, 60), "N-01": (20, 300), "III-02": (1, 21600)}[
        criterion
    ]
    case_ids = [f"case-{i:02}" for i in range(size)]
    manifest = {
        "version": 1,
        "criterion": criterion,
        "dataset_id": "synthetic-v1",
        "case_ids": case_ids,
        "inputs_sha256": {
            case_id: hashlib.sha256(f"{case_id}-input".encode()).hexdigest() for case_id in case_ids
        },
    }
    capture = {
        "version": 1,
        "criterion": criterion,
        "run_id": "synthetic-run",
        "scope": "studio-fixture",
        "release_sha": "f" * 40,
        "environment_id": "test-runner",
        "observer_id": "synthetic-clock",
        "closed_ns": START + 22000 * SECOND,
        "observations": [],
    }
    if criterion == "I-01":
        manifest.update(voivodeship_id="fixture-region", sampling_seed=202507, population_sha256=HASH)
    if criterion == "I-02":
        manifest.update(
            catalog_id="catalog-v1",
            references={"case-00": {"module_count": 100, "accepted_type_sets": [["tile-a"], ["tile-b"]]}},
        )
    if criterion == "N-01":
        manifest["cache"] = capture["cache"] = "cold"
    for case_id in case_ids:
        case_digest = hashlib.sha256(case_id.encode()).hexdigest()
        outputs = {
            "I-01": {
                "model_sha256": case_digest,
                "geometry_review_sha256": HASH,
                "geometry_valid": True,
                "geometry_sources": ["satellite"],
            },
            "I-02": {"report_sha256": case_digest, "modules_by_type": {"tile-a": 100}},
            "N-01": {
                "image_sha256": case_digest,
                "source": "satellite",
                "preprocessed": True,
                "matches_case": True,
            },
            "III-02": {
                "quote_sha256": case_digest,
                "profitability_sha256": HASH,
                "visualization_sha256": HASH,
            },
        }
        capture["observations"].append(
            {
                "case_id": case_id,
                "input_sha256": manifest["inputs_sha256"][case_id],
                "started_ns": START,
                "finished_ns": START + duration_s * SECOND,
                "output": outputs[criterion],
            }
        )
    return manifest, capture


def report_bytes(manifest, capture):
    frozen = json.dumps(manifest).encode()
    measured = json.dumps({**capture, "manifest_sha256": hashlib.sha256(frozen).hexdigest()}).encode()
    return frozen, measured


def score(manifest, capture):
    return evaluate(*report_bytes(manifest, capture))


@pytest.mark.parametrize(
    ("criterion", "target", "limit"),
    [("I-01", 300, 900), ("I-02", 60, 120), ("N-01", 300, 500), ("III-02", None, 21600)],
)
@pytest.mark.parametrize("offset_ns", [-1, 0, 1])
def test_limits_inclusive_at_nanosecond_resolution(criterion, target, limit, offset_ns):
    manifest, capture = sample(criterion)
    capture["observations"][0]["finished_ns"] = START + limit * SECOND + offset_ns
    report = score(manifest, capture)
    result = report["batch"] if criterion == "N-01" else report["cases"][0]
    assert result["elapsed_ns"] == limit * SECOND + offset_ns
    assert result["target_s"] == target
    assert result["limit_s"] == limit
    assert result["status"] == report["assessment_status"] == ("PASS" if offset_ns <= 0 else "FAIL")
    assert report["acceptance_status"] == "BLOCKED"
    assert result["target_overrun_ns"] == (0 if target is None else (limit - target) * SECOND + offset_ns)


@pytest.mark.parametrize(("criterion", "target"), [("I-01", 300), ("I-02", 60), ("N-01", 300)])
@pytest.mark.parametrize("offset_ns", [0, 1])
def test_crossing_target_is_reported_without_failing_the_case(criterion, target, offset_ns):
    manifest, capture = sample(criterion)
    capture["observations"][0]["finished_ns"] = START + target * SECOND + offset_ns
    report = score(manifest, capture)
    result = report["batch"] if criterion == "N-01" else report["cases"][0]
    assert report["assessment_status"] == "PASS"
    assert result["target_missed"] == bool(offset_ns)
    assert result["target_overrun_ns"] == offset_ns


@pytest.mark.parametrize(
    ("count", "types", "reasons"),
    [
        (80, "tile-a", []),
        (120, "tile-b", []),
        (79, "tile-a", ["count_deviation_over_20_percent"]),
        (121, "tile-b", ["count_deviation_over_20_percent"]),
        (100, "tile-c", ["pv_types_mismatch"]),
        (121, "tile-c", ["count_deviation_over_20_percent", "pv_types_mismatch"]),
    ],
)
def test_pv_checks_count_and_canonical_sku_independently(count, types, reasons):
    manifest, capture = sample("I-02")
    capture["observations"][0]["output"]["modules_by_type"] = {types: count}
    result = score(manifest, capture)["cases"][0]
    assert result["reference_count"] == 100
    assert result["module_count"] == count
    assert result["reasons"] == reasons


@pytest.mark.parametrize("output", [{}, {"tile-a": 1}])
def test_zero_pv_reference_only_accepts_zero_modules(output):
    manifest, capture = sample("I-02")
    manifest["references"]["case-00"] = {"module_count": 0, "accepted_type_sets": [[]]}
    capture["observations"][0]["output"]["modules_by_type"] = output
    result = score(manifest, capture)["cases"][0]
    assert result["status"] == ("FAIL" if output else "PASS")


def test_total_mismatch_cannot_be_hidden_by_averaging_pv_cases():
    manifest, capture = sample("I-02")
    manifest["case_ids"].append("case-01")
    manifest["inputs_sha256"]["case-01"] = HASH
    manifest["references"]["case-01"] = manifest["references"]["case-00"]
    row = capture["observations"][0]
    row["output"]["modules_by_type"] = {"tile-a": 75}
    capture["observations"].append(
        {
            **row,
            "case_id": "case-01",
            "input_sha256": HASH,
            "output": {**row["output"], "modules_by_type": {"tile-a": 125}},
        }
    )
    report = score(manifest, capture)
    assert sum(case["module_count"] for case in report["cases"]) == 200
    assert report["case_counts"] == {"PASS": 0, "FAIL": 2, "NOT_RUN": 0}


@pytest.mark.parametrize("bad_source", ["lidar", "orthophoto", "terrestrial-photo"])
def test_satellite_requirement_rejects_contaminated_geometry(bad_source):
    manifest, capture = sample("I-01")
    capture["observations"][2]["output"]["geometry_sources"].append(bad_source)
    capture["observations"][3]["output"]["geometry_valid"] = False
    report = score(manifest, capture)
    assert report["assessment_status"] == "FAIL"
    assert report["cases"][2]["reasons"] == ["non_satellite_geometry_source"]
    assert report["cases"][3]["reasons"] == ["geometry_review_failed"]
    assert report["case_counts"] == {"PASS": 8, "FAIL": 2, "NOT_RUN": 0}


def test_not_started_and_started_but_lost_have_distinct_statuses():
    manifest, capture = sample("I-01")
    capture["observations"] = capture["observations"][:-2]
    capture["observations"][7].update(finished_ns=None, output=None)
    report = score(manifest, capture)
    assert report["case_counts"] == {"PASS": 7, "FAIL": 1, "NOT_RUN": 2}
    assert report["assessment_status"] == "FAIL"
    capture["observations"][7]["finished_ns"] = START + 900 * SECOND
    assert score(manifest, capture)["cases"][7]["reasons"] == ["missing_output"]


def test_started_batch_cannot_pass_with_19_addresses():
    manifest, capture = sample("N-01")
    capture["observations"].pop()
    report = score(manifest, capture)
    assert report["batch"]["reasons"] == ["batch_incomplete_or_invalid"]
    assert report["assessment_status"] == "FAIL"
    assert report["case_counts"] == {"PASS": 19, "FAIL": 0, "NOT_RUN": 1}


def test_unstarted_batch_is_not_run():
    manifest, capture = sample("N-01")
    capture["observations"].clear()
    report = score(manifest, capture)
    assert report["assessment_status"] == "NOT_RUN"
    assert report["case_counts"] == {"PASS": 0, "FAIL": 0, "NOT_RUN": 20}


def test_batch_clock_uses_first_submission_through_last_completion_despite_fast_jobs():
    manifest, capture = sample("N-01")
    for i, row in enumerate(reversed(capture["observations"])):
        job_start = START + i * 26 * SECOND
        row.update(started_ns=job_start, finished_ns=job_start + 7 * SECOND)
    report = score(manifest, capture)
    assert all(case["elapsed_ns"] == 7 * SECOND for case in report["cases"])
    assert report["cache"] == "cold"
    assert report["batch"]["elapsed_ns"] == 501 * SECOND
    assert report["batch"]["status"] == "FAIL"


def test_batch_flags_duplicate_images_wrong_address_and_non_satellite_output():
    manifest, capture = sample("N-01")
    rows = capture["observations"]
    rows[0]["output"]["image_sha256"] = rows[1]["output"]["image_sha256"]
    rows[2]["output"]["matches_case"] = False
    rows[3]["output"]["source"] = "orthophoto"
    rows[4]["output"]["preprocessed"] = False
    report = score(manifest, capture)
    assert [x["reasons"] for x in report["cases"][:5]] == [
        ["identical_image_for_distinct_cases"],
        ["identical_image_for_distinct_cases"],
        *[["preprocessed_satellite_image_invalid"]] * 3,
    ]
    assert report["assessment_status"] == "FAIL"


def test_offer_clock_includes_operator_waiting_and_checks_all_outputs():
    manifest, capture = sample("III-02")
    observation = capture["observations"][0]
    observation.update(finished_ns=START + 21601 * SECOND, active_ns=60 * SECOND)
    case = score(manifest, capture)["cases"][0]
    assert case["elapsed_ns"] == 21601 * SECOND
    assert case["active_ns"] == 60 * SECOND and case["waiting_ns"] == 21541 * SECOND
    assert case["reasons"] == ["time_limit_exceeded"]
    del observation["output"]["profitability_sha256"]
    with pytest.raises(ValueError, match="profitability_sha256"):
        score(manifest, capture)


@pytest.mark.parametrize(
    "defect",
    [
        "duplicate-case",
        "unknown-case",
        "changed-roster",
        "different-input",
        "bad-clock",
        "future-event",
        "wrong-cache",
        "coerced-int",
    ],
)
def test_malformed_or_wrongly_matched_capture_is_rejected(defect):
    manifest, capture = sample("N-01")
    rows = capture["observations"]
    match defect:
        case "duplicate-case":
            rows[0]["case_id"] = rows[1]["case_id"]
        case "unknown-case":
            rows[0]["case_id"] = "outside-frozen-roster"
        case "changed-roster":
            manifest["case_ids"].pop()
        case "different-input":
            rows[0]["input_sha256"] = HASH
        case "bad-clock":
            rows[0]["finished_ns"] = rows[0]["started_ns"] - 1
        case "future-event":
            rows[0]["finished_ns"] = capture["closed_ns"] + 1
        case "wrong-cache":
            capture["cache"] = "warm"
        case "coerced-int":
            rows[0]["started_ns"] = str(rows[0]["started_ns"])
    with pytest.raises(ValueError):
        score(manifest, capture)


def test_manifest_hash_and_json_duplicate_keys_are_checked():
    manifest, capture = report_bytes(*sample("I-01"))
    with pytest.raises(ValueError, match="exact manifest bytes"):
        evaluate(manifest + b"\n", capture)
    bad_capture = capture.replace(b'"scope":', b'"scope": "replay", "scope":')
    with pytest.raises(ValueError, match="duplicate JSON field"):
        evaluate(manifest, bad_capture)


@pytest.mark.parametrize("criterion", ["I-01", "N-01"])
def test_frozen_address_sample_cannot_repeat_an_identical_input(criterion):
    manifest, capture = sample(criterion)
    manifest["inputs_sha256"]["case-00"] = manifest["inputs_sha256"]["case-01"]
    capture["observations"][0]["input_sha256"] = manifest["inputs_sha256"]["case-01"]
    with pytest.raises(ValueError, match="identical frozen input"):
        score(manifest, capture)


@pytest.mark.parametrize("version", [True, 1.0, "1", 2])
def test_protocol_rejects_coerced_or_unknown_versions(version):
    manifest, capture = sample("I-02")
    manifest["version"] = version
    with pytest.raises(ValueError, match="version"):
        score(manifest, capture)


def test_captured_studio_response_matches_an_independent_analytical_pv_reference(monkeypatch):
    monkeypatch.setattr("server.app.request_window", [])
    manifest, capture = sample("I-02")
    # After 0.25 m edge setbacks, 1.83 × 0.815 m fits 3 × 2 tiles with 15 mm gaps.
    scene = {
        "product_id": "tile-32",
        "surfaces": ["roof"],
        "custom_surfaces": [
            {
                "name": "Reference",
                "kind": "roof",
                "id": "roof",
                "origin": [0, 0, 3],
                "u": [1, 0, 0],
                "v": [0, 1, 0],
                "boundary_uv_m": [[0, 0], [2.33, 0], [2.33, 1.315], [0, 1.315]],
            }
        ],
    }
    payload = json.dumps(scene).encode()
    input_digest = hashlib.sha256(payload).hexdigest()
    manifest["inputs_sha256"]["case-00"] = input_digest
    manifest["references"]["case-00"] = {"module_count": 6, "accepted_type_sets": [["tile-32"]]}
    with TestClient(app) as client:
        started = perf_counter_ns()
        response = client.post("/api/layout", content=payload, headers={"Content-Type": "application/json"})
        finished = perf_counter_ns()
    response.raise_for_status()
    data = response.json()
    landscape = next(variant for variant in data["variants"] if variant["id"] == "landscape")
    capture["closed_ns"] = perf_counter_ns()
    capture["observations"] = [
        {
            "case_id": "case-00",
            "input_sha256": input_digest,
            "started_ns": started,
            "finished_ns": finished,
            "output": {
                "report_sha256": hashlib.sha256(response.content).hexdigest(),
                "modules_by_type": {data["product"]["id"]: landscape["module_count"]},
            },
        }
    ]
    report = score(manifest, capture)
    assert report["assessment_status"] == "PASS" and report["acceptance_status"] == "BLOCKED"
    assert report["cases"][0]["elapsed_ns"] == finished - started


@pytest.mark.parametrize(
    ("scope", "acceptance"),
    [("studio-fixture", "BLOCKED"), ("replay", "BLOCKED"), ("client-live", "REVIEW_REQUIRED")],
)
def test_pass_never_means_automatic_acceptance(scope, acceptance):
    manifest, capture = sample("I-02")
    report = score(manifest, {**capture, "scope": scope})
    assert report["assessment_status"] == "PASS"
    assert report["acceptance_status"] == acceptance


def test_cli_reports_success_failure_and_invalid_inputs(tmp_path):
    manifest, capture = sample("I-02")
    plan_path, capture_path, report_path = (
        tmp_path / name for name in ("manifest.json", "capture.json", "report.json")
    )
    frozen, measured = report_bytes(manifest, capture)
    plan_path.write_bytes(frozen)
    capture_path.write_bytes(measured)
    command = [sys.executable, "-m", "scripts.check_electrotile_run", str(plan_path), str(capture_path)]
    passing = subprocess.run([*command, "--output", str(report_path)], capture_output=True, check=False)
    assert passing.returncode == 0
    report = json.loads(report_path.read_bytes())
    assert report["manifest_sha256"] == hashlib.sha256(frozen).hexdigest()
    assert report["capture_sha256"] == hashlib.sha256(measured).hexdigest()

    capture["observations"][0]["output"]["modules_by_type"]["tile-a"] = 121
    capture_path.write_bytes(report_bytes(manifest, capture)[1])
    failing = subprocess.run(command, capture_output=True, check=False)
    assert failing.returncode == 1
    assert json.loads(failing.stdout)["assessment_status"] == "FAIL"

    plan_path.write_bytes(frozen + b" ")
    invalid = subprocess.run(command, capture_output=True, check=False)
    assert invalid.returncode == 2 and b"exact manifest bytes" in invalid.stderr
