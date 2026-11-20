"""Versioned boundaries for product work. Existing Scene v1 remains the layout input."""

from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from pydantic import AwareDatetime, Field, model_validator

from .models import Scene, StrictModel, SurfaceId

Sha256 = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
Key = Annotated[str, Field(pattern=r"^[a-zA-Z0-9_-]{1,64}$")]
Label = Annotated[str, Field(min_length=1, max_length=160)]
PositiveMeters = Annotated[float, Field(gt=0, le=40)]


class SceneOrigin(StrictModel):
    latitude_deg: float = Field(ge=-90, le=90)
    longitude_deg: float = Field(ge=-180, le=180)
    ellipsoidal_height_m: float | None = Field(default=None, ge=-500, le=10000)


class SurfaceEvidence(StrictModel):
    surface_id: SurfaceId
    status: Literal["estimated", "measured", "unverified"]
    source_asset_ids: list[UUID] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def validate_sources(self) -> SurfaceEvidence:
        if len(set(self.source_asset_ids)) != len(self.source_asset_ids):
            raise ValueError("Source asset IDs must be unique")
        if self.status == "measured" and not self.source_asset_ids:
            raise ValueError("Measured geometry requires a source asset")
        return self


class SceneV2(StrictModel):
    schema_version: Literal["2.0.0"]
    geometry: Scene
    origin: SceneOrigin | None = None
    surface_evidence: list[SurfaceEvidence] = Field(default_factory=list, max_length=6)

    @model_validator(mode="after")
    def validate_surfaces(self) -> SceneV2:
        available = {surface.id for surface in self.geometry.custom_surfaces or []}
        if self.geometry.custom_surfaces is None:
            available = {"south", "north"}
        evidence_ids = [entry.surface_id for entry in self.surface_evidence]
        if len(set(evidence_ids)) != len(evidence_ids) or not set(evidence_ids) <= available:
            raise ValueError("Evidence must reference distinct surfaces in the geometry")
        return self

    @classmethod
    def from_v1(cls, scene: Scene) -> SceneV2:
        return cls(schema_version="2.0.0", geometry=scene)


class Footprint(StrictModel):
    width_m: PositiveMeters
    height_m: PositiveMeters


class CatalogProduct(StrictModel):
    sku: Key
    name: Label
    kind: Literal["active", "inactive"]
    external: Footprint
    coverage: Footprint
    orientations: Annotated[list[Literal["landscape", "portrait"]], Field(min_length=1, max_length=2)]
    power_wp: float = Field(ge=0, le=10000)
    source_refs: list[Label] = Field(default_factory=list, max_length=12)

    @model_validator(mode="after")
    def validate_product(self) -> CatalogProduct:
        if self.coverage.width_m > self.external.width_m or self.coverage.height_m > self.external.height_m:
            raise ValueError("Coverage dimensions cannot exceed the external footprint these axes describe")
        if (self.power_wp > 0) != (self.kind == "active"):
            raise ValueError("Only active products must have positive power")
        if len(set(self.orientations)) != len(self.orientations):
            raise ValueError("Orientations must be distinct")
        return self


class CatalogV1(StrictModel):
    schema_version: Literal["1.0.0"]
    catalog_id: Key
    release: Key
    status: Literal["fixture", "draft", "verified"]
    products: list[CatalogProduct] = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def validate_release(self) -> CatalogV1:
        if len({product.sku for product in self.products}) != len(self.products):
            raise ValueError("SKU must be unique within a catalog release")
        if self.status == "verified" and any(not product.source_refs for product in self.products):
            raise ValueError("Every verified product requires a source reference")
        return self


class JobArtifact(StrictModel):
    artifact_id: UUID
    sha256: Sha256


class JobV1(StrictModel):
    schema_version: Literal["1.0.0"]
    job_id: UUID
    organization_id: UUID
    project_id: UUID
    scene_revision: int = Field(ge=1)
    kind: Literal["imagery", "geometry", "layout", "energy", "offer", "batch"]
    input_sha256: Sha256
    engine_version: Annotated[str, Field(min_length=1, max_length=64)]
    state: Literal["queued", "running", "succeeded", "failed", "canceled"]
    attempt: int = Field(ge=0, le=20)
    created_at: AwareDatetime
    updated_at: AwareDatetime
    artifacts: list[JobArtifact] = Field(default_factory=list, max_length=20)
    error_code: Key | None = None

    @model_validator(mode="after")
    def validate_state(self) -> JobV1:
        if self.updated_at < self.created_at:
            raise ValueError("Updated time cannot precede creation")
        if self.state in {"running", "succeeded", "failed"} and not self.attempt:
            raise ValueError("An executed job needs an attempt")
        if (self.state == "succeeded") != bool(self.artifacts):
            raise ValueError("Only a succeeded job exposes a result artifact")
        if (self.state == "failed") != bool(self.error_code):
            raise ValueError("A failed job requires an error code")
        if len({entry.artifact_id for entry in self.artifacts}) != len(self.artifacts):
            raise ValueError("Artifact IDs must be unique")
        return self


PRODUCT_CONTRACTS = {
    "scene.v2": SceneV2,
    "catalog.v1": CatalogV1,
    "job.v1": JobV1,
}
