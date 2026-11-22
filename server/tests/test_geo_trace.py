"""Test map coordinates through Scene v2, layout and OBJ."""

import math
from copy import deepcopy

import pytest
from fastapi.testclient import TestClient
from pyproj import Transformer

from server.app import app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr("server.app.request_window", [])
    with TestClient(app) as client:
        yield client


def inputs(outline=None, *, center=(500_000, 500_000)):
    easting, northing = center
    lon, lat = Transformer.from_crs(2180, 4326, always_xy=True).transform(easting, northing)
    return {
        "name": "Obrys referencyjny",
        "product_id": "tile-32",
        "setback_m": 0.3,
        "gap_m": 0.02,
        "clearance_m": 0.4,
        "site": {
            "address": "Lokalizacja testowa",
            "building_id": "TEST_A",
            "latitude_deg": lat,
            "longitude_deg": lon,
            "source": "gugik-egib-wfs",
            "retrieved_at": "2026-11-21T10:00:00Z",
        },
        "trace": {
            "building_id": "TEST_A",
            "source": "gugik-orto-wms",
            "image_sha256": "b" * 64,
            "retrieved_at": "2026-11-21T10:01:00Z",
            "center": {"easting_m": easting, "northing_m": northing},
            "outline_en_m": outline or [[-5, -2.5], [5, -2.5], [5, 2.5], [-5, 2.5]],
            "roof_height_m": 6.4,
        },
    }


def test_trace_preserves_scale_at_central_meridian_through_layout_and_obj(client):
    body = inputs()
    response = client.post("/api/scene/from-orthophoto", json=body)
    assert response.status_code == 200, response.text
    document = response.json()
    assert document["origin"]["longitude_deg"] == 19.0
    assert document["site"] == body["site"]
    assert document["surface_evidence"] == [
        {
            "surface_id": "trace-roof",
            "status": "estimated",
            "source_asset_ids": [],
            "orthophoto_trace": body["trace"],
        }
    ]
    geometry = document["geometry"]
    assert geometry["product_id"] == "tile-32" and geometry["setback_m"] == 0.3
    assert geometry["obstacles"] == []
    validated = client.post("/api/scene/v2/validate", json=document)
    assert validated.status_code == 200 and validated.json() == document

    # EPSG:2180 has a central scale factor 0.9993. The 10 × 5 grid metre footprint
    # centered on its central meridian expands to a local ground-distance rectangle.
    expected_width, expected_depth = 10 / 0.9993, 5 / 0.9993
    result = client.post("/api/layout", json=geometry)
    assert result.status_code == 200
    variants = result.json()["variants"]
    assert all(
        variant["roof_area_m2"] == pytest.approx(expected_width * expected_depth, abs=0.001)
        for variant in variants
    )
    assert next(v["module_count"] for v in variants if v["id"] == "landscape") == 150
    exported = client.post("/api/model.obj", json={"scene": geometry})
    assert exported.status_code == 200
    vertices = [
        tuple(map(float, line.split()[1:])) for line in exported.text.splitlines() if line.startswith("v ")
    ]
    assert len(vertices) == 6
    e, up, neg_n = zip(*vertices, strict=True)
    assert max(e) - min(e) == pytest.approx(expected_width, abs=1e-5)
    assert max(neg_n) - min(neg_n) == pytest.approx(expected_depth, abs=1e-5)
    assert all(z == 6.4 for z in up)
    assert "g surface_trace-roof" in exported.text


def test_trace_corrects_grid_convergence_off_central_meridian(client):
    body = inputs(center=(750_000, 360_000))
    response = client.post("/api/scene/from-orthophoto", json=body)
    assert response.status_code == 200, response.text
    [[e0, n0], [e1, n1], *rest] = response.json()["geometry"]["custom_surfaces"][0]["boundary_uv_m"]
    # Grid east and true east diverge here. Check both the observable sign/magnitude
    # and physical length of a ten-metre edge independently of the ENU transform.
    lon, lat = body["site"]["longitude_deg"], body["site"]["latitude_deg"]
    convergence = math.atan(math.tan(math.radians(lon - 19)) * math.sin(math.radians(lat)))
    assert n1 - n0 == pytest.approx(-10 * math.sin(convergence), abs=0.01)
    assert math.hypot(e1 - e0, n1 - n0) == pytest.approx(10, abs=0.02)
    assert len(rest) == 2


