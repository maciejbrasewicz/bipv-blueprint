"""Run or evaluate ET/2025/7 functional cases outside the product's CI."""

import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from time import perf_counter_ns
from typing import Annotated, Literal

from pydantic import Field, ValidationError, model_validator

from .check_electrotile_run import (
    SECOND_NS,
    THRESHOLDS_S,
    CaseID,
    Commit,
    Digest,
    FormatVersion,
    PVOutput,
    PVReference,
    Record,
    Tick,
    pv_reference_errors,
    unique_json,
)
from .electrotile_checks import (
    Defect,
    HarnessObserved,
    HarnessReference,
    MaterialsObserved,
    MaterialsReference,
    Rejection,
    RejectionReference,
    WorkflowObserved,
    WorkflowReference,
    check_harness,
    check_materials,
    check_workflow,
)

Scope = Literal["studio-fixture", "replay", "client-live"]


class Scenario(Record):
    id: CaseID
    input_sha256: Digest


class PVCase(Scenario):
    criterion: Literal["I-02"]
    reference: PVReference


class MaterialsCase(Scenario):
    criterion: Literal["II-01"]
    reference: MaterialsReference


class HarnessCase(Scenario):
    criterion: Literal["II-02"]
    reference: HarnessReference


class WorkflowCase(Scenario):
    criterion: Literal["III-01"]
    reference: WorkflowReference


class RejectionCase(Scenario):
    criterion: Literal["II-01-rejection", "II-02-rejection"]
    reference: RejectionReference


Case = Annotated[
    PVCase | MaterialsCase | HarnessCase | WorkflowCase | RejectionCase, Field(discriminator="criterion")
]


class Manifest(Record):
    version: FormatVersion
    dataset_id: CaseID
    cases: list[Case] = Field(min_length=1, max_length=1000)

    @model_validator(mode="after")
    def case_ids_are_distinct(self):
        if len({case.id for case in self.cases}) != len(self.cases):
            raise ValueError("Frozen case IDs must be distinct")
        return self


class Observation(Record):
    id: CaseID
    input_sha256: Digest
    started_ns: Tick
    finished_ns: Tick | None = None
    output_sha256: Digest | None = None
    adapter_result: Literal["ok", "timeout", "error"] | None = None

    @model_validator(mode="after")
    def timestamps_and_outcome(self):
        if self.finished_ns is None:
            if self.output_sha256 is not None or self.adapter_result is not None:
                raise ValueError("An open observation cannot contain a result")
        elif self.finished_ns < self.started_ns or self.adapter_result is None:
            raise ValueError("A closed observation needs ordered timestamps and a result")
        if (self.adapter_result == "ok") != (self.output_sha256 is not None):
            raise ValueError("A successful adapter result requires the captured output hash")
        return self


class Capture(Record):
    version: FormatVersion
    run_id: CaseID
    scope: Scope
    release_sha: Commit
    environment_id: CaseID
    adapter_id: CaseID
    manifest_sha256: Digest
    observations: list[Observation] = Field(max_length=1000)

    @model_validator(mode="after")
    def observation_ids_are_distinct(self):
        if len({item.id for item in self.observations}) != len(self.observations):
            raise ValueError("Observation IDs must be distinct")
        return self


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def document(model, path: Path):
    return model.model_validate_json(unique_json(path.read_bytes()))


def write_json(path: Path, result: dict) -> None:
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(
        json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8"
    )
    temp.replace(path)


