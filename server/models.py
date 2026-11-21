import math
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from shapely import Polygon


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Roof(StrictModel):
    width_m: float = Field(default=14, ge=4, le=30)
    depth_m: float = Field(default=10, ge=4, le=24)
    pitch_deg: float = Field(default=32, ge=5, le=60)
    eaves_m: float = Field(default=3.2, ge=2, le=12)
    azimuth_deg: float = Field(default=180, ge=0, le=359)


SurfaceId = Annotated[str, Field(pattern=r"^[a-zA-Z0-9_-]{1,48}$")]
Coordinate = Annotated[float, Field(ge=-40, le=40)]
AxisCoordinate = Annotated[float, Field(ge=-1, le=1)]
PointUV = tuple[Coordinate, Coordinate]
Ring = Annotated[list[PointUV], Field(min_length=3, max_length=48)]
Axis = tuple[AxisCoordinate, AxisCoordinate, AxisCoordinate]


class PlanarSurface(StrictModel):
    id: SurfaceId
    name: str = Field(min_length=1, max_length=64)
    kind: Literal["roof", "facade"]
    origin: tuple[Coordinate, Coordinate, Coordinate]
    u: Axis
    v: Axis
    boundary_uv_m: Ring
    holes_uv_m: list[Ring] = Field(default_factory=list, max_length=4)

    def polygon(self):
        return Polygon(self.boundary_uv_m, self.holes_uv_m)

    @model_validator(mode="after")
    def valid_plane(self):
        if (
            abs(math.hypot(*self.u) - 1) > 1e-6
            or abs(math.hypot(*self.v) - 1) > 1e-6
            or abs(sum(a * b for a, b in zip(self.u, self.v, strict=True))) > 1e-6
        ):
            raise ValueError("Osie U i V muszą mieć długość 1 i być prostopadłe")
        shell = Polygon(self.boundary_uv_m)
        polygon = self.polygon()
        if not polygon.is_valid or polygon.area < 0.1:
            raise ValueError("Obrys lub otwory tworzą nieprawidłowy wielokąt")
        if any(not shell.contains_properly(Polygon(hole)) for hole in self.holes_uv_m):
            raise ValueError("Otwory muszą leżeć ściśle wewnątrz obrysu")
        return self


class Obstacle(StrictModel):
    id: str = Field(min_length=1, max_length=48, pattern=r"^[a-zA-Z0-9_-]+$")
    kind: Literal["chimney", "skylight"] = "chimney"
    surface_id: SurfaceId = "south"
    u: Coordinate
    v: Coordinate
    width_m: float = Field(default=0.8, ge=0.2, le=4)
    depth_m: float = Field(default=1, ge=0.2, le=4)
    height_m: float = Field(default=1.1, ge=0.05, le=4)


class Scene(StrictModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    name: str = Field(default="Dom pod Szczecinem", min_length=1, max_length=100)
    roof: Roof = Field(default_factory=Roof)
    obstacles: list[Obstacle] = Field(default_factory=list, max_length=12)
    product_id: Literal["slate-75", "tile-32", "panel-120"] = "slate-75"
    setback_m: float = Field(default=0.25, ge=0.05, le=1)
    gap_m: float = Field(default=0.015, ge=0.005, le=0.1)
    clearance_m: float = Field(default=0.2, ge=0, le=1)
    surfaces: list[SurfaceId] = Field(default_factory=lambda: ["south"], min_length=1, max_length=6)
    custom_surfaces: list[PlanarSurface] | None = Field(default=None, min_length=1, max_length=6)

    @model_validator(mode="after")
    def valid_scene(self):
        if len({o.id for o in self.obstacles}) != len(self.obstacles):
            raise ValueError("Obstacle IDs must be unique")
        if len(set(self.surfaces)) != len(self.surfaces):
            raise ValueError("Surface IDs must be unique")
        available = {surface.id for surface in self.custom_surfaces or []}
        if self.custom_surfaces is None:
            available = {"south", "north"}
        elif len(available) != len(self.custom_surfaces):
            raise ValueError("Identyfikatory powierzchni muszą być unikatowe")
        if not set(self.surfaces).issubset(available) or any(
            o.surface_id not in available for o in self.obstacles
        ):
            raise ValueError("Scena odwołuje się do nieznanej powierzchni")
        if self.custom_surfaces is None:
            single_area = (
                self.roof.width_m * self.roof.depth_m / (2 * math.cos(math.radians(self.roof.pitch_deg)))
            )
            area = single_area * len(self.surfaces)
        else:
            area = 0.0
            search_area = 0.0
            for surface in self.custom_surfaces:
                if surface.id not in self.surfaces:
                    continue
                polygon = surface.polygon()
                area += polygon.area
                x0, y0, x1, y1 = polygon.bounds
                search_area += (x1 - x0) * (y1 - y0)
            if search_area > 600:
                raise ValueError("Obszar przeszukiwania przekracza 600 m²")
        if area > 250:
            raise ValueError("Limit demonstratora: 250 m² wybranych połaci")
        return self


class ModelExport(StrictModel):
    scene: Scene
    variant: Literal["landscape", "portrait"] | None = None
