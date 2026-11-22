import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, Line } from "@react-three/drei";
import * as THREE from "three";
import SunCalc from "suncalc";
import type {
  HoleSelection,
  Layout,
  Obstacle,
  Placement,
  Scene,
  SceneSite,
  Surface,
  Vec3,
  Variant,
} from "./types";

const rp = (p: Vec3) => new THREE.Vector3(p[0], p[2], -p[1]);
function uv(s: Surface, u: number, v: number, offset = 0) {
  return rp(s.origin)
    .addScaledVector(rp(s.u), u)
    .addScaledVector(rp(s.v), v)
    .addScaledVector(rp(s.normal), offset);
}
function RoofSurface({
  s,
  active,
  wire,
  footprint,
}: {
  s: Surface;
  active: boolean;
  wire: boolean;
  footprint: boolean;
}) {
  const rings = useMemo(
    () =>
      [s.boundary_uv_m, ...(s.holes_uv_m ?? [])].map((ring) =>
        ring.map(([u, v]) => new THREE.Vector2(u, v)),
      ),
    [s],
  );
  const geometry = useMemo(() => {
    const [outline, ...holes] = rings.map((ring) => [...ring]);
    const triangles = THREE.ShapeUtils.triangulateShape(outline, holes);
    const points = [outline, ...holes].flat().map(({ x, y }) => uv(s, x, y));
    const mesh = new THREE.BufferGeometry().setFromPoints(points);
    mesh.setIndex(triangles.flat());
    mesh.computeVertexNormals();
    return mesh;
  }, [s, rings]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const walls = useMemo(() => {
    if (!footprint) return null;
    const positions = [];
    for (const ring of rings) {
      for (let index = 0; index < ring.length; index++) {
        const a = ring[index],
          b = ring[(index + 1) % ring.length];
        const topA = uv(s, a.x, a.y),
          topB = uv(s, b.x, b.y);
        const groundA = topA.clone().setY(0),
          groundB = topB.clone().setY(0);
        for (const point of [topA, groundA, topB, topB, groundA, groundB])
          positions.push(point.x, point.y, point.z);
      }
    }
    const mesh = new THREE.BufferGeometry();
    mesh.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    mesh.computeVertexNormals();
    return mesh;
  }, [footprint, rings, s]);
  useEffect(() => () => walls?.dispose(), [walls]);
  return (
    <group>
      {walls && (
        <mesh geometry={walls} castShadow receiveShadow>
          <meshStandardMaterial
            color="#c5c4b3"
            roughness={0.9}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      <mesh geometry={geometry} receiveShadow castShadow>
        <meshStandardMaterial
          color={active ? "#343d3c" : "#606a65"}
          roughness={0.85}
          side={THREE.DoubleSide}
        />
      </mesh>
      {wire &&
        rings.map((ring, i) => (
          <Line
            key={i}
            points={[...ring, ring[0]].map(({ x, y }) => uv(s, x, y, 0.015))}
            color="#b8dac2"
            lineWidth={1}
          />
        ))}
    </group>
  );
}
function SurfaceDimension({ surface }: { surface: Surface }) {
  const text = surface.width_m.toFixed(1) + " m";
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 60;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "#edf2e9";
      context.fillRect(0, 0, 160, 60);
      context.strokeStyle = "#729186";
      context.lineWidth = 4;
      context.strokeRect(2, 2, 156, 56);
      context.fillStyle = "#304544";
      context.font = "bold 29px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(text, 80, 31);
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
  }, [text]);
  useEffect(() => () => texture.dispose(), [texture]);

  const left = Math.min(...surface.boundary_uv_m.map(([u]) => u));
  const bottom = Math.min(...surface.boundary_uv_m.map(([, v]) => v));
  return (
    <sprite
      position={uv(surface, left + surface.width_m / 2, bottom - 0.38, 0.04)}
      scale={[1.65, 0.62, 1]}
    >
      <spriteMaterial map={texture} toneMapped={false} />
    </sprite>
  );
}

function Cells({
  placements,
  surfaces,
  onSelect,
}: {
  placements: Placement[];
  surfaces: Surface[];
  onSelect: (p: Placement) => void;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null),
    invalidate = useThree((s) => s.invalidate);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#172b35";
    ctx.fillRect(0, 0, 256, 128);
    const gradient = ctx.createLinearGradient(0, 0, 256, 128);
    gradient.addColorStop(0, "#233f4c");
    gradient.addColorStop(1, "#13242e");
    ctx.fillStyle = gradient;
    ctx.fillRect(3, 3, 250, 122);
    ctx.strokeStyle = "#48616b";
    ctx.lineWidth = 0.7;
    for (let x = 4; x < 256; x += 31)
      for (let y = 4; y < 128; y += 30) ctx.strokeRect(x, y, 29, 28);
    ctx.strokeStyle = "#7a8b8d";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(1, 1, 254, 126);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const matrix = new THREE.Matrix4(),
      basis = new THREE.Matrix4(),
      q = new THREE.Quaternion();
    placements.forEach((p, i) => {
      const s = surfaces.find((s) => s.id === p.surface_id)!;
      basis.makeBasis(rp(s.u), rp(s.v), rp(s.normal));
      q.setFromRotationMatrix(basis);
      matrix.compose(
        uv(s, p.u + p.width_m / 2, p.v + p.height_m / 2, 0.045),
        q,
        new THREE.Vector3(p.width_m, p.height_m, 0.045),
      );
      mesh.current!.setMatrixAt(i, matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
    invalidate();
  }, [placements, surfaces, invalidate]);
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, placements.length]}
      key={placements.length}
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        if (e.instanceId !== undefined) onSelect(placements[e.instanceId]);
      }}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        map={texture}
        color="#d2e3e7"
        metalness={0.3}
        roughness={0.37}
      />
    </instancedMesh>
  );
}
function ObstacleMesh({
  o,
  s,
  selected,
  onSelect,
}: {
  o: Obstacle;
  s: Surface;
  selected: boolean;
  onSelect: () => void;
}) {
  const g = useMemo(() => {
    const lower = [
      [o.u, o.v],
      [o.u + o.width_m, o.v],
      [o.u + o.width_m, o.v + o.depth_m],
      [o.u, o.v + o.depth_m],
    ].map(([u, v]) => uv(s, u, v, 0.02));
    const top = lower.map((p) =>
      o.kind === "chimney"
        ? p.clone().add(new THREE.Vector3(0, o.height_m, 0))
        : p.clone().addScaledVector(rp(s.normal), o.height_m),
    );
    const geometry = new THREE.BufferGeometry().setFromPoints([
      ...lower,
      ...top,
    ]);
    geometry.setIndex([
      0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2,
      3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
    ]);
    geometry.computeVertexNormals();
    return geometry;
  }, [o, s]);
  useEffect(() => () => g.dispose(), [g]);
  return (
    <mesh
      geometry={g}
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <meshStandardMaterial
        color={
          selected ? "#c3e98b" : o.kind === "chimney" ? "#bfa58a" : "#759baa"
        }
        metalness={o.kind === "skylight" ? 0.65 : 0.05}
        roughness={o.kind === "skylight" ? 0.18 : 0.85}
      />
    </mesh>
  );
}
function House({ scene }: { scene: Scene }) {
  const r = scene.roof,
    peak =
      r.eaves_m + (Math.tan((r.pitch_deg * Math.PI) / 180) * r.depth_m) / 2;
  const g = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          -r.width_m / 2,
          r.eaves_m,
          -r.depth_m / 2,
          -r.width_m / 2,
          peak,
          0,
          -r.width_m / 2,
          r.eaves_m,
          r.depth_m / 2,
          r.width_m / 2,
          r.eaves_m,
          r.depth_m / 2,
          r.width_m / 2,
          peak,
          0,
          r.width_m / 2,
          r.eaves_m,
          -r.depth_m / 2,
        ],
        3,
      ),
    );
    geometry.computeVertexNormals();
    return geometry;
  }, [r.width_m, r.depth_m, r.eaves_m, peak]);
  useEffect(() => () => g.dispose(), [g]);
  return (
    <group rotation={[0, (-(r.azimuth_deg - 180) * Math.PI) / 180, 0]}>
      <mesh position={[0, r.eaves_m / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[r.width_m, r.eaves_m, r.depth_m]} />
        <meshStandardMaterial color="#e8e3d8" roughness={0.92} />
      </mesh>
      <mesh geometry={g} castShadow>
        <meshStandardMaterial color="#e8e3d8" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.09, 0]} receiveShadow>
        <boxGeometry args={[r.width_m + 0.4, 0.18, r.depth_m + 0.4]} />
        <meshStandardMaterial color="#c5c8bd" />
      </mesh>
      {[-1, 1].map((sign) => (
        <group key={sign} position={[0, 1.55, sign * (r.depth_m / 2 + 0.012)]}>
          {[-0.3, 0.15, 0.34].map((f, i) => (
            <mesh key={i} position={[f * r.width_m, 0, 0]}>
              <boxGeometry
                args={[i === 1 ? 1.4 : 1.1, i === 1 ? 2.3 : 1.35, 0.04]}
              />
              <meshStandardMaterial
                color="#698486"
                roughness={0.25}
                metalness={0.3}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
function CameraRig({
  view,
  roof,
  planes,
}: {
  view: string;
  roof: Scene["roof"];
  planes?: Surface[];
}) {
  const { camera, invalidate, size } = useThree();
  const controls = useRef<any>(null);
  const [width, height, depth, centerX, centerY, centerZ] = useMemo(() => {
    if (!planes) {
      const peak =
        roof.eaves_m +
        (Math.tan((roof.pitch_deg * Math.PI) / 180) * roof.depth_m) / 2;
      return [roof.width_m, peak, roof.depth_m, 0, peak / 2, 0];
    }
    const bounds = new THREE.Box3().setFromPoints(
      planes.flatMap((plane) =>
        plane.boundary_uv_m.map(([u, v]) => uv(plane, u, v)),
      ),
    );
    return [
      ...bounds.getSize(new THREE.Vector3()).toArray(),
      ...bounds.getCenter(new THREE.Vector3()).toArray(),
    ];
  }, [planes, roof]);
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const radius =
      Math.sqrt(width * width + depth * depth + height * height) / 2;
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 38;
    const distance = Math.max(
      20,
      (radius * 1.12) / (Math.sin((fov * Math.PI) / 360) * Math.min(1, aspect)),
    );
    const direction = new THREE.Vector3(
      ...((view === "top"
        ? [0, 1, 0.001]
        : view === "front"
          ? [0, 0.2, 1]
          : [20, 14, 22]) as [number, number, number]),
    ).normalize();
    camera.position.copy(
      direction
        .multiplyScalar(distance)
        .add(new THREE.Vector3(centerX, centerY, centerZ)),
    );
    camera.lookAt(centerX, centerY, centerZ);
    if (controls.current) {
      controls.current.target.set(centerX, centerY, centerZ);
      controls.current.maxDistance = Math.max(65, distance * 2);
      controls.current.update();
    }
    invalidate();
  }, [
    camera,
    view,
    invalidate,
    size.width,
    size.height,
    width,
    depth,
    height,
    centerX,
    centerY,
    centerZ,
  ]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={[centerX, centerY, centerZ]}
      minDistance={7}
      maxPolarAngle={Math.PI / 2 - 0.015}
      enableDamping
      dampingFactor={0.1}
    />
  );
}
export type ViewProps = {
  scene: Scene;
  result: Layout;
  variant?: Variant;
  sunHour: number;
  sunDate: string;
  showGrid: boolean;
  view: string;
  selected: string | null;
  hole: HoleSelection | null;
  onSelect: (id: string) => void;
  onPanel: (p: Placement) => void;
  sunMode: boolean;
  site?: SceneSite;
  footprintIds: string[];
};
function World(p: ViewProps) {
  const {
    scene,
    result,
    variant,
    sunHour,
    sunDate,
    showGrid,
    view,
    selected,
    hole,
    onSelect,
    onPanel,
    sunMode,
    site,
    footprintIds,
  } = p;
  const selectedSurface = result.surfaces.find(
    (surface) => surface.id === hole?.surfaceId,
  );
  const ring = hole && selectedSurface?.holes_uv_m?.[hole.index];
  const solar = useMemo(
    () =>
      SunCalc.getPosition(
        new Date(
          sunDate +
            "T" +
            String(Math.floor(sunHour)).padStart(2, "0") +
            ":" +
            (sunHour % 1 ? "30" : "00") +
            ":00+01:00",
        ),
        site?.latitude_deg ?? 53.4285,
        site?.longitude_deg ?? 14.5528,
      ),
    [sunDate, sunHour, site],
  );
  const alt = solar.altitude;
  const sun: Vec3 = [
    -Math.sin(solar.azimuth) * Math.cos(alt) * 35,
    Math.sin(alt) * 35,
    Math.cos(solar.azimuth) * Math.cos(alt) * 35,
  ];
  return (
    <>
      <color attach="background" args={["#e9ede6"]} />
      <fog attach="fog" args={["#e9ede6", 65, 130]} />
      <ambientLight intensity={sunMode ? 0.7 : 1.2} />
      <hemisphereLight args={["#dceafa", "#bfc5af", 1.5]} />
      <directionalLight
        position={sunMode ? sun : [-12, 23, 17]}
        intensity={sunMode ? (alt > 0 ? 2.4 : 0) : 2.8}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-camera-near={1}
        shadow-camera-far={100}
        shadow-bias={-0.0002}
        shadow-normalBias={0.03}
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.02, 0]}
        receiveShadow
      >
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#e3e8de" roughness={1} />
      </mesh>
      {showGrid && (
        <Grid
          position={[0, 0, 0]}
          args={[80, 80]}
          cellSize={1}
          sectionSize={5}
          cellThickness={0.4}
          sectionThickness={0.6}
          cellColor="#bcc7b9"
          sectionColor="#a7b5a4"
          fadeDistance={45}
          infiniteGrid
        />
      )}
      {!scene.custom_surfaces && <House scene={scene} />}
      {result.surfaces.map((s) => (
        <RoofSurface
          key={s.id}
          s={s}
          active={scene.surfaces.includes(s.id)}
          wire={showGrid}
          footprint={footprintIds.includes(s.id)}
        />
      ))}
      {selectedSurface && ring && (
        <Line
          points={[...ring, ring[0]].map(([u, v]) =>
            uv(selectedSurface, u, v, 0.015),
          )}
          color="#47782d"
          lineWidth={2}
        />
      )}
      {variant && (
        <Cells
          placements={variant.placements}
          surfaces={result.surfaces}
          onSelect={onPanel}
        />
      )}{" "}
      {scene.obstacles.map((o) => (
        <ObstacleMesh
          key={o.id}
          o={o}
          s={result.surfaces.find((s) => s.id === o.surface_id)!}
          selected={selected === o.id}
          onSelect={() => onSelect(o.id)}
        />
      ))}
      {showGrid &&
        result.surfaces
          .filter((s) => scene.surfaces.includes(s.id))
          .map((s) => <SurfaceDimension key={s.id} surface={s} />)}
      <CameraRig
        view={view}
        roof={scene.roof}
        planes={scene.custom_surfaces ? result.surfaces : undefined}
      />
    </>
  );
}
export default function SceneView(props: ViewProps) {
  return (
    <Canvas
      frameloop="demand"
      shadows
      dpr={[1, 1.6]}
      camera={{ position: [20, 17, 22], fov: 38, near: 0.1, far: 550 }}
      gl={{ antialias: true, powerPreference: "low-power" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
      }}
    >
      <Suspense fallback={null}>
        <World {...props} />
      </Suspense>
    </Canvas>
  );
}
