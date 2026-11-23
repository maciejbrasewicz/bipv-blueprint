"""Convert an EPSG:2180 trace into estimated roof planes in local ENU."""

from math import cos, hypot, radians, sin, tan
from typing import Annotated, Literal

from pydantic import Field
from pyproj import Geod, Transformer
from shapely import LineString, Point, Polygon
from shapely.ops import split, unary_union

from .geo import TO_WGS84
from .geo_contracts import ORTHOPHOTO_RADIUS_M, GridPoint, OrthophotoTrace, SceneSite
from .models import MAX_LAYOUT_AREA_M2, MAX_LAYOUT_BOUNDS_M2, PlanarSurface, Scene, StrictModel
from .product_contracts import SceneOrigin, SceneV2, SurfaceEvidence

WGS84 = Geod(ellps="WGS84")
TO_PL92 = Transformer.from_crs(4326, 2180, always_xy=True)
EGIB_ASSUMED_HEIGHT_M = 6.0
FootprintCoordinate = Annotated[float, Field(ge=-480, le=480)]
FootprintRing = Annotated[
    list[tuple[FootprintCoordinate, FootprintCoordinate]], Field(min_length=4, max_length=512)
]
FootprintPart = Annotated[list[FootprintRing], Field(min_length=1, max_length=5)]


class LocatedSceneInput(StrictModel):
    site: SceneSite
    name: str = Field(min_length=1, max_length=100)
    product_id: Literal["slate-75", "tile-32", "panel-120"]
    setback_m: Annotated[float, Field(ge=0.05, le=1)]
    gap_m: Annotated[float, Field(ge=0.005, le=0.1)]
    clearance_m: Annotated[float, Field(ge=0, le=1)]


class TraceSceneInput(LocatedSceneInput):
    trace: OrthophotoTrace


class FootprintSceneInput(LocatedSceneInput):
    center: GridPoint
    rings_m: list[FootprintPart] = Field(min_length=1, max_length=6)


def local_projection(lon: float, lat: float):
    return Transformer.from_pipeline(
        f"+proj=pipeline +step +proj=unitconvert +xy_in=deg +xy_out=rad "
        f"+step +proj=cart +ellps=WGS84 "
        f"+step +proj=topocentric +ellps=WGS84 +lon_0={lon} +lat_0={lat} +h_0=0"
    )


def scene_from_footprint(body: FootprintSceneInput) -> SceneV2:
    parts = [Polygon(shell, holes) for shell, *holes in body.rings_m]
    if any(not p.is_valid or p.area < 0.1 for p in parts):
        raise ValueError("Obrys EGiB zawiera nieprawidłową geometrię.")
    footprint = unary_union(parts)
    x, y = body.center.easting_m, body.center.northing_m
    sx, sy = TO_PL92.transform(body.site.longitude_deg, body.site.latitude_deg)
    if footprint.distance(Point(sx - x, sy - y)) > 1:
        raise ValueError("Obrys EGiB i punkt wybranego budynku nie odpowiadają sobie.")
    west, south, east, north = footprint.bounds
    if max(east - west, north - south) > 79:
        raise ValueError("Obrys przekracza zasięg modelu 3D Studio: 79 m rozpiętości.")
    lon, lat = TO_WGS84.transform(x + (west + east) / 2, y + (south + north) / 2)
    projection = local_projection(lon, lat)

    def ring_to_enu(ring):
        coordinates = []
        for de, dn in ring.coords[:-1]:
            p_lon, p_lat = TO_WGS84.transform(x + de, y + dn)
            u, v, _ = projection.transform(p_lon, p_lat, 0, errcheck=True)
            coordinates.append((round(u, 6), round(v, 6)))
        return coordinates

    roofs = []
    polygons = [footprint] if isinstance(footprint, Polygon) else footprint.geoms
    for index, polygon in enumerate(sorted(polygons, key=lambda part: part.bounds), start=1):
        polygon = polygon.simplify(0.05, preserve_topology=True)
        roofs.append(
            PlanarSurface(
                id=f"egib-roof-{index}",
                name=f"Obrys EGiB · część {index}",
                kind="roof",
                origin=(0, 0, EGIB_ASSUMED_HEIGHT_M),
                u=(1, 0, 0),
                v=(0, 1, 0),
                boundary_uv_m=ring_to_enu(polygon.exterior),
                holes_uv_m=[ring_to_enu(r) for r in polygon.interiors],
            )
        )
    shapes = [roof.polygon() for roof in roofs]
    area = sum(shape.area for shape in shapes)
    bounds_area = sum((x1 - x0) * (y1 - y0) for x0, y0, x1, y1 in (shape.bounds for shape in shapes))
    if area > MAX_LAYOUT_AREA_M2 or bounds_area > MAX_LAYOUT_BOUNDS_M2:
        raise ValueError(
            "Wybrany obrys przekracza limit interaktywnego rozmieszczenia PV. "
            "Wydziel mniejszy fragment dachu na ortofotomapie."
        )
    selected = [roof.id for roof in roofs]
    scene = Scene(
        **body.model_dump(exclude={"site", "center", "rings_m"}),
        surfaces=selected,
        custom_surfaces=roofs,
    )
    return SceneV2(
        schema_version="2.0.0",
        geometry=scene,
        origin=SceneOrigin(latitude_deg=lat, longitude_deg=lon),
        site=body.site,
        surface_evidence=[
            SurfaceEvidence(
                surface_id=roof.id, status="estimated", egib_assumed_height_m=EGIB_ASSUMED_HEIGHT_M
            )
            for roof in roofs
        ],
    )


