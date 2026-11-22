"""Metric ENU geometry. Renderer maps (E,N,U) to (E,U,-N)."""

import hashlib
import json
import math
from functools import lru_cache
from time import perf_counter

from shapely import Polygon, box
from shapely.ops import unary_union
from shapely.prepared import prep

from .models import Scene

ENGINE_VERSION = "grid-search/0.2.2"
COORDINATE_TOLERANCE_M = 1e-9
CATALOG = [
    {
        "id": "slate-75",
        "name": "Slate 75",
        "width_m": 1.2,
        "height_m": 0.4,
        "power_wp": 75,
        "finish": "Grafit satynowy",
        "family": "Panel dachowy",
        "is_manufacturer_data": False,
    },
    {
        "id": "tile-32",
        "name": "Tile 32",
        "width_m": 0.6,
        "height_m": 0.4,
        "power_wp": 32,
        "finish": "Czerń mineralna",
        "family": "Dachówka solarna",
        "is_manufacturer_data": False,
    },
    {
        "id": "panel-120",
        "name": "Linear 120",
        "width_m": 1.2,
        "height_m": 0.6,
        "power_wp": 120,
        "finish": "Czerń szklana",
        "family": "Moduł wielkoformatowy",
        "is_manufacturer_data": False,
    },
]