def observation_defects(case: Case, observation: Observation, artifact_dir: Path) -> list[Defect]:
    def failure(code, expected, actual):
        return [Defect(code=code, subject="evidence", expected=expected, actual=actual)]

    if observation.input_sha256 != case.input_sha256:
        return failure("input_digest_mismatch", case.input_sha256, observation.input_sha256)
    if observation.finished_ns is None or observation.adapter_result != "ok":
        return failure("adapter_incomplete", "ok", observation.adapter_result)
    path = artifact_dir / f"{case.id}.json"
    try:
        raw = path.read_bytes()
    except OSError:
        return failure("missing_artifact", path.name, None)
    if digest(raw) != observation.output_sha256:
        return failure("artifact_digest_mismatch", observation.output_sha256, digest(raw))
    methods = {
        "II-01": (MaterialsObserved, check_materials),
        "II-02": (HarnessObserved, check_harness),
        "III-01": (WorkflowObserved, check_workflow),
    }
    try:
        raw = unique_json(raw)
        if isinstance(case, RejectionCase):
            outcome = Rejection.model_validate_json(raw)
            if outcome.rejection_code in case.reference.rejection_codes:
                return []
            return failure("wrong_rejection", case.reference.rejection_codes, outcome.rejection_code)
        if isinstance(case, PVCase):
            pv = PVOutput.model_validate_json(raw)
            defects = [
                Defect(
                    code=code,
                    subject="layout",
                    expected=case.reference.model_dump(),
                    actual=pv.modules_by_type,
                )
                for code in pv_reference_errors(case.reference, pv)
            ]
            limit = THRESHOLDS_S["I-02"][1] * SECOND_NS
            elapsed = observation.finished_ns - observation.started_ns
            if elapsed > limit:
                defects.append(
                    Defect(code="time_limit_exceeded", subject="layout", expected=limit, actual=elapsed)
                )
            return defects
        model, check = methods[case.criterion]
        observed = model.model_validate_json(raw)
    except (ValidationError, ValueError):
        return failure("malformed_artifact", "normalized JSON export", path.name)
    return check(case.reference, observed)


def score(manifest_path: Path, run_dir: Path) -> dict:
    manifest_bytes = unique_json(manifest_path.read_bytes())
    frozen = Manifest.model_validate_json(manifest_bytes)
    capture = document(Capture, run_dir / "capture.json")
    if capture.manifest_sha256 != digest(manifest_bytes):
        raise ValueError("Capture does not use this exact frozen manifest")
    rows = {row.id: row for row in capture.observations}
    if rows.keys() - {case.id for case in frozen.cases}:
        raise ValueError("Capture includes non-frozen case IDs")
    outcomes = []
    for case in frozen.cases:
        row = rows.get(case.id)
        differences = observation_defects(case, row, run_dir / "artifacts") if row else []
        status = "FAIL" if differences else "PASS" if row else "NOT_RUN"
        defects = {f"{case.id}:{d.code}:{d.subject}": d.model_dump() for d in differences}
        outcomes.append(
            {
                "id": case.id,
                "criterion": case.criterion,
                "input_sha256": case.input_sha256,
                "status": status,
                "output_sha256": row.output_sha256 if row else None,
                "artifact": f"artifacts/{case.id}.json" if row and row.output_sha256 else None,
                "elapsed_ns": row.finished_ns - row.started_ns
                if row and row.finished_ns is not None
                else None,
                "defects": [{"id": key, **details} for key, details in defects.items()],
            }
        )
    counts = {name: sum(row["status"] == name for row in outcomes) for name in ("PASS", "FAIL", "NOT_RUN")}
    status = "FAIL" if counts["FAIL"] else "NOT_RUN" if counts["NOT_RUN"] else "PASS"
    return {
        "dataset_id": frozen.dataset_id,
        "run_id": capture.run_id,
        "scope": capture.scope,
        "release_sha": capture.release_sha,
        "environment_id": capture.environment_id,
        "adapter_id": capture.adapter_id,
        "manifest_sha256": capture.manifest_sha256,
        "assessment_status": status,
        "acceptance_status": "REVIEW_REQUIRED"
        if capture.scope == "client-live" and status == "PASS"
        else status
        if capture.scope == "client-live"
        else "BLOCKED",
        "counts": counts,
        "cases": outcomes,
    }


def compare_reports(prior: dict, current: dict) -> list[dict]:
    criteria = ["manifest_sha256", "scope", "environment_id", "adapter_id"]
    if any(prior[key] != current[key] for key in criteria):
        raise ValueError("Retest requires the same manifest, scope, environment and adapter")
    if prior["run_id"] == current["run_id"]:
        raise ValueError("Retest requires a new run ID")
    previously = {row["id"]: row for row in prior["cases"]}
    changes = []
    for row in current["cases"]:
        before = previously[row["id"]]
        after_ids = {item["id"] for item in row["defects"]}
        for defect in before["defects"]:
            id_ = defect["id"]
            # An invalid, missing or incomplete observation cannot close a physical or workflow defect.
            closed = row["status"] == "PASS" and id_ not in after_ids
            changes.append(
                {
                    "defect_id": id_,
                    "status": "RESOLVED"
                    if closed
                    else "STILL_PRESENT"
                    if id_ in after_ids
                    else "UNCONFIRMED",
                    "before_artifact_sha256": before["output_sha256"],
                    "after_artifact_sha256": row["output_sha256"],
                }
            )
    return changes


