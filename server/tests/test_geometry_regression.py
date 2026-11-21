"""Analytical and metamorphic checks through the same API used by Studio."""

import math
from collections import Counter
from itertools import combinations, pairwise
from random import Random

import pytest
from fastapi.testclient import TestClient

from server.app import app, request_window

WIDTH, HEIGHT, GAP, SETBACK = 0.60, 0.40, 0.015, 0.25
TOLERANCE_M = 1e-8
SEED = 202507


@pytest.fixture
def client():
    request_window.clear()
    with TestClient(app) as session:
        yield session
    request_window.clear()


def corners(rectangle):
    x0, y0, x1, y1 = rectangle
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def make_scene(boundary, origin, u_axis, v_axis, hole=None):
    return {
        "product_id": "tile-32",
        "setback_m": SETBACK,
        "gap_m": GAP,
        "surfaces": ["face"],
        "custom_surfaces": [
            {
                "id": "face",
                "name": "Powierzchnia referencyjna",
                "kind": "facade" if v_axis[2] == 1 else "roof",
                "origin": origin,
                "u": u_axis,
                "v": v_axis,
                "boundary_uv_m": corners(boundary),
                "holes_uv_m": [corners(hole)] if hole else [],
            }
        ],
    }


def get_layout(client, scene):
    response = client.post("/api/layout", json=scene)
    assert response.status_code == 200, response.text
    result = response.json()
    return result, next(v for v in result["variants"] if v["id"] == "landscape")


def intersects(a, b):
    return all(min(a[i + 2], b[i + 2]) - max(a[i], b[i]) > TOLERANCE_M for i in (0, 1))


def panel_rectangles(variant, allowed, exclusions=()):
    placements = variant["placements"]
    assert len(placements) == len({p["id"] for p in placements}) == variant["module_count"]
    assert variant["power_kwp"] == pytest.approx(len(placements) * 0.032)
    assert variant["active_area_m2"] == pytest.approx(len(placements) * WIDTH * HEIGHT)
    rectangles = {}
    for panel in placements:
        assert panel["surface_id"] == "face"
        assert (panel["width_m"], panel["height_m"]) == (WIDTH, HEIGHT)
        u, v = panel["u"], panel["v"]
        rect = (u, v, u + WIDTH, v + HEIGHT)
        for i in (0, 1):
            assert allowed[i] - TOLERANCE_M <= rect[i]
            assert rect[i + 2] <= allowed[i + 2] + TOLERANCE_M
        assert not any(intersects(rect, exclusion) for exclusion in exclusions), "Exclusion hit"
        rectangles[panel["id"]] = rect
    assert not any(intersects(a, b) for a, b in combinations(rectangles.values(), 2)), "Panels overlap"
    return rectangles


rng = Random(SEED)
TRANSLATIONS = [
    (0, 0),
    (-2.0513481665870756, -1.5925665724104654),  # First confirmed regression.
    *[(rng.uniform(-20, 10), rng.uniform(-20, 10)) for _ in range(8)],
]


@pytest.mark.parametrize(("columns", "rows"), [(2, 1), (3, 2), (8, 9), (17, 23)])
@pytest.mark.parametrize(
    ("x", "y"),
    TRANSLATIONS,
    ids=["origin", "known-regression", *(f"seed-{SEED}-{i}" for i in range(8))],
)
def test_grid_capacity_is_invariant_under_uv_translation(client, x, y, columns, rows):
    # A perfect fit fixes every coordinate: no other grid phase can reach this capacity.
    usable_w = columns * WIDTH + (columns - 1) * GAP
    usable_h = rows * HEIGHT + (rows - 1) * GAP
    allowed = (x + SETBACK, y + SETBACK, x + SETBACK + usable_w, y + SETBACK + usable_h)
    scene = make_scene(
        (x, y, x + usable_w + 2 * SETBACK, y + usable_h + 2 * SETBACK),
        (0, 0, 3),
        (1, 0, 0),
        (0, 1, 0),
    )
    _, variant = get_layout(client, scene)
    assert variant["module_count"] == columns * rows
    rectangles = panel_rectangles(variant, allowed)
    expected = [
        (x + SETBACK + col * (WIDTH + GAP), y + SETBACK + row * (HEIGHT + GAP))
        for row in range(rows)
        for col in range(columns)
    ]
    assert len(rectangles) == len(expected)
    for rect, point in zip(rectangles.values(), expected, strict=True):
        assert rect[:2] == pytest.approx(point, abs=TOLERANCE_M, rel=0)


@pytest.mark.parametrize("axis", [0, 1], ids=["width", "height"])
def test_micrometre_shortfall_does_not_fit_two_by_two(client, axis):
    usable = [2 * WIDTH + GAP + 1e-6, 2 * HEIGHT + GAP + 1e-6]
    usable[axis] -= 2e-6
    u, v = -2.0513481665870756, -1.5925665724104654
    scene = make_scene(
        (u, v, u + usable[0] + 2 * SETBACK, v + usable[1] + 2 * SETBACK),
        (0, 0, 3),
        (1, 0, 0),
        (0, 1, 0),
    )
    _, variant = get_layout(client, scene)
    assert variant["module_count"] == 2
    panel_rectangles(variant, (u + SETBACK, v + SETBACK, u + SETBACK + usable[0], v + SETBACK + usable[1]))


