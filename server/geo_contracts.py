"""Location metadata sits alongside the scene's local geometry."""

from typing import Annotated, Literal

from pydantic import AwareDatetime, Field, StringConstraints

from .models import StrictModel

AddressText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=160)]
BuildingId = Annotated[str, Field(pattern=r"^[\w./-]{1,96}$")]


class GridPoint(StrictModel):
    easting_m: float = Field(ge=0, le=1_000_000)
    northing_m: float = Field(ge=0, le=1_000_000)


class AddressPoint(GridPoint):
    label: AddressText
    region: str = Field(default="", max_length=100)


class SceneSite(StrictModel):
    address: AddressText
    building_id: BuildingId
    latitude_deg: float = Field(ge=-90, le=90)
    longitude_deg: float = Field(ge=-180, le=180)
    source: Literal["gugik-egib-wfs"]
    retrieved_at: AwareDatetime
