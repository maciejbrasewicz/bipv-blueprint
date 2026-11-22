"""Run only the public Electrotile demonstration cases with fixed inputs."""

import json
import time
from base64 import b64encode
from datetime import UTC, datetime
from hashlib import sha256
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, Request

from scripts.check_electrotile_run import PVOutput, PVReference, pv_reference_errors
from scripts.electrotile_footprint_export import ASSUMED_HEIGHT_M, wall_evidence
from scripts.electrotile_geometry import GeometryEvidence, GeometryReference, check_geometry
from scripts.electrotile_studio_adapter import checked_layout, geometry_evidence

from .geo import AddressSearch, BuildingSearch, addresses, buildings
from .geo_contracts import AddressPoint
from .geo_trace import FootprintSceneInput, scene_from_footprint
from .geometry import compute
from .glb_export import export_glb
from .model_export import export_obj
from .product_contracts import ModelExport

FIXTURES = Path(__file__).resolve().parents[1] / "tests/fixtures/electrotile-lab"
ADDRESS = "Stargard, Szczecińska 1"
TESTS = {
    "footprint-export": (
        "I · Geometria i eksport",
        "Ściany budynku w OBJ i GLB",
        "Studio · obrys kontrolny z dziedzińcem",
    ),
    "address": ("I · Lokalizacja", "Adres i budynek z GUGiK", "Dane GUGiK na żywo"),
    "pv": ("I · Dobór PV", "Liczba i typ modułów", "Silnik Studio · dane syntetyczne"),
    "obj": ("I · Geometria i moc", "Dach z otworem i fasada w OBJ", "Silnik Studio · dane syntetyczne"),
}


REQUIREMENTS = (
    (
        "I-01",
        "Model 3D z obrazu satelitarnego",
        "10 adresów · cel 300 s, limit 900 s na adres",
        "Obrazy i wzorce 3D dla jednego województwa.",
        ("address", "footprint-export"),
    ),
    (
        "I-02",
        "Ilość i rodzaj modułów PV",
        "ok. 100 wycen · odchylenie ilości ≤ 20% · cel 60 s, limit 120 s",
        "Katalog SKU i historyczne wyceny z danymi wejściowymi.",
        ("pv",),
    ),
    (
        "N-01",
        "Przetwarzanie zdjęć dla partii adresów",
        "20 gotowych zdjęć · cel 300 s, limit 500 s",
        "Partia adresów i dostęp do kolejki przetwarzania obrazów.",
        (),
    ),
    (
        "III-02",
        "Czas kompletnej oferty",
        "Wycena, opłacalność i wizualizacja w maks. 6 h",
        "Kompletne zgłoszenie, system ofertowania i log przebiegu.",
        (),
    ),
    (
        "I-03",
        "Geometria i parametry energetyczne",
        "Porównanie dachu i fasady z niezależnym bilansem",
        "Katalog, parametry pogody i uzgodniona tolerancja kWh.",
        ("obj",),
    ),
    (
        "II-01",
        "Mikropanele i profile",
        "Zgodność SKU, ilości, cięć, kątów, rzazu i odpadu",
        "Zatwierdzone wzory, katalog i referencyjna lista cięć.",
        (),
    ),
    (
        "II-02",
        "Schemat elektryczny i wiązki",
        "Zgodność topologii, złączy i długości tras",
        "Zatwierdzony schemat, trasy i normy zapasu przewodu.",
        (),
    ),
    (
        "III-01",
        "Konfiguracja, oferta, zamówienie i pomiar",
        "Spójność wersji i jedna rezerwacja na termin",
        "Dostęp do konfiguratora, kont i testowego kalendarza.",
        (),
    ),
)


def requirements() -> list[dict]:
    return [
        dict(
            id=key, title=title, threshold=threshold, required=required, studio_tests=tests, status="blocked"
        )
        for key, title, threshold, required, tests in REQUIREMENTS
    ]


def catalog() -> list[dict]:
    return [dict(id=key, criterion=parts[0], title=parts[1], source=parts[2]) for key, parts in TESTS.items()]


def compare(label: str, expected, actual, *, passed: bool | None = None) -> dict:
    return {
        "label": label,
        "expected": expected,
        "actual": actual,
        "passed": (expected == actual) if passed is None else passed,
    }


def footprint_reference() -> tuple[dict, bytes, FootprintSceneInput]:
    directory = FIXTURES / "footprint-export"
    reference = json.loads((directory / "reference.json").read_bytes())
    raw = (directory / "input.json").read_bytes()
    if sha256(raw).hexdigest() != reference["input_sha256"]:
        raise ValueError("Obrys nie odpowiada zamrożonemu wzorcowi.")
    return reference, raw, FootprintSceneInput.model_validate_json(raw)


def footprint_specimen() -> dict:
    reference, _, footprint = footprint_reference()
    return {
        **reference,
        "height_m": ASSUMED_HEIGHT_M,
        "rings_m": footprint.rings_m[0],
    }


def run_footprint_export() -> tuple[dict, list[dict], dict[str, bytes]]:
    reference, raw, footprint = footprint_reference()
    payload = ModelExport(scene=scene_from_footprint(footprint), variant="portrait")
    files = {
        "input.json": raw,
        "model.obj": export_obj(payload).encode(),
        "model.glb": export_glb(payload),
    }
    checks = []
    for extension in ("obj", "glb"):
        expected, actual = wall_evidence(
            files[f"model.{extension}"], footprint.rings_m[0], is_glb=extension == "glb"
        )
        passed = all(actual[key] == value for key, value in expected.items())
        checks.append(compare(extension.upper(), expected, actual, passed=passed))
    return reference, checks, files


def footprint_report(version: str) -> tuple[dict, dict[str, bytes]]:
    started = time.perf_counter()
    recorded = datetime.now(UTC).isoformat()
    reference, checks, files = run_footprint_export()
    metadata = {
        "input.json": ("Wejście JSON", "application/json"),
        "model.obj": ("Model OBJ", "text/plain"),
        "model.glb": ("Model GLB", "model/gltf-binary"),
    }
    report = {
        "schema_version": 1,
        "id": "footprint-export",
        "run_id": str(uuid4()),
        "recorded_at": recorded,
        "scope": "studio-fixture",
        "source": TESTS["footprint-export"][2],
        "version": version,
        "elapsed_ms": round((time.perf_counter() - started) * 1000),
        "passed": all(row["passed"] for row in checks),
        "reference": reference,
        "checks": checks,
        "artifacts": [
            {
                "name": name,
                "label": metadata[name][0],
                "media_type": metadata[name][1],
                "bytes": len(data),
                "sha256": sha256(data).hexdigest(),
            }
            for name, data in files.items()
        ],
    }
    return report, files


def footprint_response(version: str) -> dict:
    report, files = footprint_report(version)
    return {
        **report,
        "artifact_payloads": {name: b64encode(data).decode("ascii") for name, data in files.items()},
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
            nearby = await buildings(BuildingSearch(**point.model_dump()), request)
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
        data = compute(payload.geometry)
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
