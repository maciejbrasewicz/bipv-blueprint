"""Read the exported asset independently of the writer and compare it to known scenes."""

import json
import math
import struct
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from shapely import Polygon

from server.app import app

FIXTURE = Path(__file__).parents[2] / "web/src/example-planes.json"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr("server.app.request_window", [])
    with TestClient(app) as session:
        yield session


def read_glb(data):
    assert struct.unpack_from("<4sII", data) == (b"glTF", 2, len(data))
    text_size, tag = struct.unpack_from("<I4s", data, 12)
    assert tag == b"JSON" and text_size % 4 == 0
    document = json.loads(data[20 : 20 + text_size])
    binary_offset = 20 + text_size
    binary_size, tag = struct.unpack_from("<I4s", data, binary_offset)
    assert tag == b"BIN\0" and binary_size % 4 == 0
    binary_data = data[binary_offset + 8 :]
    assert len(binary_data) == binary_size == document["buffers"][0]["byteLength"]
    assert "uri" not in document["buffers"][0]
    assert document["asset"]["version"] == "2.0"
    assert document["scenes"][document["scene"]]["nodes"] == list(range(len(document["nodes"])))

    def values(index):
        accessor = document["accessors"][index]
        assert accessor["componentType"] == 5126 and accessor["type"] == "VEC3"
        view = document["bufferViews"][accessor["bufferView"]]
        offset, length = view["byteOffset"], view["byteLength"]
        assert offset % 4 == 0 and length == accessor["count"] * 12
        vectors = list(struct.iter_unpack("<fff", binary_data[offset : offset + length]))
        assert len(vectors) == accessor["count"]
        if "min" in accessor:
            columns = list(zip(*vectors, strict=True))
            assert accessor["min"] == [min(col) for col in columns]
            assert accessor["max"] == [max(col) for col in columns]
        return vectors

    meshes = {}
    for node in document["nodes"]:
        mesh = document["meshes"][node["mesh"]]
        (primitive,) = mesh["primitives"]
        assert primitive["mode"] == 4
        positions = values(primitive["attributes"]["POSITION"])
        normals = values(primitive["attributes"]["NORMAL"])
        assert len(positions) == len(normals) and len(positions) % 3 == 0
        assert all(math.isclose(math.hypot(*n), 1, abs_tol=1e-6) for n in normals)
        triangles = list(zip(positions[::3], positions[1::3], positions[2::3], strict=True))
        assert node["name"] not in meshes
        meshes[node["name"]] = node["extras"], triangles, normals
    return document["asset"]["extras"], meshes


def get_model(client, scene, variant=None):
    response = client.post("/api/model.glb", json={"scene": scene, "variant": variant})
    assert response.status_code == 200
    assert response.headers["content-type"] == "model/gltf-binary"
    assert response.headers["content-disposition"] == 'attachment; filename="bipv-model.glb"'
    return response.content


def test_glb_surfaces_have_exact_units_holes_and_winding(client):
    scene = json.loads(FIXTURE.read_text())
    meta, meshes = read_glb(get_model(client, scene))
    assert meta["frame"] == "X=East,Y=Up,Z=-North"
    assert meta["variant"] is None
    assert set(meshes) == {"surface_roof-l", "surface_facade-south"}

    references = {
        "surface_roof-l": (72, (0, 1, 0), lambda p: (p[0] + 6, 4 - p[2])),
        "surface_facade-south": (43.65, (0, 0, 1), lambda p: (p[0] + 6, p[1])),
    }
    for node, (expected_area, expected_normal, flat) in references.items():
        extra, triangles, normals = meshes[node]
        plane = next(s for s in scene["custom_surfaces"] if s["id"] == extra["surfaceId"])
        expected = Polygon(plane["boundary_uv_m"], plane["holes_uv_m"])
        assert all(n == expected_normal for n in normals)
        union_area = 0
        for triangle in triangles:
            polygon = Polygon([flat(p) for p in triangle])
            assert polygon.exterior.is_ccw
            assert polygon.difference(expected).area < 2e-6
            union_area += polygon.area
            assert all(p[1 if extra["surfaceId"] == "roof-l" else 2] == 4 for p in triangle)
        assert expected.area == pytest.approx(expected_area)
        assert union_area == pytest.approx(expected_area, abs=2e-6)


@pytest.mark.parametrize("variant", ["landscape", "portrait"])
def test_glb_batches_the_active_pv_layout_and_extrudes_obstacles(client, variant):
    scene = json.loads(FIXTURE.read_text())
    scene["obstacles"] = [
        {
            "id": "stack",
            "surface_id": "roof-l",
            "u": 0.5,
            "v": 0.5,
            "width_m": 1,
            "depth_m": 1,
            "height_m": 1.4,
        },
        {"id": "window", "kind": "skylight", "surface_id": "facade-south", "u": 2, "v": 1, "height_m": 0.25},
    ]
    layout = client.post("/api/layout", json=scene).json()
    reference = next(v for v in layout["variants"] if v["id"] == variant)
    glb = get_model(client, scene, variant)
    assert glb == get_model(client, scene, variant)
    meta, meshes = read_glb(glb)
    assert meta["variant"] == variant and meta["sourceSha256"] == layout["source_hash"]

    seen = set()
    for extra, triangles, _ in meshes.values():
        if extra["role"] != "pv":
            continue
        ids = extra["moduleIds"]
        assert len(triangles) == 2 * len(ids)
        assert all(id_ not in seen for id_ in ids)
        seen.update(ids)
        for i, id_ in enumerate(ids):
            panel = next(p for p in reference["placements"] if p["id"] == id_)
            assert panel["surface_id"] == extra["surfaceId"]
            vertices = set(triangles[2 * i] + triangles[2 * i + 1])
            assert len(vertices) == 4
            assert sorted({p[0] for p in vertices}) == pytest.approx(
                [panel["u"] - 6, panel["u"] - 6 + panel["width_m"]], abs=2e-6
            )
            if panel["surface_id"] == "roof-l":
                assert all(p[1] == pytest.approx(4.045, abs=1e-6) for p in vertices)
            else:
                assert all(p[2] == pytest.approx(4.045, abs=1e-6) for p in vertices)
    assert seen == {p["id"] for p in reference["placements"]}
    _, chimney, _ = meshes["obstacle_stack"]
    _, window, _ = meshes["obstacle_window"]
    assert len(chimney) == len(window) == 12
    assert max(p[1] for tri in chimney for p in tri) == pytest.approx(5.42, abs=1e-6)
    assert max(p[2] for tri in window for p in tri) == pytest.approx(4.27, abs=1e-6)


def test_procedural_glb_roof_planes_share_a_rotated_ridge(client):
    scene = {"roof": {"width_m": 12, "depth_m": 8, "pitch_deg": 30, "eaves_m": 3, "azimuth_deg": 73}}
    _, meshes = read_glb(get_model(client, scene))
    assert set(meshes) == {"surface_south", "surface_north"}
    vertices = [{p for t in m[1] for p in t} for m in meshes.values()]
    ridge = vertices[0] & vertices[1]
    assert len(ridge) == 2
    assert all(p[1] == pytest.approx(3 + 4 * math.tan(math.pi / 6), abs=1e-6) for p in ridge)
    a, b = tuple(ridge)
    assert math.dist(a, b) == pytest.approx(12, abs=2e-6)


def test_glb_uses_the_existing_export_validation(client):
    response = client.post("/api/model.glb", json={"scene": {}, "variant": "diagonal"})
    assert response.status_code == 422
