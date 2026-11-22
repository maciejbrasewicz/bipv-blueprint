"""Check a metric OBJ against survey geometry frozen independently of the exporter."""

import hashlib
import math
import re
from collections import Counter, defaultdict
from typing import Annotated

from pydantic import Field, model_validator
from shapely import Polygon, box, union_all

from .check_electrotile_run import CaseID, Digest, Record
from .electrotile_checks import Defect

Coordinate = Annotated[float, Field(ge=-1e8, le=1e8)]
Point2 = tuple[Coordinate, Coordinate]
Point3 = tuple[Coordinate, Coordinate, Coordinate]
Ring = Annotated[list[Point2], Field(min_length=3, max_length=1000)]
Tolerance = Annotated[float, Field(gt=0, le=0.1)]
Positive = Annotated[float, Field(gt=0, le=10000)]


def normal(u: Point3, v: Point3) -> Point3:
    return (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])


class PlaneReference(Record):
    origin_enu_m: Point3
    u_enu: Point3
    v_enu: Point3
    outline_uv_m: Ring
    openings_uv_m: list[Ring] = Field(default_factory=list)
    placement_uv_m: Ring
    exclusions_uv_m: list[Ring] = Field(default_factory=list)
    module_count: Annotated[int, Field(ge=0, le=10000)]

    def surface(self) -> Polygon:
        return Polygon(self.outline_uv_m, self.openings_uv_m)

    def placement(self) -> Polygon:
        return Polygon(self.placement_uv_m, self.exclusions_uv_m)

    @model_validator(mode="after")
    def validate_survey(self):
        u, v = self.u_enu, self.v_enu
        errors = (math.hypot(*u) - 1, math.hypot(*v) - 1, math.sumprod(u, v))
        if any(abs(error) > 1e-8 for error in errors):
            raise ValueError("Frozen survey axes must be orthonormal")
        surface, placement = self.surface(), self.placement()
        if not surface.is_valid or not placement.is_valid or not surface.covers(placement):
            raise ValueError("Frozen placement area must be valid and contained in the surveyed surface")
        return self

    def project(self, vertices: list[Point3], offset_m: float) -> tuple[Polygon, float]:
        u, v = self.u_enu, self.v_enu
        n = normal(u, v)
        # OBJ uses render axes X=East, Y=Up, Z=-North. The survey remains in ENU.
        points = [
            tuple(a - b for a, b in zip((x, -z, y), self.origin_enu_m, strict=True)) for x, y, z in vertices
        ]
        polygon = Polygon([(math.sumprod(p, u), math.sumprod(p, v)) for p in points])
        error = max(abs(math.sumprod(p, n) - offset_m) for p in points)
        return polygon, error


class GeometryReference(Record):
    planes: dict[CaseID, PlaneReference] = Field(min_length=1)
    position_tolerance_m: Tolerance
    area_tolerance_m2: Tolerance
    module_size_uv_m: tuple[Positive, Positive]
    module_offset_m: Annotated[float, Field(ge=0, le=1)]
    module_wp: Positive
    power_tolerance_kwp: Tolerance


class ModulePlacement(Record):
    surface_id: CaseID
    u: Coordinate
    v: Coordinate
    width_m: Positive
    height_m: Positive


class GeometryEvidence(Record):
    obj: str = Field(min_length=1, max_length=4_000_000)
    obj_sha256: Digest
    placements: dict[CaseID, ModulePlacement]
    layout_power_kwp: Annotated[float, Field(ge=0, le=10_000)]


def read_obj(obj: str) -> dict[str, list[list[Point3]]]:
    """Read named triangle and quad groups, including standard relative vertex indices."""
    vertices = []
    groups = {}
    faces = None
    for line in obj.splitlines():
        tokens = line.partition("#")[0].split()
        if not tokens:
            continue
        kind, *fields = tokens
        match kind:
            case "v":
                x, y, z = map(float, fields)
                if not all(abs(c) <= 1e8 for c in (x, y, z)):
                    raise ValueError("OBJ vertex exceeds the finite metric range")
                vertices.append((x, y, z))
            case "g":
                (name,) = fields
                if name in groups or not re.fullmatch(
                    r"(?:surface|module)_[A-Za-z0-9][\w.-]{0,79}", name, re.ASCII
                ):
                    raise ValueError("OBJ group is duplicated or incorrectly named")
                faces = groups[name] = []
            case "f":
                if faces is None or len(fields) not in (3, 4):
                    raise ValueError("OBJ needs named triangle or quad faces")
                indices = [int(field.split("/", 1)[0]) for field in fields]
                slots = [i - 1 if i > 0 else len(vertices) + i for i in indices]
                if len(set(slots)) != len(slots) or any(not 0 <= i < len(vertices) for i in slots):
                    raise ValueError("OBJ face contains invalid vertex indices")
                faces.append([vertices[i] for i in slots])
            case "vt" | "vn" | "o" | "s" | "usemtl" | "mtllib":
                continue
            case _:
                raise ValueError("OBJ includes an unsupported statement")
    return groups