@pytest.mark.parametrize(
    "outline",
    [
        [[0, 0], [6, 6], [0, 6], [6, 0]],
        [[0, 0], [6, 0], [6, 6], [0, 0]],
        [[0, 0], [1, 0], [2, 0]],
        [[0, 0], [61, 0], [61, 5], [0, 5]],
        [[0, 0], [81, 0], [0, 2]],
        [[0, 0], [17, 0], [17, 17], [0, 17]],
    ],
    ids=["crossing", "repeated-vertex", "collinear", "out-of-raster", "out-of-raster-large", "area-limit"],
)
def test_trace_rejects_invalid_ring(client, outline):
    response = client.post("/api/scene/from-orthophoto", json=inputs(outline))
    assert response.status_code == 422
    assert "geometry" not in response.json()


def test_trace_rejects_unrelated_source_and_preserves_provenance_on_validation(client):
    original = inputs()
    body = deepcopy(original)
    body["trace"]["building_id"] = "TEST_B"
    assert client.post("/api/scene/from-orthophoto", json=body).status_code == 422
    body = deepcopy(original)
    body["site"]["longitude_deg"] += 0.1
    assert client.post("/api/scene/from-orthophoto", json=body).status_code == 422
    body = deepcopy(original)
    body["trace"]["source"] = "satellite"
    assert client.post("/api/scene/from-orthophoto", json=body).status_code == 422

    document = client.post("/api/scene/from-orthophoto", json=original).json()
    document["surface_evidence"][0].update(
        status="measured", source_asset_ids=["00000000-0000-0000-0000-000000000001"]
    )
    assert client.post("/api/scene/v2/validate", json=document).status_code == 422


def test_seed_suggestion_method_survives_scene_round_trip(client):
    body = inputs()
    body["trace"]["suggestion_method"] = "seed-rgb-v1"
    response = client.post("/api/scene/from-orthophoto", json=body)
    assert response.status_code == 200
    document = response.json()
    row = document["surface_evidence"][0]
    assert row["status"] == "estimated"
    assert row["orthophoto_trace"]["suggestion_method"] == "seed-rgb-v1"
    assert client.post("/api/scene/v2/validate", json=document).json() == document


def test_two_egib_footprints_at_one_address_yield_different_models(client):
    original = inputs()
    original.pop("trace")
    original["center"] = {"easting_m": 500000, "northing_m": 500000}
    roof_areas = []
    captures = []
    for width in (8, 14):
        body = {
            **original,
            "rings_m": [[[[-1, -6], [width - 1, -6], [width - 1, 6], [-1, 6], [-1, -6]]]],
        }
        response = client.post("/api/scene/from-footprint", json=body)
        assert response.status_code == 200, response.text
        document = response.json()
        assert document["surface_evidence"][0]["egib_assumed_height_m"] == 6
        assert document["surface_evidence"][0]["status"] == "estimated"
        assert document["geometry"]["obstacles"] == []
        geometry = document["geometry"]
        assert client.post("/api/scene/v2/validate", json=document).json() == document
        result = client.post("/api/layout", json=geometry).json()
        roof_areas.append(result["variants"][0]["roof_area_m2"])
        captures.append(client.post("/api/model.obj", json={"scene": geometry}).text)
    assert roof_areas == pytest.approx([96, 168], rel=0.01)
    assert captures[0] != captures[1]


def test_large_egib_footprint_keeps_geometry_while_skipping_pv(client):
    body = inputs()
    body.pop("trace")
    body["center"] = {"easting_m": 500000, "northing_m": 500000}
    body["rings_m"] = [[[[-20, -10], [20, -10], [20, 10], [-20, 10], [-20, -10]]]]
    response = client.post("/api/scene/from-footprint", json=body)
    assert response.status_code == 200, response.text
    geometry = response.json()["geometry"]
    assert geometry["surfaces"] == []
    layout = client.post("/api/layout", json=geometry).json()
    assert layout["surfaces"][0]["width_m"] == pytest.approx(40, abs=0.1)
    assert all(variant["module_count"] == 0 for variant in layout["variants"])
    assert client.post("/api/layout", json={**geometry, "surfaces": ["egib-roof-1"]}).status_code == 422


def with_gable(body, ridge=((-4, 0), (4, 0)), pitch=30):
    body["trace"]["gable"] = {"ridge_en_m": [list(p) for p in ridge], "pitch_deg": pitch}
    return body