def source_hash(scene: Scene) -> str:
    payload = json.dumps(
        scene.model_dump(exclude_none=True), sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def surfaces(scene: Scene) -> list[dict]:
    if scene.custom_surfaces is not None:
        result = []
        for surface in scene.custom_surfaces:
            u, v = surface.u, surface.v
            normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
            polygon = surface.polygon()
            x0, y0, x1, y1 = polygon.bounds
            result.append(
                {
                    **surface.model_dump(mode="json"),
                    "normal": normal,
                    "width_m": x1 - x0,
                    "height_m": y1 - y0,
                    "azimuth_deg": round(math.degrees(math.atan2(normal[0], normal[1])), 3) % 360
                    if math.hypot(*normal[:2]) > 1e-9
                    else None,
                }
            )
        return result

    r = scene.roof
    pitch = math.radians(r.pitch_deg)
    c, s = math.cos(pitch), math.sin(pitch)
    slope = r.depth_m / (2 * c)
    angle = math.radians(r.azimuth_deg - 180)
    ca, sa = math.cos(angle), math.sin(angle)

    def rotate(p):
        return [round(ca * p[0] + sa * p[1], 10), round(-sa * p[0] + ca * p[1], 10), p[2]]

    result = []
    for side, origin, u, v, n in [
        ("south", [-r.width_m / 2, -r.depth_m / 2, r.eaves_m], [1, 0, 0], [0, c, s], [0, -s, c]),
        ("north", [r.width_m / 2, r.depth_m / 2, r.eaves_m], [-1, 0, 0], [0, -c, s], [0, s, c]),
    ]:
        result.append(
            {
                "id": side,
                "name": "Połać frontowa" if side == "south" else "Połać tylna",
                "kind": "roof",
                "holes_uv_m": [],
                "origin": rotate(origin),
                "u": rotate(u),
                "v": rotate(v),
                "normal": rotate(n),
                "width_m": r.width_m,
                "height_m": slope,
                "boundary_uv_m": [[0, 0], [r.width_m, 0], [r.width_m, slope], [0, slope]],
                "azimuth_deg": (r.azimuth_deg + (180 if side == "north" else 0)) % 360,
            }
        )
    return result


def surface_polygon(surface: dict):
    return Polygon(surface["boundary_uv_m"], surface["holes_uv_m"])


def usable_polygon(scene: Scene, surface: dict):
    roof = surface_polygon(surface)
    inner = roof.buffer(-scene.setback_m, join_style=2)
    obstacles = [
        box(o.u, o.v, o.u + o.width_m, o.v + o.depth_m).buffer(scene.clearance_m, join_style=2)
        for o in scene.obstacles
        if o.surface_id == surface["id"]
    ]
    return inner.difference(unary_union(obstacles)) if obstacles else inner


def layout_surface(scene: Scene, surface: dict, width: float, height: float) -> tuple[list, float]:
    usable = usable_polygon(scene, surface)
    if usable.is_empty:
        return [], 0.0
    min_x, min_y, max_x, max_y = usable.bounds
    # An exact fit can straddle a boundary by a few floating-point bits.
    # Apply a 1 nm tolerance to containment only; the nominal area and layout stay unrounded.
    prepared = prep(usable.buffer(COORDINATE_TOLERANCE_M))
    step_x, step_y = width + scene.gap_m, height + scene.gap_m
    best: list = []
    for fx in (0, 0.25, 0.5, 0.75):
        for fy in (0, 0.25, 0.5, 0.75):
            current = []
            y = min_y + fy * step_y
            while y + height <= max_y + COORDINATE_TOLERANCE_M:
                x = min_x + fx * step_x
                while x + width <= max_x + COORDINATE_TOLERANCE_M:
                    # Rounding here can move a valid edge candidate outside the setback.
                    if prepared.covers(box(x, y, x + width, y + height)):
                        current.append(
                            {
                                "surface_id": surface["id"],
                                "u": x,
                                "v": y,
                                "width_m": width,
                                "height_m": height,
                            }
                        )
                    x += step_x
                y += step_y
            if len(current) > len(best):
                best = current
    return best, usable.area


def compute(scene: Scene) -> dict:
    return _compute_cached(scene.model_dump_json())


@lru_cache(maxsize=24)
def _compute_cached(serialized_scene: str) -> dict:
    start = perf_counter()
    scene = Scene.model_validate_json(serialized_scene)
    product = next(p for p in CATALOG if p["id"] == scene.product_id)
    resolved = surfaces(scene)
    selected = [s for s in resolved if s["id"] in scene.surfaces]
    variants = []
    roof_area = sum(surface_polygon(s).area for s in selected)
    for orientation, width, height in [
        ("landscape", product["width_m"], product["height_m"]),
        ("portrait", product["height_m"], product["width_m"]),
    ]:
        placements, usable_area = [], 0.0
        for surface in selected:
            items, area = layout_surface(scene, surface, width, height)
            placements.extend(items)
            usable_area += area
        for i, p in enumerate(placements):
            p["id"] = f"{orientation}-{i + 1:04}"
        count = len(placements)
        active_area = count * width * height
        variants.append(
            {
                "id": orientation,
                "module_count": count,
                "power_kwp": count * product["power_wp"] / 1000,
                "active_area_m2": round(active_area, 3),
                "roof_area_m2": round(roof_area, 3),
                "usable_area_m2": round(usable_area, 3),
                "coverage_pct": round(100 * active_area / roof_area, 1) if roof_area else 0,
                "placements": placements,
            }
        )
    variants.sort(key=lambda v: (-v["module_count"], v["id"]))
    warnings = [
        "Geometria z importu lub przykładu. Brak weryfikacji pomiarem."
        if scene.custom_surfaces is not None
        else "Scena parametryczna; bez pomiaru ani rekonstrukcji adresu.",
        "Katalog demonstracyjny; parametry nie pochodzą od producenta.",
        "Moc STC jest sumą mocy modułów. Roczny uzysk i dobór elektryczny nie są wyliczane.",
    ]
    if not selected:
        warnings.insert(
            0, "Podgląd geometrii. Wydziel powierzchnię w granicach limitu, aby obliczyć układ PV."
        )
    for o in scene.obstacles:
        s = next(s for s in resolved if s["id"] == o.surface_id)
        if not surface_polygon(s).covers(box(o.u, o.v, o.u + o.width_m, o.v + o.depth_m)):
            warnings.append(f"Przeszkoda {o.id} wykracza poza połać; użyto części przecinającej dach.")
    return {
        "schema_version": "1.0.0",
        "source_hash": source_hash(scene),
        "engine_version": ENGINE_VERSION,
        "coordinate_frame": {
            "units": "m",
            "axes": ["east", "north", "up"],
            "render_mapping": "(E,N,U) -> (E,U,-N)",
            "source": "explicit_planes" if scene.custom_surfaces is not None else "procedural",
        },
        "surfaces": resolved,
        "product": product,
        "variants": variants,
        "duration_ms": round((perf_counter() - start) * 1000, 2),
        "warnings": warnings,
    }