@pytest.mark.parametrize(("azimuth", "expected"), [(359.998, 359.998), (359.9999, 0), (0.0001, 0)])
def test_azimuth_wraps_to_zero_at_display_precision(client, azimuth, expected):
    a = math.radians(azimuth)
    scene = make_scene((0, 0, 2, 2), (0, 0, 3), (-math.cos(a), math.sin(a), 0), (0, 0, 1))
    result, _ = get_layout(client, scene)
    assert result["surfaces"][0]["azimuth_deg"] == expected


def read_obj(text):
    vertices, groups = [], {}
    for line in text.splitlines():
        kind, _, value = line.partition(" ")
        if kind == "v":
            vertex = tuple(map(float, value.split()))
            assert len(vertex) == 3 and all(math.isfinite(x) for x in vertex)
            vertices.append(vertex)
        elif kind == "g":
            assert value not in groups
            faces = groups[value] = []
        elif kind == "f":
            ids = tuple(map(int, value.split()))
            assert len(set(ids)) == len(ids) and all(1 <= i <= len(vertices) for i in ids)
            faces.append([vertices[i - 1] for i in ids])
    return groups


def check_obj(groups, panel_rects, shell, hole, inverse):
    assert set(groups) == {"surface_face", *("module_" + key for key in panel_rects)}, "Group mismatch"

    boundary = Counter()
    area = 0.0
    for face in groups["surface_face"]:
        a, b, c = [inverse(vertex, 0) for vertex in face]
        signed_twice_area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])
        assert signed_twice_area > 0
        area += signed_twice_area / 2
        points = [(round(u, 6), round(v, 6)) for u, v in (a, b, c)]
        boundary.update(pairwise([*points, points[0]]))

    expected_boundary = Counter()
    for ring in [corners(shell), list(reversed(corners(hole)))]:
        expected_boundary.update(pairwise([*ring, ring[0]]))
    outer_edges = boundary - Counter({(b, a): n for (a, b), n in boundary.items()})
    assert outer_edges == expected_boundary
    assert area == pytest.approx((shell[2] - shell[0]) * (shell[3] - shell[1]) - 1.15 * 1.25)
    for key, rect in panel_rects.items():
        (face,) = groups["module_" + key]
        for vertex, point in zip(face, corners(rect), strict=True):
            assert inverse(vertex, 0.045) == pytest.approx(point, abs=TOLERANCE_M, rel=0)


@pytest.mark.parametrize("orientation", ["roof", "facade"])
def test_export_geometry_matches_layout_with_hole_and_chimney(client, orientation):
    shell = (-1, -0.5, 6.5, 5.25)
    hole = (1, 1.5, 2.15, 2.75)
    if orientation == "roof":
        scene = make_scene(shell, (12, -9, 3), (1, 0, 0), (0, 1, 0), hole)

        def inverse(vertex, offset):
            x, y, z = vertex
            assert y == pytest.approx(3 + offset, abs=TOLERANCE_M, rel=0)
            return x - 12, 9 - z

    else:
        scene = make_scene(shell, (12, -9, 3), (0, -1, 0), (0, 0, 1), hole)

        def inverse(vertex, offset):
            x, y, z = vertex
            assert x == pytest.approx(12 - offset, abs=TOLERANCE_M, rel=0)
            return z - 9, y - 3

    scene["clearance_m"] = 0.125
    scene["obstacles"] = [
        {"id": "chimney", "surface_id": "face", "u": 3, "v": 0.5, "width_m": 0.85, "depth_m": 1.25}
    ]
    result, variant = get_layout(client, scene)
    assert variant["module_count"] > 0
    assert variant["usable_area_m2"] == round(7 * 5.25 - 1.65 * 1.75 - 1.10 * 1.50, 3)
    allowed = (-0.75, -0.25, 6.25, 5.0)
    exclusions = [(0.75, 1.25, 2.40, 3.0), (2.875, 0.375, 3.975, 1.875)]
    rects = panel_rectangles(variant, allowed, exclusions)
    response = client.post("/api/model.obj", json={"scene": scene, "variant": "landscape"})
    assert response.status_code == 200
    assert f"# source_sha256 {result['source_hash']}\n" in response.text
    groups = read_obj(response.text)
    check_obj(groups, rects, shell, hole, inverse)

    # Negative controls prove that the independent checks detect damaged results.
    key = next(iter(rects))
    with pytest.raises(AssertionError, match="Group mismatch"):
        check_obj({k: v for k, v in groups.items() if k != "module_" + key}, rects, shell, hole, inverse)
    bad_export = {**groups, "module_" + key: [[(x, y, -z) for x, y, z in groups["module_" + key][0]]]}
    with pytest.raises(AssertionError):
        check_obj(bad_export, rects, shell, hole, inverse)
    first, *others = variant["placements"]
    with pytest.raises(AssertionError, match="Exclusion hit"):
        panel_rectangles(
            {**variant, "placements": [{**first, "u": hole[0], "v": hole[1]}, *others]},
            allowed,
            exclusions,
        )
