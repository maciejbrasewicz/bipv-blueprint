"""Check the geometry that users get after importing a footprint and exporting the project."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from shapely import LineString, MultiLineString

from scripts.electrotile_geometry import read_obj
from server import demo_lab
from server.app import app
from server.product_contracts import ModelExport
from server.tests.test_glb_export import read_glb

INPUT = Path(__file__).parents[2] / "tests/fixtures/electrotile-lab/footprint-export/input.json"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr("server.app.request_window", [])
    with TestClient(app) as session:
        yield session


@pytest.mark.parametrize("ext", ["obj", "glb"])
def test_footprint_export_contains_walls_along_outer_and_inner_ring(client, ext):
    footprint = json.loads(INPUT.read_bytes())
    created = client.post("/api/scene/from-footprint", json=footprint)
    assert created.status_code == 200, created.text
    document = created.json()
    response = client.post(f"/api/model.{ext}", json={"scene": document, "variant": "portrait"})
    assert response.status_code == 200, response.text
    wall_name = "walls_egib-roof-1"

    if ext == "obj":
        groups = read_obj(response.text)
        walls = groups.get(wall_name, [])
        assert "surface_egib-roof-1" in groups
        assert any(name.startswith("module_") for name in groups)
    else:
        _, meshes = read_glb(response.content)
        assert "surface_egib-roof-1" in meshes and "pv_egib-roof-1" in meshes
        assert wall_name in meshes, f"Missing walls; nodes: {list(meshes)}"
        meta, walls, normals = meshes[wall_name]
        assert meta == {"surfaceId": "egib-roof-1", "role": "estimated_footprint_walls"}
        assert all(abs(n[1]) < 1e-5 for n in normals)

    assert len(walls) == 16
    segments = []
    for face in walls:
        assert {vertex[1] for vertex in face} == {0, 6}
        projected = {(east, -south) for east, _, south in face}
        assert len(projected) == 2
        segments.append(LineString(list(projected)))

    # EPSG:2180 at the central meridian has scale 0.9993. Use the original
    # cadastral rings, including the courtyard, to determine both perimeters.
    expected = MultiLineString(
        [[(e / 0.9993, n / 0.9993) for e, n in ring] for ring in footprint["rings_m"][0]]
    )
    actual = MultiLineString(segments)
    assert actual.hausdorff_distance(expected) < 1e-5
    assert actual.length / 2 == pytest.approx(expected.length, abs=1e-5)


@pytest.mark.parametrize(("writer", "format_"), [("export_obj", "OBJ"), ("export_glb", "GLB")])
def test_retest_fails_if_one_writer_loses_footprint_provenance(client, monkeypatch, writer, format_):
    original = getattr(demo_lab, writer)
    monkeypatch.setattr(
        demo_lab,
        writer,
        lambda body: original(ModelExport(scene=body.geometry, variant=body.variant)),
    )
    result = client.post("/api/demo/tests/footprint-export").json()
    assert not result["passed"]
    (failed,) = [check for check in result["checks"] if not check["passed"]]
    assert failed["label"] == f"Retest {format_}"
    assert failed["actual"]["trójkąty ścian"] == 0
    assert failed["expected"]["trójkąty ścian"] == 16
