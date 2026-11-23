"""Run fresh local Electrotile roof/production verification with durable artifacts."""

import argparse
import json
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]


def execute(name: str, args: list[str], folder: Path) -> int:
    print(f"\n=== {name} ===", flush=True)
    print("COMMAND:", " ".join(args), flush=True)
    with (folder / f"{name}.log").open("w", encoding="utf-8") as log:
        result = subprocess.run(
            args,
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        log.write(result.stdout)
        print(result.stdout[-12000:], flush=True)
    return result.returncode


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "wyniki-lokalne")
    args = parser.parse_args()
    name = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid4().hex[:6]
    directory = args.output / name
    directory.mkdir(parents=True, exist_ok=False)
    executable = sys.executable
    commands = [
        ("python-tests", [executable, "-m", "pytest", "-q", "--junitxml", str(directory / "junit.xml")]),
        (
            "benchmark",
            [executable, "-m", "scripts.benchmark_roof_tests", "--output", str(directory / "benchmark.json")],
        ),
        (
            "model-3d",
            [executable, "-m", "scripts.run_electrotile_3d_case", str(directory / "et-3d-01")],
        ),
        (
            "production",
            [executable, "-m", "scripts.run_electrotile_production_case", str(directory / "et-prod-01")],
        ),
    ]
    outcomes = {name: execute(name, command, directory) for name, command in commands}
    manifest = {
        "scope": "locally executed own BIPV Studio/fixture tests, not customer acceptance",
        "source_commit": (ROOT / "SOURCE_COMMIT.txt").read_text().strip(),
        "utc_time": datetime.now(UTC).isoformat(),
        "results": outcomes,
    }
    (directory / "run.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"\nWYNIKI: {directory}")
    print("STATUS:", "PASS" if all(code == 0 for code in outcomes.values()) else "FAIL")
    return 0 if all(code == 0 for code in outcomes.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
