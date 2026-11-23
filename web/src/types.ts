export type SurfaceId = string;
export type Vec3 = [number, number, number];
export type PointUV = [number, number];
export type PlanarSurface = {
  id: SurfaceId;
  name: string;
  kind: "roof" | "facade";
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  boundary_uv_m: PointUV[];
  holes_uv_m?: PointUV[][];
};
export type Roof = {
  width_m: number;
  depth_m: number;
  pitch_deg: number;
  eaves_m: number;
  azimuth_deg: number;
};
export type Obstacle = {
  id: string;
  kind: "chimney" | "skylight";
  surface_id: SurfaceId;
  u: number;
  v: number;
  width_m: number;
  depth_m: number;
  height_m: number;
};
export type Scene = {
  schema_version: "1.0.0";
  name: string;
  roof: Roof;
  obstacles: Obstacle[];
  product_id: "slate-75" | "tile-32" | "panel-120";
  setback_m: number;
  gap_m: number;
  clearance_m: number;
  surfaces: SurfaceId[];
  custom_surfaces?: PlanarSurface[] | null;
};
export type SceneSite = {
  address: string;
  building_id: string;
  latitude_deg: number;
  longitude_deg: number;
  source: "gugik-egib-wfs";
  retrieved_at: string;
};
export type OrthophotoTrace = {
  source: "gugik-orto-wms";
  image_sha256: string;
  retrieved_at: string;
  center: { easting_m: number; northing_m: number };
  outline_en_m: PointUV[];
  roof_height_m: number;
  building_id: string;
  suggestion_method?: "seed-rgb-v1";
  gable?: {
    ridge_en_m: [PointUV, PointUV];
    pitch_deg: number;
  };
};
export type SceneV2 = {
  schema_version: "2.0.0";
  geometry: Scene;
  site?: SceneSite;
  origin?: {
    latitude_deg: number;
    longitude_deg: number;
    ellipsoidal_height_m?: number;
  };
  surface_evidence: {
    surface_id: SurfaceId;
    status: "estimated" | "measured" | "unverified";
    source_asset_ids: string[];
    orthophoto_trace?: OrthophotoTrace | null;
    egib_assumed_height_m?: number | null;
  }[];
};
export type SceneDocument = Scene | SceneV2;
export type HoleSelection = { surfaceId: string; index: number };

export type Surface = PlanarSurface & {
  normal: Vec3;
  width_m: number;
  height_m: number;
  azimuth_deg: number | null;
};
export type Product = {
  id: Scene["product_id"];
  name: string;
  width_m: number;
  height_m: number;
  power_wp: number;
  finish: string;
  family: string;
  is_manufacturer_data: false;
};
export type Placement = {
  id: string;
  surface_id: SurfaceId;
  u: number;
  v: number;
  width_m: number;
  height_m: number;
};
export type Variant = {
  id: string;
  module_count: number;
  power_kwp: number;
  active_area_m2: number;
  roof_area_m2: number;
  usable_area_m2: number;
  coverage_pct: number;
  placements: Placement[];
};
export type Layout = {
  source_hash: string;
  engine_version: string;
  coordinate_frame: { units: string; axes: string[]; source: string };
  surfaces: Surface[];
  product: Product;
  variants: Variant[];
  duration_ms: number;
  warnings: string[];
};
export type Project = {
  id: string;
  name: string;
  scene: SceneDocument;
  revision: number;
  created_at: string;
  updated_at: string;
};
export type ProjectSummary = Pick<
  Project,
  "id" | "name" | "revision" | "updated_at"
>;
export type CloudRef = { id: string; revision: number; input: string };
export const INITIAL: Scene = {
  schema_version: "1.0.0",
  name: "Dom pod Szczecinem",
  roof: {
    width_m: 14,
    depth_m: 10,
    pitch_deg: 32,
    eaves_m: 3.2,
    azimuth_deg: 180,
  },
  obstacles: [
    {
      id: "chimney-1",
      kind: "chimney",
      surface_id: "south",
      u: 3.8,
      v: 2.4,
      width_m: 0.8,
      depth_m: 0.9,
      height_m: 1.15,
    },
    {
      id: "skylight-1",
      kind: "skylight",
      surface_id: "south",
      u: 9,
      v: 2.1,
      width_m: 0.9,
      depth_m: 1.25,
      height_m: 0.12,
    },
  ],
  product_id: "slate-75",
  setback_m: 0.25,
  gap_m: 0.015,
  clearance_m: 0.2,
  surfaces: ["south"],
};

export type ProjectRevisionSummary = {
  revision: number;
  name: string;
  saved_at: string;
};

export type Organization = {
  id: string;
  name: string;
  role: "owner" | "designer" | "viewer";
};