def check_geometry(reference: GeometryReference, observed: GeometryEvidence) -> list[Defect]:
    defects = []

    def fail(code, subject, expected, actual):
        defects.append(Defect(code=code, subject=subject, expected=expected, actual=actual))

    sha = hashlib.sha256(observed.obj.encode("utf-8")).hexdigest()
    if observed.obj_sha256 != sha:
        fail("obj_digest", "geometry", observed.obj_sha256, sha)
        return defects
    try:
        groups = read_obj(observed.obj)
    except ValueError as exc:
        fail("obj_invalid", "geometry", "named metric OBJ", str(exc))
        return defects

    modules = observed.placements
    expected_groups = {f"surface_{key}" for key in reference.planes} | {f"module_{key}" for key in modules}
    if groups.keys() != expected_groups:
        fail("obj_groups", "geometry", sorted(expected_groups), sorted(groups))
    counts = Counter(placement.surface_id for placement in modules.values())
    collected = defaultdict(list)
    linear_tol, area_tol = reference.position_tolerance_m, reference.area_tolerance_m2

    for key, survey in sorted(reference.planes.items()):
        if counts[key] != survey.module_count:
            fail("module_count", key, survey.module_count, counts[key])
        target = survey.surface()
        roof_faces = groups.get(f"surface_{key}", [])
        facets = []
        if not roof_faces:
            fail("surface_empty", key, "non-empty surface", len(roof_faces))
            continue
        flipped, invalid, off_plane = 0, 0, 0.0
        for face in roof_faces:
            facet, error = survey.project(face, offset_m=0)
            off_plane = max(off_plane, error)
            if not facet.is_valid:
                invalid += 1
                continue
            flipped += not facet.exterior.is_ccw
            facets.append(facet)
        if invalid or flipped:
            fail(
                "surface_winding",
                key,
                {"clockwise": 0, "invalid": 0},
                {"clockwise": flipped, "invalid": invalid},
            )
        if off_plane > linear_tol:
            fail("surface_plane_offset_m", key, linear_tol, off_plane)
        mesh = union_all(facets)
        overlap = sum(facet.area for facet in facets) - mesh.area
        if overlap > area_tol:
            fail("surface_overlap_m2", key, area_tol, overlap)
        delta = mesh.symmetric_difference(target).area
        boundary = mesh.boundary.hausdorff_distance(target.boundary) if facets else None
        if delta > area_tol or boundary is None or boundary > linear_tol:
            fail(
                "surface_coverage",
                key,
                {"difference_m2": area_tol, "boundary_m": linear_tol},
                {
                    "target_m2": target.area,
                    "actual_m2": mesh.area,
                    "difference_m2": delta,
                    "boundary_m": boundary,
                },
            )

    allowed = {key: plane.placement().buffer(linear_tol) for key, plane in reference.planes.items()}
    for key, placement in sorted(modules.items()):
        plane_id = placement.surface_id
        if plane_id not in reference.planes:
            fail("module_unknown_plane", key, sorted(reference.planes), plane_id)
            continue
        faces = groups.get(f"module_{key}", [])
        if len(faces) != 1 or len(faces[0]) != 4:
            fail("module_mesh", key, "one quadrilateral", [len(face) for face in faces])
            continue
        panel, offset = reference.planes[plane_id].project(faces[0], reference.module_offset_m)
        if offset > linear_tol:
            fail("module_plane_offset_m", key, linear_tol, offset)
        if not panel.is_valid or not panel.exterior.is_ccw:
            fail("module_winding", key, "valid counterclockwise footprint", panel.wkt)
            continue
        collected[plane_id].append(panel)
        x0, y0, x1, y1 = panel.bounds
        dimensions = x1 - x0, y1 - y0
        recorded_bounds = (
            placement.u,
            placement.v,
            placement.u + placement.width_m,
            placement.v + placement.height_m,
        )
        if any(abs(a - b) > linear_tol for a, b in zip(panel.bounds, recorded_bounds, strict=True)):
            fail("module_layout_position_uv_m", key, recorded_bounds, panel.bounds)
        target = reference.module_size_uv_m
        if any(abs(a - b) > linear_tol for a, b in zip(dimensions, target, strict=True)) or (
            panel.symmetric_difference(box(*panel.bounds)).area > area_tol
        ):
            fail("module_footprint_uv_m", key, target, dimensions)
        if not allowed[plane_id].covers(panel):
            fail("module_outside_placement_m2", key, 0, panel.difference(allowed[plane_id]).area)

    for key, panels in sorted(collected.items()):
        overlap = sum(panel.area for panel in panels) - union_all(panels).area
        if overlap > area_tol:
            fail("module_overlap_m2", key, area_tol, overlap)
    expected_power = (
        sum(plane.module_count for plane in reference.planes.values()) * reference.module_wp / 1000
    )
    if abs(observed.layout_power_kwp - expected_power) > reference.power_tolerance_kwp:
        fail("module_stc_power_kwp", "layout", expected_power, observed.layout_power_kwp)
    return defects
