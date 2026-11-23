"""Build a clean, versioned, source-available evaluation ZIP for ET/2025/7.

The website itself remains available online. The ZIP is the *source and test
evidence*, not a fake locally deployed replacement. GitHub Actions executes on
GitHub runners, never on the evaluator's computer.

Usage: python scripts/package_public_review.py dist/Registry9-ET-2025-7-Source-and-Tests.zip --source-sha COMMIT [--evidence-dir dist]
"""

import argparse
import hashlib
import json
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]

TREE_FILES = {
    "server": {".py"},
    "scripts": {".py"},
    "contracts": {".json"},
    "tests/fixtures": {".json", ".py", ".md"},
    "web/src": {".ts", ".tsx", ".css", ".json", ".svg"},
    "web/e2e": {".ts"},
    "supabase/migrations": {".sql"},
    "supabase/tests": {".sql"},
}
SINGLE_FILES = (
    ".gitignore",
    "LICENSE",
    ".github/workflows/source-evaluation.yml",
    ".github/workflows/evaluation-release.yml",
    "README.md",
    "Dockerfile",
    "pyproject.toml",
    "requirements.txt",
    "uv.lock",
    "web/package.json",
    "web/package-lock.json",
    "web/index.html",
    "web/tsconfig.json",
    "web/vite.config.ts",
    "web/playwright.config.ts",
    "docs/ELECTROTILE-ACCEPTANCE.md",
    "docs/ELECTROTILE-DELIVERY.md",
    "docs/ELECTROTILE-TEST-LAB.md",
    "docs/ELECTROTILE-TEST-ARCHITECTURE.md",
    "docs/ROOF-TEST-PACK.md",
    "docs/ET-2025-7-REVIEWER.md",
    "docs/ARCHITECTURE.md",
    "docs/UX-RELAUNCH-V2.md",
)
OPTIONAL_EVIDENCE = ("roof-test-results.xml", "roof-benchmark.json")


def choose_files() -> dict[str, Path]:
    selected: dict[str, Path] = {}
    for tree, extensions in TREE_FILES.items():
        root = ROOT / tree
        if not root.is_dir():
            raise FileNotFoundError(root)
        for item in root.rglob("*"):
            if not item.is_file() or item.name.startswith("."):
                continue
            if item.suffix not in extensions or {"__pycache__", "node_modules"} & set(item.parts):
                continue
            relative = item.relative_to(ROOT).as_posix()
            selected[relative] = item
    for relative in SINGLE_FILES:
        item = ROOT / relative
        if not item.is_file():
            raise FileNotFoundError(item)
        selected[relative] = item
    return dict(sorted(selected.items()))


def archive(destination: Path, source_sha: str, evidence_dir: Path | None) -> None:
    if re.fullmatch(r"[0-9a-f]{40}", source_sha) is None:
        raise ValueError("Specify an exact, full 40-digit Git commit SHA")

    files = choose_files()
    if evidence_dir is not None:
        for name in OPTIONAL_EVIDENCE:
            path = evidence_dir / name
            if not path.is_file():
                raise FileNotFoundError(path)
            files[f"evidence/{name}"] = path
    manifest = {
        "schema": "registry9-source-review/1",
        "source_commit": source_sha,
        "distribution": "public-source-available-evaluation-not-open-source",
        "scope": "BIPV Studio sources, independent roof/BIPV QA, test fixtures, docs and dependency locks",
        "platform_url": "https://bipv-studio-production.up.railway.app/",
        "test_lab_url": "https://bipv-studio-production.up.railway.app/testy",
        "local_execution": "Python 3.12 + uv; uv sync --frozen --dev && uv run --frozen pytest -q",
        "github_actions": "Runs in GitHub CI only; this ZIP contains the test source, not the CI runner",
        "file_sha256": {rel: hashlib.sha256(path.read_bytes()).hexdigest() for rel, path in sorted(files.items())},
    }
    manifest_bytes = (json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode()
    version_bytes = (source_sha + "\n").encode()
    sums = dict(manifest["file_sha256"])
    sums["MANIFEST.json"] = hashlib.sha256(manifest_bytes).hexdigest()
    sums["SOURCE_COMMIT.txt"] = hashlib.sha256(version_bytes).hexdigest()

    destination.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(destination, "w", ZIP_DEFLATED, compresslevel=8) as out:
        for rel, path in files.items():
            out.write(path, rel)
        out.writestr("MANIFEST.json", manifest_bytes)
        out.writestr("SOURCE_COMMIT.txt", version_bytes)
        out.writestr("SHA256SUMS.txt", "".join(f"{sha}  {rel}\n" for rel, sha in sorted(sums.items())))
    print(f"Source review ZIP: {destination}; {len(files)} files; {destination.stat().st_size} bytes")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--evidence-dir", type=Path)
    args = parser.parse_args()
    archive(args.destination, args.source_sha, args.evidence_dir)
