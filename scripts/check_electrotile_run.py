"""Score a closed ET/2025/7 capture against an independently frozen test manifest."""

import argparse
import hashlib
import json
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError

SECOND_NS = 1_000_000_000
THRESHOLDS_S = {
    "I-01": (300, 900),
    "I-02": (60, 120),
    "N-01": (300, 500),
    "III-02": (None, 21_600),
}
CaseID = Annotated[str, Field(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$")]
Digest = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
Commit = Annotated[str, Field(pattern=r"^[a-f0-9]{40}$")]
Tick = Annotated[int, Field(ge=0, le=2**63 - 1)]
Count = Annotated[int, Field(gt=0)]
Criterion = Literal["I-01", "I-02", "N-01", "III-02"]
ImageSource = Literal["satellite", "orthophoto", "lidar", "terrestrial-photo", "other"]
FormatVersion = Annotated[int, Field(ge=1, le=1)]


class Record(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Manifest(Record):
    version: FormatVersion
    dataset_id: CaseID
    case_ids: Annotated[list[CaseID], Field(min_length=1, max_length=1000)]
    inputs_sha256: dict[CaseID, Digest]


class ReconstructionPlan(Manifest):
    criterion: Literal["I-01"]
    voivodeship_id: CaseID
    sampling_seed: Annotated[int, Field(ge=0)]
    population_sha256: Digest


class PVReference(Record):
    module_count: Annotated[int, Field(ge=0)]
    accepted_type_sets: Annotated[list[list[CaseID]], Field(min_length=1)]


class PVPlan(Manifest):
    criterion: Literal["I-02"]
    catalog_id: CaseID
    references: dict[CaseID, PVReference]


class QueuePlan(Manifest):
    criterion: Literal["N-01"]
    cache: Literal["cold", "warm"]


class OfferPlan(Manifest):
    criterion: Literal["III-02"]


TestPlan = Annotated[ReconstructionPlan | PVPlan | QueuePlan | OfferPlan, Field(discriminator="criterion")]


class Observation(Record):
    case_id: CaseID
    input_sha256: Digest
    started_ns: Tick
    finished_ns: Tick | None = None


class ReconstructionOutput(Record):
    model_sha256: Digest
    geometry_review_sha256: Digest
    geometry_valid: bool
    geometry_sources: Annotated[list[ImageSource], Field(min_length=1)]


class ReconstructionObservation(Observation):
    output: ReconstructionOutput | None = None


class PVOutput(Record):
    report_sha256: Digest
    modules_by_type: dict[CaseID, Count]


class PVObservation(Observation):
    output: PVOutput | None = None


class QueueOutput(Record):
    image_sha256: Digest
    source: ImageSource
    preprocessed: bool
    matches_case: bool


class QueueObservation(Observation):
    output: QueueOutput | None = None


class OfferOutput(Record):
    quote_sha256: Digest
    profitability_sha256: Digest
    visualization_sha256: Digest


class OfferObservation(Observation):
    output: OfferOutput | None = None
    active_ns: Tick | None = None


class Capture(Record):
    version: FormatVersion
    run_id: CaseID
    scope: Literal["studio-fixture", "replay", "client-live"]
    release_sha: Commit
    manifest_sha256: Digest
    environment_id: CaseID
    observer_id: CaseID
    closed_ns: Tick


class ReconstructionCapture(Capture):
    criterion: Literal["I-01"]
    observations: Annotated[list[ReconstructionObservation], Field(max_length=10)]


class PVCapture(Capture):
    criterion: Literal["I-02"]
    observations: Annotated[list[PVObservation], Field(max_length=1000)]


class QueueCapture(Capture):
    criterion: Literal["N-01"]
    cache: Literal["cold", "warm"]
    observations: Annotated[list[QueueObservation], Field(max_length=20)]


class OfferCapture(Capture):
    criterion: Literal["III-02"]
    observations: Annotated[list[OfferObservation], Field(max_length=1000)]


TestCapture = Annotated[
    ReconstructionCapture | PVCapture | QueueCapture | OfferCapture, Field(discriminator="criterion")
]
CaseObservation = ReconstructionObservation | PVObservation | QueueObservation | OfferObservation


def validate_inputs(plan: TestPlan, capture: TestCapture) -> dict[str, CaseObservation]:
    if plan.criterion != capture.criterion:
        raise ValueError("manifest and capture refer to different criteria")
    case_ids = set(plan.case_ids)
    if len(case_ids) != len(plan.case_ids):
        raise ValueError("manifest contains duplicate case IDs")
    if set(plan.inputs_sha256) != case_ids:
        raise ValueError("manifest input digests must match the frozen case IDs")
    if isinstance(plan, ReconstructionPlan | QueuePlan) and len(set(plan.inputs_sha256.values())) != len(
        case_ids
    ):
        raise ValueError("address samples cannot reuse an identical frozen input")
    if isinstance(plan, ReconstructionPlan) and len(case_ids) != 10:
        raise ValueError("I-01 requires ten distinct frozen cases")
    if isinstance(plan, QueuePlan) and (
        len(case_ids) != 20 or not isinstance(capture, QueueCapture) or plan.cache != capture.cache
    ):
        raise ValueError("N-01 requires twenty distinct frozen cases and the planned cache mode")
    if isinstance(plan, PVPlan):
        if set(plan.references) != case_ids:
            raise ValueError("I-02 references must match the frozen case IDs")
        for reference in plan.references.values():
            for types in reference.accepted_type_sets:
                if len(types) != len(set(types)) or bool(reference.module_count) != bool(types):
                    raise ValueError("I-02 has an inconsistent reference count or accepted types")
    observations = {}
    for row in capture.observations:
        if row.case_id not in case_ids or row.case_id in observations:
            raise ValueError("capture contains an unknown or duplicate case ID")
        if row.input_sha256 != plan.inputs_sha256[row.case_id]:
            raise ValueError("observed input differs from the frozen input")
        if row.finished_ns is None:
            if row.started_ns > capture.closed_ns or row.output is not None:
                raise ValueError("incomplete result must start before closure and have no published output")
        elif not row.started_ns <= row.finished_ns <= capture.closed_ns:
            raise ValueError("timestamps must be ordered on a single clock within the capture")
        if isinstance(row, OfferObservation) and row.active_ns is not None:
            if row.finished_ns is None or row.active_ns > row.finished_ns - row.started_ns:
                raise ValueError("operator active time exceeds observed wall time")
        observations[row.case_id] = row
    return observations


def timing(criterion: Criterion, duration: int | None) -> dict:
    target, limit = THRESHOLDS_S[criterion]
    beyond_target = duration is not None and target is not None and duration > target * SECOND_NS
    return {
        "elapsed_ns": duration,
        "target_s": target,
        "limit_s": limit,
        "target_missed": beyond_target,
        "target_overrun_ns": duration - target * SECOND_NS if beyond_target else 0,
    }


def pv_reference_errors(expected: PVReference, output: PVOutput) -> list[str]:
    count = sum(output.modules_by_type.values())
    errors = []
    # Multiplication keeps the inclusive 20% boundary exact even for large counts.
    if abs(count - expected.module_count) * 5 > expected.module_count:
        errors.append("count_deviation_over_20_percent")
    if set(output.modules_by_type) not in [set(types) for types in expected.accepted_type_sets]:
        errors.append("pv_types_mismatch")
    return errors


def score_case(plan: TestPlan, row: CaseObservation | None, case_id: str) -> dict:
    result = {"case_id": case_id, "input_sha256": plan.inputs_sha256[case_id]}
    if row is None:
        return {**result, "status": "NOT_RUN", "reasons": ["no_observation"]}
    result.update(started_ns=row.started_ns, finished_ns=row.finished_ns)
    if row.finished_ns is None:
        return {**result, "status": "FAIL", "reasons": ["no_finished_result"]}

    duration = row.finished_ns - row.started_ns
    measurement = timing(plan.criterion, duration) if plan.criterion != "N-01" else {"elapsed_ns": duration}
    errors = []
    if plan.criterion != "N-01" and duration > THRESHOLDS_S[plan.criterion][1] * SECOND_NS:
        errors.append("time_limit_exceeded")
    output = row.output
    if output is None:
        errors.append("missing_output")
    elif isinstance(row, ReconstructionObservation):
        if set(output.geometry_sources) != {"satellite"}:
            errors.append("non_satellite_geometry_source")
        if not output.geometry_valid:
            errors.append("geometry_review_failed")
    elif isinstance(row, PVObservation):
        expected = plan.references[case_id]
        count = sum(output.modules_by_type.values())
        deviation = abs(count - expected.module_count)
        errors.extend(pv_reference_errors(expected, output))
        result.update(
            reference_count=expected.module_count,
            module_count=count,
            absolute_count_deviation=deviation,
            expected_type_sets=expected.accepted_type_sets,
            modules_by_type=output.modules_by_type,
        )
    elif isinstance(row, QueueObservation):
        if output.source != "satellite" or not output.preprocessed or not output.matches_case:
            errors.append("preprocessed_satellite_image_invalid")
    elif isinstance(row, OfferObservation) and row.active_ns is not None:
        result.update(active_ns=row.active_ns, waiting_ns=duration - row.active_ns)
    return {**result, **measurement, "status": "FAIL" if errors else "PASS", "reasons": errors}


def score_queue(cases: list[dict], observations: dict[str, CaseObservation]) -> dict:
    if not observations:
        return {"status": "NOT_RUN", "reasons": ["batch_not_started"], **timing("N-01", None)}
    owners = {}
    for case in cases:
        row = observations.get(case["case_id"])
        if isinstance(row, QueueObservation) and row.output is not None and case["status"] == "PASS":
            owners.setdefault(row.output.image_sha256, []).append(case)
    for linked_cases in owners.values():
        if len(linked_cases) > 1:
            for case in linked_cases:
                case["status"] = "FAIL"
                case["reasons"].append("identical_image_for_distinct_cases")
    if any(case["status"] != "PASS" for case in cases):
        return {"status": "FAIL", "reasons": ["batch_incomplete_or_invalid"], **timing("N-01", None)}
    elapsed = max(row.finished_ns for row in observations.values()) - min(
        row.started_ns for row in observations.values()
    )
    within_limit = elapsed <= THRESHOLDS_S["N-01"][1] * SECOND_NS
    return {
        **timing("N-01", elapsed),
        "status": "PASS" if within_limit else "FAIL",
        "reasons": [] if within_limit else ["time_limit_exceeded"],
    }


def unique_json(raw: bytes):
    def object_pairs(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate JSON field")
            result[key] = value
        return result

    # Validate the original JSON to preserve strict JSON types in Pydantic.
    json.loads(raw, object_pairs_hook=object_pairs)
    return raw


def evaluate(manifest_bytes: bytes, capture_bytes: bytes) -> dict:
    plan = TypeAdapter(TestPlan).validate_json(unique_json(manifest_bytes))
    capture = TypeAdapter(TestCapture).validate_json(unique_json(capture_bytes))
    manifest_hash = hashlib.sha256(manifest_bytes).hexdigest()
    if capture.manifest_sha256 != manifest_hash:
        raise ValueError("capture does not reference these exact manifest bytes")
    observations = validate_inputs(plan, capture)
    cases = [score_case(plan, observations.get(case_id), case_id) for case_id in plan.case_ids]
    if plan.criterion == "N-01":
        batch = score_queue(cases, observations)
        status = batch["status"]
    else:
        batch = None
        statuses = {case["status"] for case in cases}
        status = "FAIL" if "FAIL" in statuses else "NOT_RUN" if "NOT_RUN" in statuses else "PASS"
    acceptance_status = status
    if capture.scope != "client-live":
        acceptance_status = "BLOCKED"
    elif status == "PASS":
        acceptance_status = "REVIEW_REQUIRED"
    summary = {
        outcome: sum(case["status"] == outcome for case in cases) for outcome in ("PASS", "FAIL", "NOT_RUN")
    }
    return {
        "version": 1,
        "criterion": plan.criterion,
        "dataset_id": plan.dataset_id,
        "run_id": capture.run_id,
        "scope": capture.scope,
        "release_sha": capture.release_sha,
        "environment_id": capture.environment_id,
        "observer_id": capture.observer_id,
        "manifest_sha256": manifest_hash,
        "capture_sha256": hashlib.sha256(capture_bytes).hexdigest(),
        "assessment_status": status,
        "acceptance_status": acceptance_status,
        **({"cache": plan.cache} if isinstance(plan, QueuePlan) else {}),
        "case_counts": summary,
        "batch": batch,
        "cases": cases,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("capture", type=Path)
    parser.add_argument("--output", type=Path, help="Write the JSON report to this path instead of stdout.")
    args = parser.parse_args()
    try:
        report = evaluate(args.manifest.read_bytes(), args.capture.read_bytes())
        payload = json.dumps(report, indent=2, allow_nan=False) + "\n"
        if args.output:
            args.output.write_text(payload, encoding="utf-8")
        else:
            print(payload, end="")
    except ValidationError as error:
        parser.error(str(error.errors(include_input=False, include_url=False, include_context=False)))
    except (OSError, ValueError) as error:
        parser.error(str(error))
    return 0 if report["assessment_status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