def vertices_by_group(text):
    groups, vertices = {}, []
    for line in text.splitlines():
        if line.startswith("g "):
            current = groups.setdefault(line[2:], set())
        elif line.startswith("v "):
            coordinates = tuple(map(float, line.split()[1:]))
            vertices.append(coordinates)
        elif line.startswith("f "):
            for index in line.split()[1:]:
                current.add(vertices[int(index) - 1])
    return groups


@pytest.mark.parametrize(
    ("ridge", "rise_span", "dimensions"),
    [
        ([[-4, 0], [4, 0]], 2.5, (10, 5)),
        ([[0, -2], [0, 2]], 5, (10, 5)),
        ([[-4, 1], [4, 1]], 3.5, (10, 5)),
    ],
    ids=["east-west", "north-south", "offset"],
)
def test_gable_layout_and_obj_have_shared_ridge_and_true_sloping_area(client, ridge, rise_span, dimensions):
    body = with_gable(inputs(), ridge)
    response = client.post("/api/scene/from-orthophoto", json=body)
    assert response.status_code == 200, response.text
    document = response.json()
    assert [e["surface_id"] for e in document["surface_evidence"]] == ["trace-gable-a", "trace-gable-b"]
    assert all(e["status"] == "estimated" for e in document["surface_evidence"])
    assert all(e["orthophoto_trace"]["gable"] == body["trace"]["gable"] for e in document["surface_evidence"])
    assert client.post("/api/scene/v2/validate", json=document).json() == document

    geometry = document["geometry"]
    layout = client.post("/api/layout", json=geometry)
    assert layout.status_code == 200
    angle = math.pi / 6
    a, b = dimensions
    area = a * b / (0.9993**2 * math.cos(angle))
    assert all(v["roof_area_m2"] == pytest.approx(area, abs=0.001) for v in layout.json()["variants"])
    assert all(s["normal"][2] == pytest.approx(math.cos(angle)) for s in layout.json()["surfaces"])
    assert {p["surface_id"] for p in layout.json()["variants"][0]["placements"]} == set(geometry["surfaces"])

    obj = client.post("/api/model.obj", json={"scene": geometry})
    assert obj.status_code == 200
    groups = vertices_by_group(obj.text)
    assert set(groups) == {"surface_trace-gable-a", "surface_trace-gable-b"}
    first, second = groups.values()
    shared = first & second
    assert len(shared) == 2
    assert all(up == 6.4 for _, up, _ in shared)
    assert min(v[1] for v in first | second) == pytest.approx(
        6.4 - rise_span / 0.9993 * math.tan(angle), abs=1e-5
    )

    body["trace"]["outline_en_m"].reverse()
    body["trace"]["gable"]["ridge_en_m"].reverse()
    reversed_scene = client.post("/api/scene/from-orthophoto", json=body)
    assert reversed_scene.status_code == 200
    reversed_obj = client.post("/api/model.obj", json={"scene": reversed_scene.json()["geometry"]})
    assert vertices_by_group(reversed_obj.text) == groups


@pytest.mark.parametrize(
    ("ridge", "pitch", "height", "message"),
    [
        ([[0, 0], [0, 0]], 30, 6.4, "co najmniej 1 m"),
        ([[-4, 3], [4, 3]], 30, 6.4, "dokładnie dwie połacie"),
        ([[-4, 2.4], [4, 2.4]], 30, 6.4, "zbyt blisko krawędzi"),
        ([[-4, 0], [4, 0]], 60, 4, "poziomu gruntu"),
        ([[-4, 0], [4, 0]], 65, 6.4, "pitch_deg"),
    ],
)
def test_gable_refuses_invalid_ridge_assumptions(client, ridge, pitch, height, message):
    body = with_gable(inputs(), ridge, pitch)
    body["trace"]["roof_height_m"] = height
    response = client.post("/api/scene/from-orthophoto", json=body)
    assert response.status_code == 422
    assert message in response.text


def test_gable_refuses_outline_split_into_three_separate_pieces(client):
    # At the chosen northing, a U-shaped footprint has two disjoint ridge segments.
    body = with_gable(inputs([[-5, -4], [5, -4], [5, 4], [2, 4], [2, -1], [-2, -1], [-2, 4], [-5, 4]]))
    response = client.post("/api/scene/from-orthophoto", json=body)
    assert response.status_code == 422
    assert "dokładnie dwie połacie" in response.text
