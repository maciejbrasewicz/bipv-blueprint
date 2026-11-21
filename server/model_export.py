"""Export the checked planar geometry and selected module layout as Wavefront OBJ."""

from shapely import constrained_delaunay_triangles

from .geometry import compute, surface_polygon
from .models import ModelExport


def render_point(surface: dict, u: float, v: float, offset: float = 0.0) -> tuple[float, float, float]:
    east, north, up = [
        surface["origin"][i] + u * surface["u"][i] + v * surface["v"][i] + offset * surface["normal"][i]
        for i in range(3)
    ]
    return east, up, -north


def surface_faces(surface: dict):
    for triangle in constrained_delaunay_triangles(surface_polygon(surface)).geoms:
        if not triangle.exterior.is_ccw:
            triangle = triangle.reverse()
        yield triangle.exterior.coords[:-1]


def rectangle(u: float, v: float, width: float, depth: float):
    x, y = u + width, v + depth
    return [(u, v), (x, v), (x, y), (u, y)]


def export_obj(body: ModelExport) -> str:
    result = compute(body.scene)
    lines = [
        "# Registry9 BIPV Studio",
        "# metres, axes X=East Y=Up Z=-North",
        f"# source_sha256 {result['source_hash']}",
        f"# engine {result['engine_version']}",
        "# Planar surfaces and optional module footprints",
    ]
    vertex_count = 0

    def face(surface: dict, points, offset=0.0):
        nonlocal vertex_count
        for u, v in points:
            x, y, z = render_point(surface, u, v, offset)
            lines.append(f"v {x:.8f} {y:.8f} {z:.8f}")
        lines.append("f " + " ".join(str(vertex_count + i + 1) for i in range(len(points))))
        vertex_count += len(points)

    planes = {s["id"]: s for s in result["surfaces"]}
    for plane in planes.values():
        lines.append(f"g surface_{plane['id']}")
        for points in surface_faces(plane):
            face(plane, points)

    if body.variant is not None:
        placements = next(v for v in result["variants"] if v["id"] == body.variant)["placements"]
        for panel in placements:
            lines.append(f"g module_{panel['id']}")
            points = rectangle(panel["u"], panel["v"], panel["width_m"], panel["height_m"])
            face(planes[panel["surface_id"]], points, offset=0.045)
    return "\n".join(lines) + "\n"
