"""Build a reviewable, runnable Electrotile bidder ZIP: full Studio, QA and source.

The ZIP is intentionally a self-contained *distribution of app files*, not a fake
portable executable. Python packages are installed from the immutable uv.lock
on first launch; frontend assets are precompiled in CI (no Node needed to run).
"""

import argparse
import hashlib
import json
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
INCLUDE_TREES = {
    "server": {".py"},
    "scripts": {".py"},
    "contracts": {".json"},
    "tests/fixtures": {".json", ".py", ".md"},
    "web/src": {".ts", ".tsx", ".css", ".json", ".svg"},
    "web/e2e": {".ts"},
    "web/dist": None,  # All compiled HTML, JS, CSS and assets.
}
SINGLE_FILES = (
    "pyproject.toml",
    "uv.lock",
    "requirements.txt",
    "web/package.json",
    "web/package-lock.json",
    "web/index.html",
    "web/tsconfig.json",
    "web/vite.config.ts",
    "web/playwright.config.ts",
    "docs/ROOF-TEST-PACK.md",
    "docs/ELECTROTILE-ACCEPTANCE.md",
    "docs/ELECTROTILE-TEST-LAB.md",
    "docs/ELECTROTILE-DELIVERY.md",
    "docs/ARCHITECTURE.md",
    "docs/UX-RELAUNCH-V2.md",
)
SUBMISSION_FILES = (
    "submission/README.md",
    "submission/START-STUDIO-WINDOWS.cmd",
    "submission/START-TESTS-WINDOWS.cmd",
    "submission/start-studio-mac-linux.sh",
    "submission/start-tests-mac-linux.sh",
)


def files_to_include() -> list[tuple[Path, str]]:
    paths: dict[str, Path] = {}
    for rel, extensions in INCLUDE_TREES.items():
        folder = ROOT / rel
        if not folder.is_dir():
            raise FileNotFoundError(f"Missing required directory: {rel}")
        for path in folder.rglob("*"):
            if not path.is_file():
                continue
            if "__pycache__" in path.parts or "node_modules" in path.parts:
                continue
            if path.name.startswith(".") or path.suffix in (".pyc", ".map"):
                continue
            if extensions is not None and path.suffix not in extensions:
                continue
            name = path.relative_to(ROOT).as_posix()
            paths[name] = path
    for rel in SINGLE_FILES:
        path = ROOT / rel
        if not path.is_file():
            raise FileNotFoundError(f"Missing required source: {rel}")
        paths[rel] = path
    for rel in SUBMISSION_FILES:
        path = ROOT / rel
        if not path.is_file():
            raise FileNotFoundError(f"Missing submission file: {rel}")
        paths[path.name if rel.startswith("submission/") else rel] = path

    for filename in ("roof-test-results.xml", "roof-benchmark.json"):
        evidence = ROOT / "dist" / filename
        if not evidence.is_file():
            raise FileNotFoundError(f"Missing signed-off clean-room evidence: {evidence}")
        paths[f"evidence/{filename}"] = evidence

    mandatory = ("web/dist/index.html", "server/app.py", "uv.lock", "START-STUDIO-WINDOWS.cmd")
    if any(name not in paths for name in mandatory):
        raise ValueError("Compiled application or local start script is absent")
    if not any(p.startswith("web/dist/assets/") and p.endswith(".js") for p in paths):
        raise ValueError("No compiled frontend JavaScript assets found")
    return [(paths[name], name) for name in sorted(paths)]


def build(destination: Path, source_sha: str) -> None:
    if not re.fullmatch(r"[a-f0-9]{40}", source_sha):
        raise ValueError("Provide the exact 40-digit commit SHA of the build")
    entries = files_to_include()
    by_sha = {name: hashlib.sha256(path.read_bytes()).hexdigest() for path, name in entries}
    manifest = {
        "schema_version": 1,
        "product": "Registry9 Engineering / Electrotile ET/2025/7",
        "package_type": "local-studio-plus-runnable-qa-and-reviewable-source",
        "source_commit": source_sha,
        "frontend_prebuilt": True,
        "local_url": "http://127.0.0.1:8765/testy",
        "initial_setup": "uv, internet on first install (Python/wheels); Node/Docker not required",
        "cloud_credentials_included": False,
        "external_services_optional": "live GUGiK address/orthophoto searches need internet",
        "files_sha256": by_sha,
    }
    destination.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(destination, "w", compression=ZIP_DEFLATED, compresslevel=8) as z:
        for path, name in entries:
            z.write(path, name)
        z.writestr("SOURCE_COMMIT.txt", source_sha + "\n")
        z.writestr(
            "MANIFEST.json",
            json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
        )
        checks = dict(by_sha)
        checks["SOURCE_COMMIT.txt"] = hashlib.sha256((source_sha + "\n").encode()).hexdigest()
        checks["MANIFEST.json"] = hashlib.sha256(
            (json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=True) + "\n").encode()
        ).hexdigest()
        z.writestr(
            "SHA256SUMS.txt",
            "".join(f"{digest}  {path}\n" for path, digest in sorted(checks.items())),
        )
    print(f"BUILD_OK {destination} {destination.stat().st_size} bytes / {len(entries)} source files")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--source-sha", required=True)
    args = parser.parse_args()
    build(args.destination, args.source_sha)
