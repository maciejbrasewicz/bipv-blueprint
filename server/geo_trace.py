"""Convert a manually traced EPSG:2180 ring to a horizontal estimated roof."""

from math import hypot
from typing import Annotated, Literal

from pydantic import Field
from pyproj import Geod, Transformer
from shapely import Polygon

from .geo import TO_WGS84
from .geo_contracts import ORTHOPHOTO_RADIUS_M, OrthophotoTrace, SceneSite
from .models import PlanarSurface, Scene, StrictModel
from .product_contracts import SceneOrigin, SceneV2, SurfaceEvidence

WGS84 = Geod(ellps="WGS84")


class TraceSceneInput(StrictModel):
    site: SceneSite
    trace: OrthophotoTrace
    name: str = Field(min_length=1, max_length=100)
    product_id: Literal["slate-75", "tile-32", "panel-120"]
    setback_m: Annotated[float, Field(ge=0.05, le=1)]
    gap_m: Annotated[float, Field(ge=0.005, le=0.1)]
    clearance_m: Annotated[float, Field(ge=0, le=1)]


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

    local = Transformer.from_pipeline(
        f"+proj=pipeline +step +proj=unitconvert +xy_in=deg +xy_out=rad "
        f"+step +proj=cart +ellps=WGS84 "
        f"+step +proj=topocentric +ellps=WGS84 +lon_0={anchor_lon} +lat_0={anchor_lat} +h_0=0"
    )
    boundary = []
    for du, dv in trace.outline_en_m:
        lon, lat = TO_WGS84.transform(x + du, y + dv)
        e, n, _ = local.transform(lon, lat, 0, errcheck=True)
        boundary.append((round(e, 6), round(n, 6)))
    if any(abs(axis) > 40 for point in boundary for axis in point):
        raise ValueError("Obrys przekracza dopuszczalny zasięg sceny lokalnej.")
    if Polygon(boundary).area > 250:
        raise ValueError("Limit demonstratora: 250 m² wybranych połaci.")

    roof = PlanarSurface(
        id="trace-roof",
        name="Dach płaski · obrys z ortofotomapy",
        kind="roof",
        origin=(0, 0, trace.roof_height_m),
        u=(1, 0, 0),
        v=(0, 1, 0),
        boundary_uv_m=boundary,
    )
    scene = Scene(
        **body.model_dump(exclude={"site", "trace"}),
        surfaces=[roof.id],
        custom_surfaces=[roof],
    )
    return SceneV2(
        schema_version="2.0.0",
        geometry=scene,
        origin=SceneOrigin(latitude_deg=anchor_lat, longitude_deg=anchor_lon),
        site=body.site,
        surface_evidence=[SurfaceEvidence(surface_id=roof.id, status="estimated", orthophoto_trace=trace)],
    )
