import math
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Roof(StrictModel):
    width_m: float = Field(default=14, ge=4, le=30)
    depth_m: float = Field(default=10, ge=4, le=24)
    pitch_deg: float = Field(default=32, ge=5, le=60)
    eaves_m: float = Field(default=3.2, ge=2, le=12)
    azimuth_deg: float = Field(default=180, ge=0, le=359)


class Obstacle(StrictModel):
    id: str = Field(min_length=1, max_length=48, pattern=r"^[a-zA-Z0-9_-]+$")
    kind: Literal["chimney", "skylight"] = "chimney"
    surface_id: Literal["south", "north"] = "south"
    u: float = Field(ge=0, le=40)
    v: float = Field(ge=0, le=40)
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
    surfaces: list[Literal["south", "north"]] = Field(
        default_factory=lambda: ["south"], min_length=1, max_length=2
    )

    @model_validator(mode="after")
    def valid_scene(self):
        if len({o.id for o in self.obstacles}) != len(self.obstacles):
            raise ValueError("Obstacle IDs must be unique")
        if len(set(self.surfaces)) != len(self.surfaces):
            raise ValueError("Surface IDs must be unique")
        area = self.roof.width_m * self.roof.depth_m / (2 * math.cos(math.radians(self.roof.pitch_deg)))
        if area * len(self.surfaces) > 250:
            raise ValueError("Limit demonstratora: 250 m² wybranych połaci")
        return self


class SaveProject(StrictModel):
    scene: Scene
    expected_revision: int | None = Field(default=None, ge=1, le=1_000_000)
