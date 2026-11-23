"""Run the same independent ET-PROD-01 assessment as the public test lab."""

import argparse
from pathlib import Path

from server.demo_lab import case_report, evidence_json

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="New directory for the report and evidence")
    parser.add_argument("--version", help="Git SHA of the source under test")
    args = parser.parse_args()
    version_file = Path(__file__).resolve().parents[1] / "SOURCE_COMMIT.txt"
    version = args.version or (version_file.read_text().strip() if version_file.is_file() else "local")
    report, files = case_report("production-plan", version)
    args.output.mkdir(parents=True)
    for name, data in files.items():
        (args.output / name).write_bytes(data)
    report_path = args.output / "report.json"
    report_path.write_bytes(evidence_json(report))
    result = "PASS" if report["passed"] else "FAIL"
    print(f"{report['reference']['id']}: {result} ({report_path})")
    raise SystemExit(0 if report["passed"] else 1)