def run_cases(
    manifest_path: Path, inputs_dir: Path, run_dir: Path, metadata: dict, adapter: list[str], timeout: float
):
    manifest_bytes = unique_json(manifest_path.read_bytes())
    frozen = Manifest.model_validate_json(manifest_bytes)
    capture = Capture(version=1, manifest_sha256=digest(manifest_bytes), observations=[], **metadata)
    paths = {case.id: inputs_dir / f"{case.id}.json" for case in frozen.cases}
    for case in frozen.cases:
        if digest(paths[case.id].read_bytes()) != case.input_sha256:
            raise ValueError(f"Input differs from the frozen manifest for {case.id}")
    run_dir.mkdir(parents=True, exist_ok=False)
    (run_dir / "manifest.json").write_bytes(manifest_bytes)
    artifacts = run_dir / "artifacts"
    artifacts.mkdir()
    capture_file = run_dir / "capture.json"
    for case in frozen.cases:
        raw = paths[case.id].read_bytes()
        if digest(raw) != case.input_sha256:
            raise ValueError(f"Frozen input changed during capture for {case.id}")
        started = perf_counter_ns()
        capture.observations.append(
            Observation(id=case.id, input_sha256=case.input_sha256, started_ns=started)
        )
        write_json(capture_file, capture.model_dump())
        output_sha256 = None
        try:
            result = subprocess.run(
                [*adapter, case.criterion, case.id],
                input=raw,
                capture_output=True,
                timeout=timeout,
                check=False,
            )
            state = "ok" if result.returncode == 0 else "error"
            if state == "ok":
                (artifacts / f"{case.id}.json").write_bytes(result.stdout)
                output_sha256 = digest(result.stdout)
        except subprocess.TimeoutExpired:
            state = "timeout"
        except OSError:
            state = "error"
        capture.observations[-1] = Observation(
            id=case.id,
            input_sha256=case.input_sha256,
            started_ns=started,
            finished_ns=perf_counter_ns(),
            output_sha256=output_sha256,
            adapter_result=state,
        )
        write_json(capture_file, capture.model_dump())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    run = commands.add_parser("run", help="Run an explicitly supplied adapter for a frozen set of inputs")
    run.add_argument("manifest", type=Path)
    run.add_argument("inputs_dir", type=Path)
    run.add_argument("run_dir", type=Path)
    for name in ("run-id", "scope", "release-sha", "environment-id", "adapter-id"):
        run.add_argument(f"--{name}", required=True)
    run.add_argument("--timeout", type=float, default=60)
    run.add_argument(
        "--adapter", nargs=argparse.REMAINDER, required=True, help="Command and arguments; place last"
    )

    inspect = commands.add_parser(
        "score", help="Evaluate a captured run or compare a retest against a baseline"
    )
    inspect.add_argument("manifest", type=Path)
    inspect.add_argument("run_dir", type=Path)
    inspect.add_argument("--baseline", type=Path, help="Directory of the previous raw capture")
    inspect.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "run":
            if not args.adapter or not 0 < args.timeout <= 600:
                raise ValueError("Specify an adapter and a timeout in (0,600] seconds")
            metadata = {
                key: getattr(args, key)
                for key in ("run_id", "scope", "release_sha", "environment_id", "adapter_id")
            }
            run_cases(args.manifest, args.inputs_dir, args.run_dir, metadata, args.adapter, args.timeout)
        report = score(args.manifest, args.run_dir)
        if args.command == "score" and args.baseline:
            baseline = score(args.manifest, args.baseline)
            report["retest"] = {
                "baseline_run_id": baseline["run_id"],
                "baseline_release_sha": baseline["release_sha"],
                "defects": compare_reports(baseline, report),
            }
        output = args.run_dir / "report.json" if args.command == "run" else args.output
        if output:
            write_json(output, report)
        else:
            print(json.dumps(report, indent=2, ensure_ascii=False))
    except ValidationError as exc:
        parser.error(str(exc.errors(include_input=False, include_url=False, include_context=False)))
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    return 0 if report["assessment_status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
