"""Acceptance cases with expected geometry derived independently of the layout engine."""

import math

import pytest
from fastapi.testclient import TestClient

from server.app import app, request_window


@pytest.fixture
def client():
    request_window.clear()
    with TestClient(app) as session:
        yield session
    request_window.clear()


def rectangle(x, y, width, height):
    return {
        "id": "roof",
        "name": "Połać referencyjna",
        "kind": "roof",
        "origin": [0, 0, 3],
        "u": [1, 0, 0],
        "v": [0, 1, 0],
        "boundary_uv_m": [
            [x, y],
            [x + width, y],
            [x + width, y + height],
            [x, y + height],
        ],
    }


@pytest.mark.parametrize(
    ("x", "y"),
    [(0, 0), (-0.12345674, 0.23456784), (-5.845578654, 2.612343108)],
    ids=["origin", "fractional-negative", "translated"],
)
@pytest.mark.parametrize(("slack", "count"), [(1e-6, 1), (-1e-6, 0)], ids=["fits", "too-narrow"])
def test_one_tile_at_setback_boundary(client, x, y, slack, count):
    # A 0.60 × 0.40 m tile with 0.25 m setbacks requires 1.10 × 0.90 m.
    # Translating the UV origin must have no effect on the number of tiles.
    scene = {
        "product_id": "tile-32",
        "setback_m": 0.25,
        "surfaces": ["roof"],
        "custom_surfaces": [rectangle(x, y, 1.10 + slack, 0.90 + 1e-6)],
    }
    response = client.post("/api/layout", json=scene)
    assert response.status_code == 200
    variants = {variant["id"]: variant for variant in response.json()["variants"]}
    variant = variants["landscape"]
    assert variants["portrait"]["module_count"] == 0
    assert variant["module_count"] == len(variant["placements"]) == count
    assert variant["power_kwp"] == pytest.approx(count * 0.032)
    if count:
        panel = variant["placements"][0]
        assert panel["surface_id"] == "roof"
        assert panel["width_m"] == 0.60 and panel["height_m"] == 0.40
        assert x + 0.25 - 1e-10 <= panel["u"] <= x + 0.25 + slack + 1e-10
        assert y + 0.25 - 1e-10 <= panel["v"] <= y + 0.25 + 1e-6 + 1e-10


@pytest.mark.parametrize(
    ("width", "expected_status"), [(25, 200), (25.001, 422)], ids=["at-limit", "over-limit"]
)
def test_selected_area_boundary(client, width, expected_status):
    scene = {"surfaces": ["roof"], "custom_surfaces": [rectangle(0, 0, width, 10)]}
    response = client.post("/api/scene/validate", json=scene)
    assert response.status_code == expected_status
    if expected_status == 422:
        assert "250 m²" in response.json()["detail"][0]["msg"]


def test_search_area_limit_and_selected_surface_scope(client):
    sparse = rectangle(0, 0, 25, 25)
    sparse["boundary_uv_m"] = [[0, 0], [25, 0], [25, 1], [1, 1], [1, 25], [0, 25]]
    sparse["id"] = "sparse"
    scene = {
        "surfaces": ["roof", "sparse"],
        "custom_surfaces": [rectangle(0, 0, 5, 5), sparse],
    }
    response = client.post("/api/layout", json=scene)
    assert response.status_code == 422
    assert "600 m²" in response.json()["detail"][0]["msg"]

    scene["surfaces"] = ["roof"]
    response = client.post("/api/layout", json=scene)
    assert response.status_code == 200
    for variant in response.json()["variants"]:
        assert variant["roof_area_m2"] == 25
        assert variant["module_count"] > 0
        assert {panel["surface_id"] for panel in variant["placements"]} == {"roof"}


@pytest.mark.parametrize("azimuth", [73, 180, 287])
def test_gable_obj_ridge_area_and_winding(client, azimuth):
    scene = {
        "roof": {"width_m": 12, "depth_m": 8, "eaves_m": 3, "pitch_deg": 30, "azimuth_deg": azimuth},
        "surfaces": ["south", "north"],
    }
    response = client.post("/api/model.obj", json={"scene": scene})
    assert response.status_code == 200
    assert "metres, axes X=East Y=Up Z=-North" in response.text
    vertices = []
    faces = {}
    for line in response.text.splitlines():
        tokens = line.split()
        if tokens[0] == "v":
            vertices.append(tuple(map(float, tokens[1:])))
        elif tokens[0] == "g":
            group = tokens[1]
            faces[group] = []
        elif tokens[0] == "f":
            indices = [int(index) for index in tokens[1:]]
            assert all(0 < index <= len(vertices) for index in indices)
            faces[group].append([vertices[index - 1] for index in indices])

    pitch = math.radians(30)
    direction = math.radians(azimuth)
    front = (math.sin(direction), -math.cos(direction))
    cross_ridge = (math.cos(direction), math.sin(direction))
    ridge_height = 3 + 4 * math.tan(pitch)
    face_area = 12 * 4 / math.cos(pitch)
    expected_ridge = {
        (round(sign * 6 * cross_ridge[0], 6), round(sign * 6 * cross_ridge[1], 6)) for sign in (-1, 1)
    }
    assert set(faces) == {"surface_south", "surface_north"}
    for group, sign in [("surface_south", 1), ("surface_north", -1)]:
        assert len(faces[group]) == 2
        expected_eaves = {
            (
                round(rx + sign * 4 * front[0], 5),
                round(rz + sign * 4 * front[1], 5),
            )
            for rx, rz in [(s * 6 * cross_ridge[0], s * 6 * cross_ridge[1]) for s in (-1, 1)]
        }
        actual_ridge = set()
        actual_eaves = set()
        area = 0.0
        normal = (sign * front[0] * math.sin(pitch), math.cos(pitch), sign * front[1] * math.sin(pitch))
        for a, b, c in faces[group]:
            ab = [end - start for start, end in zip(a, b, strict=True)]
            ac = [end - start for start, end in zip(a, c, strict=True)]
            cross = (
                ab[1] * ac[2] - ab[2] * ac[1],
                ab[2] * ac[0] - ab[0] * ac[2],
                ab[0] * ac[1] - ab[1] * ac[0],
            )
            length = math.hypot(*cross)
            assert length > 0
            assert tuple(value / length for value in cross) == pytest.approx(normal, abs=1e-7)
            area += length / 2
            for x, y, z in (a, b, c):
                if y == pytest.approx(ridge_height, abs=1e-7):
                    actual_ridge.add((round(x, 6), round(z, 6)))
                else:
                    assert y == pytest.approx(3, abs=1e-7)
                    actual_eaves.add((round(x, 5), round(z, 5)))
        assert area == pytest.approx(face_area, abs=1e-6)
        assert actual_ridge == expected_ridge
        assert actual_eaves == expected_eaves
