import sys
from pathlib import Path

import pytest

from scripts.electrotile_lab import compare_reports, run_cases, score

FIXTURES = Path(__file__).parents[2] / "tests/fixtures/electrotile-lab"
MANIFEST = FIXTURES / "functional-replay/manifest.json"
INPUTS = FIXTURES / "functional-replay/inputs"


def run(tmp_path, mode, command=None, timeout=10):
    directory = tmp_path / mode
    run_cases(
        MANIFEST,
        INPUTS,
        directory,
        dict(
            run_id=mode,
            scope="replay",
            release_sha="a" * 40,
            environment_id="test",
            adapter_id="synthetic",
        ),
        command or [sys.executable, str(FIXTURES / "replay_adapter.py"), mode],
        timeout,
    )
    return directory


def test_retest_compares_real_artifacts_and_preserves_stable_defect_ids(tmp_path):
    base = score(MANIFEST, run(tmp_path, "faulty"))
    current = score(MANIFEST, run(tmp_path, "fixed"))
    assert base["counts"] == {"PASS": 1, "FAIL": 3, "NOT_RUN": 0}
    assert current["counts"] == {"PASS": 4, "FAIL": 0, "NOT_RUN": 0}
    assert base["acceptance_status"] == current["acceptance_status"] == "BLOCKED"
    defects = compare_reports(base, current)
    assert len(defects) == 9 and all(d["status"] == "RESOLVED" for d in defects)
    assert all(d["before_artifact_sha256"] != d["after_artifact_sha256"] for d in defects)


def test_altered_evidence_cannot_resolve_prior_failures(tmp_path):
    baseline = score(MANIFEST, run(tmp_path, "faulty"))
    fixed_dir = run(tmp_path, "fixed")
    (fixed_dir / "artifacts/profiles-kerf.json").write_text("{}")
    r = score(MANIFEST, fixed_dir)
    defects = {d["defect_id"]: d["status"] for d in compare_reports(baseline, r)}
    assert defects["profiles-kerf:stock_balance:stock-1"] == "UNCONFIRMED"
    assert r["cases"][0]["defects"][0]["code"] == "artifact_digest_mismatch"


def test_timeout_counts_each_frozen_case_as_fail(tmp_path):
    path = run(tmp_path, "slow", command=[sys.executable, "-c", "import time; time.sleep(5)"], timeout=0.05)
    r = score(MANIFEST, path)
    assert r["counts"] == {"PASS": 0, "FAIL": 4, "NOT_RUN": 0}
    assert {case["defects"][0]["actual"] for case in r["cases"]} == {"timeout"}


def test_mismatched_manifest_is_not_scored(tmp_path):
    directory = run(tmp_path, "fixed")
    modified = tmp_path / "altered.json"
    modified.write_bytes(MANIFEST.read_bytes() + b" ")
    with pytest.raises(ValueError, match="exact frozen manifest"):
        score(modified, directory)
