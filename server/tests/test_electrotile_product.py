import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

from scripts.electrotile_lab import Manifest, compare_reports, run_cases, score
from scripts.electrotile_product import ProductReference

FIXTURES = Path(__file__).parents[2] / "tests/fixtures/electrotile-lab"
SUITE = FIXTURES / "product-replay"
MANIFEST = SUITE / "manifest.json"


@pytest.fixture(scope="module")
def product_runs(tmp_path_factory):
    root = tmp_path_factory.mktemp("product-replay")
    for mode in ("faulty", "fixed"):
        run_cases(
            MANIFEST,
            SUITE / "inputs",
            root / mode,
            dict(
                run_id=mode, scope="replay", release_sha="a" * 40, environment_id="test", adapter_id="replay"
            ),
            [sys.executable, str(FIXTURES / "replay_adapter.py"), mode],
            timeout=10,
        )
    return score(MANIFEST, root / "faulty"), score(MANIFEST, root / "fixed")


def test_mixed_roof_detects_mismatches_from_design_to_offer(product_runs):
    failed, _ = product_runs
    mixed = failed["cases"][0]
    assert mixed["id"] == "classic-mixed"
    actual = {(d["code"], d["subject"]): (d["expected"], d["actual"]) for d in mixed["defects"]}
    assert actual["effective_mm", "central"] == ((1157, 820), (1191, 840))
    assert actual["active_pattern", "edge-west"] == ("half-right", "half-left")
    assert actual["trim_outside_approval", "edge-west"] == ({"left": 40}, {"right": 30})
    assert actual["string_memberships", "edge-west"] == (1, 2)
    assert actual["string_memberships", "edge-east"] == (1, 0)
    assert actual["string_memberships", "infill"] == (0, 1)
    assert actual["bom_quantity", "lab-classic-passive"] == (1, 2)
    assert actual["offer_quantity", "lab-classic-half-right"] == (1, 0)
    assert actual["design_revision", "offer"] == ("design-r2", "design-r1")


def test_passive_roof_has_no_micropanels_power_or_string_membership(product_runs):
    failed, fixed = product_runs
    passive = failed["cases"][1]
    assert passive["id"] == "classic-passive"
    assert {(d["code"], d["expected"], d["actual"]) for d in passive["defects"]} == {
        ("micropanel_count", 0, 4),
        ("stc_mwp", 0, 50_000),
        ("string_memberships", 0, 1),
    }
    assert fixed["cases"][1]["status"] == "PASS"


def test_product_retest_resolves_case_level_evidence(product_runs):
    failed, fixed = product_runs
    assert failed["counts"] == {"PASS": 0, "FAIL": 2, "NOT_RUN": 0}
    assert fixed["counts"] == {"PASS": 2, "FAIL": 0, "NOT_RUN": 0}
    assert fixed["acceptance_status"] == "BLOCKED"
    changes = compare_reports(failed, fixed)
    assert len(changes) == 14
    assert {d["status"] for d in changes} == {"RESOLVED"}


def test_frozen_catalog_rejects_a_reference_cut_on_the_active_side():
    manifest = Manifest.model_validate_json(MANIFEST.read_bytes())
    reference = manifest.cases[0].reference.model_dump()
    reference["sheets"]["edge-west"]["trim_mm"] = {"right": 1}
    with pytest.raises(ValidationError, match="exceeds the permitted trim depth"):
        ProductReference.model_validate(reference)
