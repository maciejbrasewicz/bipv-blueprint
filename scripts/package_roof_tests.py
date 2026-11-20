"""Build a locally runnable ZIP containing only the roof test harness and its sources."""

import argparse
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
FILES = (
    "contracts/scene.schema.json",
    "pyproject.toml",
    "server/__init__.py",
    "server/app.py",
    "server/geometry.py",
    "server/model_export.py",
    "server/models.py",
    "server/tests/test_api.py",
    "server/tests/test_geometry.py",
    "server/tests/test_planar_geometry.py",
    "web/src/example-planes.json",
    "uv.lock",
)


def build_zip(out: Path, source_sha: str) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(out, mode="w", compression=ZIP_DEFLATED) as archive:
        for relative in sorted(FILES):
            archive.write(ROOT / relative, relative)
        archive.write(ROOT / "docs" / "ROOF-TEST-PACK.md", "README.md")
        archive.writestr("SOURCE_COMMIT.txt", source_sha + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--source-sha", default="local")
    args = parser.parse_args()
    if args.source_sha != "local" and not re.fullmatch(r"[a-f0-9]{40}", args.source_sha):
        parser.error("--source-sha must be a full Git commit SHA")
    build_zip(args.output, args.source_sha)
