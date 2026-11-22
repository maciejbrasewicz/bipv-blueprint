"""Build a locally runnable ZIP containing only the roof test harness and its sources."""

import argparse
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
FILES = (
    "contracts/catalog.v1.schema.json",
    "contracts/job.v1.schema.json",
    "contracts/scene.schema.json",
    "contracts/scene.v2.schema.json",
    "pyproject.toml",
    "scripts/benchmark_roof_tests.py",
    "scripts/check_electrotile_run.py",
    "scripts/electrotile_checks.py",
    "scripts/electrotile_geometry.py",
    "scripts/electrotile_lab.py",
    "scripts/electrotile_product.py",
    "scripts/electrotile_studio_adapter.py",
    "scripts/sync_product_contracts.py",
    "server/__init__.py",
    "server/accounts.py",
    "server/app.py",
    "server/cloud.py",
    "server/demo_lab.py",
    "server/geo.py",
    "server/geo_contracts.py",
    "server/geo_trace.py",
    "server/geometry.py",
    "server/glb_export.py",
    "server/model_export.py",
    "server/models.py",
    "server/product_contracts.py",
    "server/tests/test_account_access.py",
    "server/tests/test_api.py",
    "server/tests/test_electrotile_geometry.py",
    "server/tests/test_electrotile_run.py",
    "server/tests/test_electrotile_lab.py",
    "server/tests/test_electrotile_product.py",
    "server/tests/test_geometry.py",
    "server/tests/test_geo_trace.py",
    "server/tests/test_glb_export.py",
    "server/tests/test_geometry_regression.py",
    "server/tests/test_planar_geometry.py",
    "server/tests/test_product_contracts.py",
    "server/tests/test_roof_acceptance.py",
    "tests/fixtures/electrotile-lab/functional-replay/inputs/offer-audit-race.json",
    "tests/fixtures/electrotile-lab/functional-replay/inputs/pattern-unbuildable.json",
    "tests/fixtures/electrotile-lab/functional-replay/inputs/profiles-kerf.json",
    "tests/fixtures/electrotile-lab/functional-replay/inputs/wiring-route.json",
    "tests/fixtures/electrotile-lab/functional-replay/manifest.json",
    "tests/fixtures/electrotile-lab/geometry_control.py",
    "tests/fixtures/electrotile-lab/product-replay/inputs/classic-mixed.json",
    "tests/fixtures/electrotile-lab/product-replay/inputs/classic-passive.json",
    "tests/fixtures/electrotile-lab/product-replay/captures/classic-mixed-faulty.json",
    "tests/fixtures/electrotile-lab/product-replay/captures/classic-mixed-fixed.json",
    "tests/fixtures/electrotile-lab/product-replay/manifest.json",
    "tests/fixtures/electrotile-lab/replay_adapter.py",
    "tests/fixtures/electrotile-lab/studio-geometry/inputs/survey-facade.json",
    "tests/fixtures/electrotile-lab/studio-geometry/inputs/survey-pitched-opening.json",
    "tests/fixtures/electrotile-lab/studio-geometry/manifest.json",
    "tests/fixtures/electrotile-lab/studio-pv/inputs/pv-exact-grid.json",
    "tests/fixtures/electrotile-lab/studio-pv/inputs/pv-grid-20.json",
    "tests/fixtures/electrotile-lab/studio-pv/inputs/pv-too-small.json",
    "tests/fixtures/electrotile-lab/studio-pv/manifest.json",
    "tests/fixtures/product/catalog.json",
    "tests/fixtures/product/facade.json",
    "tests/fixtures/product/job.json",
    "tests/fixtures/product/manifest.json",
    "tests/fixtures/product/roof.json",
    "web/src/example-planes.json",
    "uv.lock",
)


EVIDENCE_FILES = ("roof-test-results.xml", "roof-benchmark.json")


def build_zip(out: Path, source_sha: str, evidence_dir: Path | None = None) -> None:
    if evidence_dir is not None:
        for name in EVIDENCE_FILES:
            if not (evidence_dir / name).is_file():
                raise FileNotFoundError(evidence_dir / name)
    out.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(out, mode="w", compression=ZIP_DEFLATED) as archive:
        for relative in sorted(FILES):
            archive.write(ROOT / relative, relative)
        archive.write(ROOT / "docs" / "ROOF-TEST-PACK.md", "README.md")
        archive.write(ROOT / "docs" / "ELECTROTILE-ACCEPTANCE.md", "PROTOKOL-ET-2025-7.md")
        archive.write(ROOT / "docs" / "ELECTROTILE-TEST-LAB.md", "docs/ELECTROTILE-TEST-LAB.md")
        archive.write(ROOT / "docs" / "ELECTROTILE-ACCEPTANCE.md", "docs/ELECTROTILE-ACCEPTANCE.md")
        archive.writestr("SOURCE_COMMIT.txt", source_sha + "\n")
        if evidence_dir is not None:
            for name in EVIDENCE_FILES:
                archive.write(evidence_dir / name, "evidence/" + name)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--source-sha", default="local")
    parser.add_argument("--evidence-dir", type=Path)
    args = parser.parse_args()
    if args.source_sha != "local" and not re.fullmatch(r"[a-f0-9]{40}", args.source_sha):
        parser.error("--source-sha must be a full Git commit SHA")
    build_zip(args.output, args.source_sha, args.evidence_dir)
