"""Run only the public Electrotile demonstration cases with fixed inputs."""

import json
from hashlib import sha256
from pathlib import Path

from fastapi import HTTPException, Request

from scripts.check_electrotile_run import PVOutput, PVReference, pv_reference_errors
from scripts.electrotile_geometry import GeometryEvidence, GeometryReference, check_geometry
from scripts.electrotile_product import ProductEvidence, ProductReference, check_product
from scripts.electrotile_studio_adapter import checked_layout, geometry_evidence

from .geo import AddressSearch, addresses, buildings
from .geo_contracts import AddressPoint
from .geometry import compute
from .model_export import export_obj
from .models import ModelExport

FIXTURES = Path(__file__).resolve().parents[1] / "tests/fixtures/electrotile-lab"
ADDRESS = "Stargard, Szczecińska 1"
TESTS = {
    "address": ("I · Lokalizacja", "Adres i budynek z GUGiK", "Dane GUGiK na żywo"),
    "pv": ("I · Dobór PV", "Liczba i typ modułów", "Silnik Studio · dane syntetyczne"),
    "obj": ("I · Geometria i moc", "Dach z otworem i fasada w OBJ", "Silnik Studio · dane syntetyczne"),
    "product": ("I–III · Integracja", "Arkusze eTile od projektu do oferty", "Odtworzenie kontrolne"),
}


def catalog() -> list[dict]:
    return [dict(id=key, criterion=parts[0], title=parts[1], source=parts[2]) for key, parts in TESTS.items()]


def compare(label: str, expected, actual, *, passed: bool | None = None) -> dict:
    return {
        "label": label,
        "expected": expected,
        "actual": actual,
        "passed": (expected == actual) if passed is None else passed,
    }


def frozen_cases(suite: str):
    directory = FIXTURES / suite
    for row in json.loads((directory / "manifest.json").read_bytes())["cases"]:
        raw = (directory / "inputs" / f"{row['id']}.json").read_bytes()
        if sha256(raw).hexdigest() != row["input_sha256"]:
            raise ValueError("Fixture does not match the frozen input")
        yield row, raw


async def check_address(request: Request) -> list[dict]:
    try:
        points = (await addresses(AddressSearch(address=ADDRESS), request))["candidates"]
        point = next((p for p in points if p.label.casefold() == ADDRESS.casefold()), None)
        results = [
            compare("Punkt adresowy UUG", ADDRESS, point.label if point else [p.label for p in points])
        ]
        if isinstance(point, AddressPoint):
            nearby = await buildings(point, request)
            count = len(nearby["candidates"])
            results.append(compare("Obrysy EGiB w promieniu 60 m", "co najmniej 1", count, passed=count > 0))
        return results
    except HTTPException as error:
        return [compare("Dostęp do UUG / EGiB", "HTTP 200", f"HTTP {error.status_code} · {error.detail}")]


def check_studio(test_id: str) -> list[dict]:
    suite = "studio-pv" if test_id == "pv" else "studio-geometry"
    results = []
    for row, raw in frozen_cases(suite):
        payload = ModelExport.model_validate_json(raw)
        data = compute(payload.scene)
        layout = checked_layout(data, payload.variant)
        if test_id == "pv":
            count = layout["module_count"]
            reference = PVReference.model_validate(row["reference"])
            output = PVOutput(
                report_sha256=sha256(json.dumps(layout).encode()).hexdigest(),
                modules_by_type={data["product"]["id"]: count} if count else {},
            )
            errors = pv_reference_errors(reference, output)
            results.append(
                compare(
                    row["id"],
                    reference.model_dump(),
                    output.modules_by_type,
                    passed=count == reference.module_count and not errors,
                )
            )
        else:
            reference = GeometryReference.model_validate_json(json.dumps(row["reference"]))
            model = export_obj(payload).encode()
            output = GeometryEvidence.model_validate(geometry_evidence(data, layout, model))
            defects = check_geometry(reference, output)
            results.append(
                compare(
                    row["id"],
                    {
                        "liczba modułów": sum(p.module_count for p in reference.planes.values()),
                        "rozbieżności": 0,
                    },
                    {
                        "liczba modułów": len(output.placements),
                        "moc kWp": output.layout_power_kwp,
                        "SHA-256 OBJ": output.obj_sha256,
                        "rozbieżności": [d.model_dump() for d in defects],
                    },
                    passed=not defects,
                )
            )
    return results


def replay_product() -> list[dict]:
    row, _ = next(frozen_cases("product-replay"))
    reference = ProductReference.model_validate_json(json.dumps(row["reference"]))
    captures = FIXTURES / "product-replay/captures"
    failed, fixed = (
        check_product(reference, ProductEvidence.model_validate_json((captures / name).read_bytes()))
        for name in ("classic-mixed-faulty.json", "classic-mixed-fixed.json")
    )
    return [
        compare(
            "Kontrola z wprowadzonymi usterkami",
            "11 wykrytych rozbieżności",
            [d.model_dump() for d in failed],
            passed=len(failed) == 11,
        ),
        compare("Retest zapisanej odpowiedzi", 0, len(fixed)),
    ]
