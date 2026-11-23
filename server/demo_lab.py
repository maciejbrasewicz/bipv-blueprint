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
from scripts.electrotile_checks import (
    HarnessObserved,
    HarnessReference,
    MaterialsObserved,
    MaterialsReference,
    check_harness,
    check_materials,
)
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
from .production_plan import ProductionInput, build_plan

FIXTURES = Path(__file__).resolve().parents[1] / "tests/fixtures/electrotile-lab"
ADDRESS = "Stargard, Szczecińska 1"
TESTS = {
    "footprint-export": (
        "I · Geometria i eksport",
        "Ściany budynku w OBJ i GLB",
        "Studio · obrys kontrolny z dziedzińcem",
    ),
    "production-plan": (
        "II · Przedmiar i elektryka",
        "Arkusze, rozkrój i trasa wiązki",
        "Studio · katalog i projekt kontrolny",
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
        ("production-plan",),
    ),
    (
        "II-02",
        "Schemat elektryczny i wiązki",
        "Zgodność topologii, złączy i długości tras",
        "Zatwierdzony schemat, trasy i normy zapasu przewodu.",
        ("production-plan",),
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


def evidence_json(data: dict) -> bytes:
    return (json.dumps(data, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode()


def report_with_files(
    test_id: str, version: str, run, metadata: dict[str, tuple[str, str]]
) -> tuple[dict, dict[str, bytes]]:
    started = time.perf_counter()
    recorded = datetime.now(UTC).isoformat()
    reference, checks, files = run()
    return {
        "schema_version": 1,
        "id": test_id,
        "run_id": str(uuid4()),
        "recorded_at": recorded,
        "scope": "studio-fixture",
        "source": TESTS[test_id][2],
        "version": version,
        "elapsed_ms": round((time.perf_counter() - started) * 1000),
        "passed": bool(checks) and all(row["passed"] for row in checks),
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
    }, files


def footprint_report(version: str) -> tuple[dict, dict[str, bytes]]:
    return report_with_files(
        "footprint-export",
        version,
        run_footprint_export,
        {
            "input.json": ("Wejście JSON", "application/json"),
            "model.obj": ("Model OBJ", "text/plain"),
            "model.glb": ("Model GLB", "model/gltf-binary"),
        },
    )


def production_input() -> bytes:
    return (FIXTURES / "production-plan" / "input.json").read_bytes()


def run_production_plan() -> tuple[dict, list[dict], dict[str, bytes]]:
    raw = production_input()
    reference_data = (FIXTURES / "production-plan" / "reference.json").read_bytes()
    reference = json.loads(reference_data)
    if sha256(raw).hexdigest() != reference["input_sha256"]:
        raise ValueError("Zlecenie nie odpowiada zamrożonemu wzorcowi.")
    result = build_plan(ProductionInput.model_validate_json(raw))

    material_reference = MaterialsReference.model_validate(reference["materials"])
    harness_reference = HarnessReference.model_validate(reference["harness"])
    materials = MaterialsObserved.model_validate({"stock": result["stock"], "bom": result["profile_bom"]})
    harness = HarnessObserved.model_validate({"wires": result["wires"]})
    materials_defects = check_materials(material_reference, materials)
    harness_defects = check_harness(harness_reference, harness)
    labels = {
        "design_revision": "Rewizja projektu",
        "catalog_revision": "Rewizja katalogu",
        "sheets": "SKU, wzór, wymiary i cięcia arkuszy",
        "sheet_bom": "Kompletność przedmiaru arkuszy",
        "stc_mwp": "Moc STC (mWp)",
        "strings": "Przypisanie aktywnych arkuszy do obwodu",
    }
    checks = [compare(label, reference["layout"][key], result[key]) for key, label in labels.items()]
    checks += [
        compare(
            "Profile, cięcia, rzaz i bilans materiału",
            {
                "Sztangi według SKU": material_reference.bom,
                "Odpad (mm)": reference["total_scrap_mm"],
                "Niezgodności": [],
            },
            {
                "Sztangi według SKU": materials.bom,
                "Odpad (mm)": sum(stock.scrap_mm for stock in materials.stock),
                "Niezgodności": [defect.model_dump() for defect in materials_defects],
            },
        ),
        compare(
            "Trasa, końcówki i długość wiązki",
            {"Długość z zapasem (mm)": reference["total_wire_mm"], "Niezgodności": []},
            {
                "Długość z zapasem (mm)": sum(wire.length_mm for wire in harness.wires.values()),
                "Niezgodności": [defect.model_dump() for defect in harness_defects],
            },
        ),
    ]
    return (
        {key: reference[key] for key in ("id", "revision", "input_sha256")}
        | {"reference_sha256": sha256(reference_data).hexdigest()},
        checks,
        {
            "zlecenie.json": raw,
            "plan-produkcji.json": evidence_json(result),
            "wzorzec.json": reference_data,
        },
    )


def case_report(test_id: str, version: str) -> tuple[dict, dict[str, bytes]]:
    if test_id == "footprint-export":
        return footprint_report(version)
    if test_id == "production-plan":
        return report_with_files(
            test_id,
            version,
            run_production_plan,
            {
                "zlecenie.json": ("Zlecenie JSON", "application/json"),
                "plan-produkcji.json": ("Przedmiar i wiązki JSON", "application/json"),
                "wzorzec.json": ("Wzorzec JSON", "application/json"),
            },
        )
    return study_report(test_id, version)


def case_response(test_id: str, version: str) -> dict:
    report, files = case_report(test_id, version)
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


def study_report(test_id: str, version: str) -> tuple[dict, dict[str, bytes]]:
    suite = "studio-pv" if test_id == "pv" else "studio-geometry"
    files_meta: dict[str, tuple[str, str]] = {}
    directory = FIXTURES / suite

    def run_study():
        results = []
        files = {"wzorzec.json": (directory / "manifest.json").read_bytes()}
        files_meta["wzorzec.json"] = ("Wzorce JSON", "application/json")
        for row, raw in frozen_cases(suite):
            case_id = row["id"]
            payload = ModelExport.model_validate_json(raw)
            data = compute(payload.geometry)
            layout = checked_layout(data, payload.variant)
            layout_bytes = evidence_json(
                {
                    "source_hash": data["source_hash"],
                    "product": data["product"],
                    "variant": layout,
                }
            )
            files[f"{case_id}-wejscie.json"] = raw
            files[f"{case_id}-uklad.json"] = layout_bytes
            files_meta[f"{case_id}-wejscie.json"] = (f"{case_id} · wejście", "application/json")
            files_meta[f"{case_id}-uklad.json"] = (f"{case_id} · układ PV", "application/json")
            if test_id == "pv":
                count = layout["module_count"]
                reference = PVReference.model_validate(row["reference"])
                observed = PVOutput(
                    report_sha256=sha256(layout_bytes).hexdigest(),
                    modules_by_type={data["product"]["id"]: count} if count else {},
                )
                errors = pv_reference_errors(reference, observed)
                results.append(
                    compare(
                        case_id,
                        {
                            "Liczba modułów": reference.module_count,
                            "Dopuszczone typy": reference.accepted_type_sets,
                        },
                        {"Liczba modułów": count, "Liczba według SKU": observed.modules_by_type},
                        passed=count == reference.module_count and not errors,
                    )
                )
            else:
                reference = GeometryReference.model_validate_json(json.dumps(row["reference"]))
                model = export_obj(payload).encode()
                files[f"{case_id}.obj"] = model
                files_meta[f"{case_id}.obj"] = (f"{case_id} · model OBJ", "text/plain")
                output = GeometryEvidence.model_validate(geometry_evidence(data, layout, model))
                defects = check_geometry(reference, output)
                module_count = sum(plane.module_count for plane in reference.planes.values())
                results.append(
                    compare(
                        case_id,
                        {
                            "Liczba modułów": module_count,
                            "Moc STC (kWp)": module_count * reference.module_wp / 1000,
                            "Niezgodności": [],
                        },
                        {
                            "Liczba modułów": len(output.placements),
                            "Moc STC (kWp)": output.layout_power_kwp,
                            "SHA-256 OBJ": output.obj_sha256,
                            "Niezgodności": [d.model_dump() for d in defects],
                        },
                        passed=not defects,
                    )
                )
        return {"id": suite, "reference_sha256": sha256(files["wzorzec.json"]).hexdigest()}, results, files

    return report_with_files(test_id, version, run_study, files_meta)