def gable_surfaces(
    polygon: Polygon,
    ridge_points: list[tuple[float, float]],
    pitch_deg: float,
    ridge_height_m: float,
) -> list[PlanarSurface]:
    (ax, ay), (bx, by) = sorted(ridge_points)
    length = hypot(bx - ax, by - ay)
    if length < 1:
        raise ValueError("Punkty kalenicy muszą leżeć w odległości co najmniej 1 m.")
    rx, ry = (bx - ax) / length, (by - ay) / length
    nx, ny = -ry, rx
    west, south, east, north = polygon.bounds
    reach = max(hypot(x - ax, y - ay) for x in (west, east) for y in (south, north)) + 1
    line = LineString([(ax - reach * rx, ay - reach * ry), (ax + reach * rx, ay + reach * ry)])
    ridge = polygon.intersection(line)
    parts = split(polygon, line).geoms
    if ridge.geom_type != "LineString" or ridge.length < 1 or len(parts) != 2:
        raise ValueError("Kalenica musi dzielić obrys na dokładnie dwie połacie.")
    center = ridge.interpolate(0.5, normalized=True)
    angle = radians(pitch_deg)
    c, s = cos(angle), sin(angle)

    def ridge_axes(e: float, n: float) -> tuple[float, float]:
        dx, dy = e - center.x, n - center.y
        along, across = dx * rx + dy * ry, dx * nx + dy * ny
        return along, 0.0 if abs(across) < 1e-8 else across

    # Stable plane order and ID regardless of click order or ring winding.
    ordered = sorted(parts, key=lambda part: ridge_axes(*part.representative_point().coords[0])[1])
    roofs = []
    for side, part in zip((-1, 1), ordered, strict=True):
        flat = [ridge_axes(e, n) for e, n in part.exterior.coords[:-1]]
        run = max(abs(across) for _, across in flat)
        if run < 0.25:
            raise ValueError("Kalenica przebiega zbyt blisko krawędzi dachu.")
        if ridge_height_m - run * tan(angle) <= 0:
            raise ValueError("Wysokość kalenicy lub nachylenie sprowadza połać do poziomu gruntu.")
        roofs.append(
            PlanarSurface(
                id="trace-gable-a" if side < 0 else "trace-gable-b",
                name="Połać A · obrys z ortofotomapy" if side < 0 else "Połać B · obrys z ortofotomapy",
                kind="roof",
                origin=(center.x, center.y, ridge_height_m),
                u=(rx, ry, 0),
                v=(nx * c, ny * c, -side * s),
                boundary_uv_m=[(along, across / c) for along, across in flat],
            )
        )
    return roofs


def scene_from_orthophoto(body: TraceSceneInput) -> SceneV2:
    trace = body.trace
    if trace.building_id != body.site.building_id:
        raise ValueError("Obrys musi należeć do wybranego budynku.")
    if len(set(trace.outline_en_m)) != len(trace.outline_en_m):
        raise ValueError("Obrys zawiera powtórzone wierzchołki.")
    polygon = Polygon(trace.outline_en_m)
    if not polygon.is_valid or polygon.area < 0.1:
        raise ValueError("Obrys przecina się lub ma zbyt małą powierzchnię.")

    west, south, east, north = polygon.bounds
    x, y = trace.center.easting_m, trace.center.northing_m
    anchor_lon, anchor_lat = TO_WGS84.transform(x + (west + east) / 2, y + (south + north) / 2)
    selected_distance = WGS84.inv(anchor_lon, anchor_lat, body.site.longitude_deg, body.site.latitude_deg)[2]
    if selected_distance > 2 * hypot(ORTHOPHOTO_RADIUS_M, ORTHOPHOTO_RADIUS_M):
        raise ValueError("Obrys i wybrany budynek znajdują się w różnych obszarach.")

    local = local_projection(anchor_lon, anchor_lat)

    def local_point(du: float, dv: float) -> tuple[float, float]:
        lon, lat = TO_WGS84.transform(x + du, y + dv)
        e, n, _ = local.transform(lon, lat, 0, errcheck=True)
        return round(e, 6), round(n, 6)

    boundary = [local_point(du, dv) for du, dv in trace.outline_en_m]
    if any(abs(axis) > 40 for point in boundary for axis in point):
        raise ValueError("Obrys przekracza dopuszczalny zasięg sceny lokalnej.")
    local_polygon = Polygon(boundary)
    if not local_polygon.is_valid:
        raise ValueError("Obrys po przeliczeniu na lokalną scenę jest nieprawidłowy.")
    if local_polygon.area > MAX_LAYOUT_AREA_M2:
        raise ValueError(f"Limit interaktywnego obrysu: {MAX_LAYOUT_AREA_M2} m².")

    if trace.gable:
        roofs = gable_surfaces(
            local_polygon,
            [local_point(du, dv) for du, dv in trace.gable.ridge_en_m],
            trace.gable.pitch_deg,
            trace.roof_height_m,
        )
    else:
        roofs = [
            PlanarSurface(
                id="trace-roof",
                name="Dach płaski · obrys z ortofotomapy",
                kind="roof",
                origin=(0, 0, trace.roof_height_m),
                u=(1, 0, 0),
                v=(0, 1, 0),
                boundary_uv_m=boundary,
            )
        ]
    scene = Scene(
        **body.model_dump(exclude={"site", "trace"}),
        surfaces=[roof.id for roof in roofs],
        custom_surfaces=roofs,
    )
    return SceneV2(
        schema_version="2.0.0",
        geometry=scene,
        origin=SceneOrigin(latitude_deg=anchor_lat, longitude_deg=anchor_lon),
        site=body.site,
        surface_evidence=[
            SurfaceEvidence(surface_id=roof.id, status="estimated", orthophoto_trace=trace) for roof in roofs
        ],
    )
