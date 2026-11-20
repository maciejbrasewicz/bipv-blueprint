export type SurfaceId = "south" | "north";
export type Vec3 = [number, number, number];
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
};
export type Surface = {
  id: SurfaceId;
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  normal: Vec3;
  width_m: number;
  height_m: number;
  azimuth_deg: number;
  boundary_uv_m: number[][];
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
  scene: Scene;
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
