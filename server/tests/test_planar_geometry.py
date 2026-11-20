import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from shapely import Polygon, box
from shapely.ops import unary_union

from server.app import app
from server.geometry import compute
from server.models import Scene

FIXTURE = Path(__file__).parents[2] / "web/src/example-planes.json"


@pytest.fixture
def imported_scene():
    return json.loads(FIXTURE.read_text())


def test_concave_roof_and_facade_placements(imported_scene):
    result = compute(Scene.model_validate(imported_scene))
    assert result["coordinate_frame"]["source"] == "explicit_planes"
    assert result["surfaces"][0]["normal"] == [0, 0, 1]
    assert result["surfaces"][1]["normal"] == [0, -1, 0]
    roof = Polygon([(0, 0), (12, 0), (12, 4), (7, 4), (7, 8), (0, 8)])
    face = box(0, 0, 12, 4)
    roof_hole = box(2, 2, 4, 4)
    face_hole = box(4.5, 0.2, 7.5, 1.65)
    legal = {
        "roof-l": roof.buffer(-0.25, join_style=2).difference(roof_hole.buffer(0.25, join_style=2)),
        "facade-south": face.buffer(-0.25, join_style=2).difference(face_hole.buffer(0.25, join_style=2)),
    }
    for variant in result["variants"]:
        used = {name: [] for name in legal}
        for item in variant["placements"]:
            u, v = item["u"], item["v"]
            rect = box(u, v, u + item["width_m"], v + item["height_m"])
            assert legal[item["surface_id"]].buffer(1e-8).covers(rect)
            used[item["surface_id"]].append(rect)
        assert all(used.values())
        for rects in used.values():
            assert unary_union(rects).area == pytest.approx(sum(rect.area for rect in rects))
        assert variant["roof_area_m2"] == pytest.approx(
            roof.area + face.area - roof_hole.area - face_hole.area
        )


@pytest.mark.parametrize(
    "bad",
    [
        {"u": [1, 0, 0], "v": [1, 0, 0]},
        {"boundary_uv_m": [[0, 0], [3, 3], [0, 3], [3, 0]]},
        {"holes_uv_m": [[[0, 0], [2, 0], [2, 2], [0, 2]]]},
    ],
)
def test_invalid_plane_is_rejected(imported_scene, bad):
    imported_scene["custom_surfaces"][0].update(bad)
    with pytest.raises(ValidationError):
        Scene.model_validate(imported_scene)


def test_unknown_surface_is_rejected(imported_scene):
    imported_scene["surfaces"] = ["unknown"]
    with pytest.raises(ValidationError):
        Scene.model_validate(imported_scene)


def test_obj_uses_metres_and_respects_holes(imported_scene):
    with TestClient(app) as client:
        response = client.post("/api/model.obj", json={"scene": imported_scene, "variant": "landscape"})
        assert response.status_code == 200
        assert response.headers["content-disposition"] == 'attachment; filename="bipv-model.obj"'
        normalized = client.post("/api/scene/validate", json=imported_scene)
        assert normalized.status_code == 200
        assert normalized.json()["setback_m"] == 0.25

    vertices = []
    groups = {}
    current = None
    for line in response.text.splitlines():
        if line.startswith("v "):
            vertices.append(tuple(map(float, line.split()[1:])))
        elif line.startswith("g "):
            current = line.split()[1]
            groups[current] = []
        elif line.startswith("f "):
            groups[current].append([vertices[int(i) - 1] for i in line.split()[1:]])

    roof_triangles = groups["surface_roof-l"]
    facade_triangles = groups["surface_facade-south"]
    assert all(len(t) == 3 for t in roof_triangles + facade_triangles)
    assert all(y == 4 for t in roof_triangles for _, y, _ in t)
    assert all(z == 4 for t in facade_triangles for _, _, z in t)
    roof_actual = unary_union([Polygon([(x + 6, 4 - z) for x, _, z in t]) for t in roof_triangles])
    roof_expected = Polygon(
        [(0, 0), (12, 0), (12, 4), (7, 4), (7, 8), (0, 8)],
        holes=[[(2, 2), (4, 2), (4, 4), (2, 4)]],
    )
    assert roof_actual.symmetric_difference(roof_expected).area < 1e-8
    variants = compute(Scene.model_validate(imported_scene))["variants"]
    expected = next(v["module_count"] for v in variants if v["id"] == "landscape")
    assert sum(name.startswith("module_") for name in groups) == expected
