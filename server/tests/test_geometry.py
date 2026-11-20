import math

import pytest
from pydantic import ValidationError
from shapely import Polygon, box

from server.geometry import CATALOG, compute, source_hash, surfaces
from server.models import Scene


def test_unobstructed_matches_analytical_count():
    scene = Scene(roof={"width_m": 12, "depth_m": 8, "pitch_deg": 30}, obstacles=[])
    h = 4 / math.cos(math.radians(30))
    product = CATALOG[0]
    for variant in compute(scene)["variants"]:
        w, d = (
            (product["width_m"], product["height_m"])
            if variant["id"] == "landscape"
            else (product["height_m"], product["width_m"])
        )
        expected = math.floor((12 - 0.5 + scene.gap_m) / (w + scene.gap_m))
        expected *= math.floor((h - 0.5 + scene.gap_m) / (d + scene.gap_m))
        assert variant["module_count"] == expected
        assert variant["power_kwp"] == expected * 75 / 1000


@pytest.mark.parametrize("product_id", ["slate-75", "tile-32", "panel-120"])
@pytest.mark.parametrize("pitch", [12, 32, 55])
def test_independent_containment_clearance_and_overlap(product_id, pitch):
    scene = Scene(
        product_id=product_id,
        roof={"width_m": 11, "depth_m": 8, "pitch_deg": pitch},
        surfaces=["south", "north"],
        obstacles=[{"id": "chimney", "u": 3.1, "v": 1.3, "width_m": 1.3, "depth_m": 1.6}],
    )
    slope = 4 / math.cos(math.radians(pitch))
    inner = box(0.25, 0.25, 11 - 0.25, slope - 0.25)
    excluded = box(3.1 - 0.2, 1.3 - 0.2, 3.1 + 1.3 + 0.2, 1.3 + 1.6 + 0.2)
    for variant in compute(scene)["variants"]:
        placed = {"south": [], "north": []}
        for p in variant["placements"]:
            rectangle = box(p["u"], p["v"], p["u"] + p["width_m"], p["v"] + p["height_m"])
            assert inner.buffer(1e-6).covers(rectangle)
            if p["surface_id"] == "south":
                assert rectangle.intersection(excluded).area < 1e-6
            for other in placed[p["surface_id"]]:
                assert rectangle.intersection(other).area < 1e-8
            placed[p["surface_id"]].append(rectangle)
        assert len(variant["placements"]) == variant["module_count"]
        assert variant["coverage_pct"] <= 100


def test_basis_orthonormal_right_handed_and_metric():
    for s in surfaces(Scene(roof={"azimuth_deg": 73, "pitch_deg": 42})):
        u, v, n = s["u"], s["v"], s["normal"]

        def dot(a, b):
            return sum(x * y for x, y in zip(a, b, strict=True))

        assert math.isclose(dot(u, u), 1, abs_tol=1e-9)
        assert math.isclose(dot(v, v), 1, abs_tol=1e-9)
        assert math.isclose(dot(n, n), 1, abs_tol=1e-9)
        assert math.isclose(dot(u, v), 0, abs_tol=1e-9)
        cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        assert cross == pytest.approx(n, abs=1e-9)
        assert Polygon(s["boundary_uv_m"]).area == pytest.approx(s["width_m"] * s["height_m"])


def test_hash_and_catalog_provenance():
    scene = Scene()
    assert compute(scene) == compute(scene)
    assert source_hash(scene) != source_hash(scene.model_copy(update={"setback_m": 0.5}))
    assert compute(scene)["coordinate_frame"]["source"] == "procedural"
    assert all(not p["is_manufacturer_data"] for p in CATALOG)


def test_reject_extra_nan_duplicates_and_excess_work():
    for bad in (
        {"arbitrary": True},
        {"roof": {"width_m": float("nan")}},
        {"roof": {"width_m": 30, "depth_m": 24, "pitch_deg": 60}},
        {"surfaces": ["south", "south"]},
        {"obstacles": [{"id": "a", "u": 0, "v": 0}, {"id": "a", "u": 1, "v": 0}]},
    ):
        with pytest.raises(ValidationError):
            Scene.model_validate(bad)
