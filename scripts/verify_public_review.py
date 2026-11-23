"""Verify an ET/2025/7 source-and-QA ZIP: CRC, file inventory, hashes, license and sources."""

import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile

REQUIRED = {
    "LICENSE",
    "README.md",
    "server/app.py",
    "server/demo_lab.py",
    "server/geometry.py",
    "web/src/App.tsx",
    "web/src/TestLab.tsx",
    "web/src/ProductionStudio.tsx",
    "web/package-lock.json",
    "server/tests/test_geometry.py",
    "scripts/benchmark_roof_tests.py",
    "scripts/check_electrotile_run.py",
    "scripts/run_electrotile_3d_case.py",
    "scripts/run_electrotile_production_case.py",
    "tests/fixtures/electrotile-lab/footprint-export/reference.json",
    "pyproject.toml",
    "uv.lock",
    "SOURCE_COMMIT.txt",
    "MANIFEST.json",
    "SHA256SUMS.txt",
}
DENIED_PARTS = {".git", "node_modules", ".venv", "__pycache__", "foundry", "secrets"}
DENIED_NAMES = {".env", ".env.local", "id_rsa", "private.pem"}


def verify(archive: Path) -> None:
    with ZipFile(archive) as z:
        bad = z.testzip()
        if bad:
            raise ValueError(f"Invalid ZIP CRC: {bad}")
        files = z.namelist()
        if len(files) != len(set(files)):
            raise ValueError("Duplicate paths")
        missing = REQUIRED - set(files)
        if missing:
            raise ValueError(f"Missing required files: {sorted(missing)}")
        for name in files:
            parts = Path(name).parts
            if Path(name).is_absolute() or ".." in parts:
                raise ValueError(f"Unsafe path: {name}")
            if DENIED_PARTS.intersection(parts) or Path(name).name in DENIED_NAMES:
                raise ValueError(f"Private/build files in published ZIP: {name}")
        data = json.loads(z.read("MANIFEST.json"))
        if data["schema"] != "registry9-source-review/1":
            raise ValueError("Unknown manifest version")
        version = z.read("SOURCE_COMMIT.txt").decode().strip()
        if data["source_commit"] != version:
            raise ValueError("Source SHA mismatch")
        expected_files = set(files) - {"SOURCE_COMMIT.txt", "MANIFEST.json", "SHA256SUMS.txt"}
        if set(data["file_sha256"]) != expected_files:
            raise ValueError("Source file list disagrees with manifest")
        for name, expected in data["file_sha256"].items():
            if hashlib.sha256(z.read(name)).hexdigest() != expected:
                raise ValueError(f"Hash mismatch: {name}")
        sha_list = {}
        for line in z.read("SHA256SUMS.txt").decode().splitlines():
            digest, name = line.split("  ", 1)
            sha_list[name] = digest
        if set(sha_list) != set(files) - {"SHA256SUMS.txt"}:
            raise ValueError("SHA256SUMS missing paths")
        for name, expected in sha_list.items():
            if hashlib.sha256(z.read(name)).hexdigest() != expected:
                raise ValueError(f"SHA256SUMS mismatch: {name}")
        assert "not open source" in z.read("LICENSE").decode().lower()
        print(f"PASS {archive.name}: {len(files)} files, valid SHA-256, source SHA {version}")
        print("QA source, frontend, fixtures, licence and locked dependencies present")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    verify(args.archive)
