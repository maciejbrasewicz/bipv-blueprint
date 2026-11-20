"""Measure local BIPV Studio layout and OBJ APIs on fixed synthetic roofs."""

import argparse
import json
import platform
from importlib.metadata import version
from pathlib import Path
from statistics import median
from time import perf_counter

from fastapi.testclient import TestClient

from server.app import app

ROOT = Path(__file__).resolve().parents[1]
LAYOUT_LIMIT_S = 5.0
EXPORT_LIMIT_S = 10.0


def cases():
    yield (
        "gable-two-slopes",
        {
            "roof": {"width_m": 12, "depth_m": 8, "pitch_deg": 30},
            "surfaces": ["south", "north"],
        },
        {"landscape": 162, "portrait": 162},
    )
    # Six 40 m² surfaces, 7.50 × 4.50 m each after setback, 15 mm gaps.
    # 12 × 10 tiles per surface in landscape, 18 × 7 in portrait.
    planes = [
        {
            "id": f"roof-{index}",
            "kind": "roof",
            "name": f"Roof {index}",
            "u": [1, 0, 0],
            "v": [0, 1, 0],
            "origin": [9 * (index % 3), 6 * (index // 3), 3],
            "boundary_uv_m": [[0, 0], [8, 0], [8, 5], [0, 5]],
        }
        for index in range(6)
    ]
    yield (
        "six-surfaces-240-m2",
        {
            "product_id": "tile-32",
            "surfaces": [plane["id"] for plane in planes],
            "custom_surfaces": planes,
        },
        {"landscape": 720, "portrait": 756},
    )


def timed_post(client, endpoint, payload):
    start = perf_counter()
    response = client.post(endpoint, json=payload)
    seconds = perf_counter() - start
    response.raise_for_status()
    return response, seconds


def verify_layout(response, expected_counts):
    variants = response.json()["variants"]
    counts = {variant["id"]: variant["module_count"] for variant in variants}
    if counts != expected_counts or any(len(v["placements"]) != v["module_count"] for v in variants):
        raise ValueError(f"Layout counts differ from analytical reference: {counts} != {expected_counts}")


def verify_export(response, expected_surfaces, panel_count):
    groups = [line for line in response.text.splitlines() if line.startswith("g ")]
    surfaces = {line.removeprefix("g surface_") for line in groups if line.startswith("g surface_")}
    modules = [line for line in groups if line.startswith("g module_")]
    if surfaces != set(expected_surfaces) or len(modules) != panel_count or len(set(modules)) != panel_count:
        raise ValueError("OBJ does not contain the expected surfaces and module groups")


def summary(samples, limit):
    maximum = max(samples)
    return {
        "samples_s": [round(item, 6) for item in samples],
        "median_s": round(median(samples), 6),
        "max_s": round(maximum, 6),
        "limit_s": limit,
        "status": "PASS" if maximum <= limit else "FAIL",
    }


def measure():
    results = []
    with TestClient(app) as client:
        engine = client.get("/api/health").json()["engine"]
        for case, scene, counts in cases():
            cold_layout, warm_layout, cold_export = [], [], []
            for repeat in range(3):
                # A distinct scene name avoids a prior entry in the layout result cache.
                layout_scene = {**scene, "name": f"{case} layout {repeat}"}
                response, elapsed = timed_post(client, "/api/layout", layout_scene)
                verify_layout(response, counts)
                cold_layout.append(elapsed)

                response, elapsed = timed_post(client, "/api/layout", layout_scene)
                verify_layout(response, counts)
                warm_layout.append(elapsed)

                export_scene = {**scene, "name": f"{case} export {repeat}"}
                response, elapsed = timed_post(
                    client, "/api/model.obj", {"scene": export_scene, "variant": "landscape"}
                )
                verify_export(response, scene["surfaces"], counts["landscape"])
                cold_export.append(elapsed)

            results.append(
                {
                    "case": case,
                    "expected_module_counts": counts,
                    "layout_uncached": summary(cold_layout, LAYOUT_LIMIT_S),
                    "layout_cached": summary(warm_layout, LAYOUT_LIMIT_S),
                    "obj_uncached": summary(cold_export, EXPORT_LIMIT_S),
                }
            )
    operations = ("layout_uncached", "layout_cached", "obj_uncached")
    passed = all(case[operation]["status"] == "PASS" for case in results for operation in operations)
    source = ROOT / "SOURCE_COMMIT.txt"
    return {
        "scope": "synthetic BIPV Studio inputs; in-process HTTP; no network or external services",
        "source_commit": source.read_text(encoding="utf-8").strip() if source.is_file() else "local",
        "engine": engine,
        "system": platform.system(),
        "arch": platform.machine(),
        "python": platform.python_version(),
        "packages": {package: version(package) for package in ("fastapi", "httpx", "shapely")},
        "status": "PASS" if passed else "FAIL",
        "cases": results,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = measure()
    report_json = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        args.output.write_text(report_json, encoding="utf-8")
    print(report_json, end="")
    raise SystemExit(0 if report["status"] == "PASS" else 1)
