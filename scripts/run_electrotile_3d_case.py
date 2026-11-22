"""Export and independently check the reproducible ET-3D-01 case."""

import argparse
import json
from pathlib import Path

from server.demo_lab import footprint_report

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="New directory for the report and model files")
    parser.add_argument("--version", help="Git SHA of the source under test")
    args = parser.parse_args()

    packaged_version = Path(__file__).resolve().parents[1] / "SOURCE_COMMIT.txt"
    version = args.version or (
        packaged_version.read_text().strip() if packaged_version.is_file() else "local"
    )
    report, files = footprint_report(version)
    args.output.mkdir(parents=True, exist_ok=False)
    for name, data in files.items():
        (args.output / name).write_bytes(data)
    (args.output / "report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    result = "PASS" if report["passed"] else "FAIL"
    print(f"{report['reference']['id']}: {result} ({args.output / 'report.json'})")
    raise SystemExit(0 if report["passed"] else 1)
