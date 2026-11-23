"""Independent integrity/content verifier for distributable local BIPV Studio ZIP."""

import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile


def verify(archive: Path) -> None:
    required = {
        "README.md",
        "START-STUDIO-WINDOWS.cmd",
        "START-TESTS-WINDOWS.cmd",
        "start-studio-mac-linux.sh",
        "start-tests-mac-linux.sh",
        "web/dist/index.html",
        "server/app.py",
        "server/demo_lab.py",
        "web/src/App.tsx",
        "web/src/TestLab.tsx",
        "scripts/run_local_studio.py",
        "scripts/run_local_checks.py",
        "uv.lock",
        "pyproject.toml",
        "MANIFEST.json",
        "SOURCE_COMMIT.txt",
        "SHA256SUMS.txt",
    }
    with ZipFile(archive) as z:
        bad = z.testzip()
        if bad:
            raise ValueError(f"ZIP CRC failure: {bad}")
        names = z.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Duplicate filenames in ZIP")
        missing = required - set(names)
        if missing:
            raise ValueError(f"Required files absent: {sorted(missing)}")
        if not any(name.startswith("web/dist/assets/") and name.endswith(".js") for name in names):
            raise ValueError("Compiled frontend JS missing")
        if any(".env" in name or "node_modules/" in name or ".git/" in name for name in names):
            raise ValueError("Unexpected secret/build/tool directory in ZIP")
        manifest = json.loads(z.read("MANIFEST.json"))
        hashes = manifest["files_sha256"]
        if set(hashes) != set(names) - {"MANIFEST.json", "SOURCE_COMMIT.txt", "SHA256SUMS.txt"}:
            raise ValueError("Manifest file inventory does not match archive")
        for filename, expected in hashes.items():
            observed = hashlib.sha256(z.read(filename)).hexdigest()
            if observed != expected:
                raise ValueError(f"SHA-256 mismatch: {filename}")
        commit = z.read("SOURCE_COMMIT.txt").decode().strip()
        if manifest["source_commit"] != commit:
            raise ValueError("Source SHA disagrees with manifest")
        checksums = dict(line.rstrip("\n").split("  ", 1)[::-1] for line in z.read("SHA256SUMS.txt").decode().splitlines())
        if set(checksums) != set(names) - {"SHA256SUMS.txt"}:
            raise ValueError("SHA256SUMS inventory incomplete")
        for filename, expected in checksums.items():
            if hashlib.sha256(z.read(filename)).hexdigest() != expected:
                raise ValueError(f"SHA256SUMS mismatch: {filename}")
        print(f"VALID ZIP: {archive.name}; {len(names)} files; SHA {commit}")
        print(f"Compiled assets: {sum(1 for n in names if n.startswith('web/dist/assets/'))}")
        print("Integrity verification: PASS")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    verify(args.archive)
