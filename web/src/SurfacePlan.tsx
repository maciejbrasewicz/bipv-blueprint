import type { Obstacle, PointUV, Surface, Variant } from "./types";

type Props = {
  surfaces: Surface[];
  surfaceId: string | null;
  onSurface: (id: string) => void;
  obstacles: Obstacle[];
  variant?: Variant;
  selected: string | null;
  onSelect: (id: string) => void;
  showGrid: boolean;
};

function ringPath(ring: PointUV[]) {
  return (
    ring
      .map(([u, v], index) => `${index === 0 ? "M" : "L"} ${u} ${-v}`)
      .join(" ") + " Z"
  );
}

export default function SurfacePlan({
  surfaces,
  surfaceId,
  onSurface,
  obstacles,
  variant,
  selected,
  onSelect,
  showGrid,
}: Props) {
  const surface = surfaces.find((item) => item.id === surfaceId) ?? surfaces[0];
  if (!surface) return null;

  const us = surface.boundary_uv_m.map(([u]) => u);
  const vs = surface.boundary_uv_m.map(([, v]) => v);
  const minU = Math.min(...us);
  const maxU = Math.max(...us);
  const minV = Math.min(...vs);
  const maxV = Math.max(...vs);
  const width = maxU - minU;
  const height = maxV - minV;
  const pad = Math.max(0.3, Math.max(width, height) * 0.08);
  const outline = [surface.boundary_uv_m, ...(surface.holes_uv_m ?? [])]
    .map(ringPath)
    .join(" ");
  const selectedObstacle = obstacles.find((item) => item.id === selected);
  const meters = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 });

  return (
    <section className="surface-plan" aria-label="Rzut powierzchni">
      <div className="surface-plan-header">
        <label>
          Powierzchnia
          <select
            value={surface.id}
            onChange={(event) => onSurface(event.target.value)}
          >
            {surfaces.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <span className="plan-frame">UV · m</span>
      </div>
      <svg
        className="plan-svg"
        role="group"
        aria-label={`Geometria 2D · ${surface.name}`}
        viewBox={`${minU - pad} ${-maxV - pad} ${width + 2 * pad} ${height + 2 * pad}`}
      >
        <defs>
          <pattern
            id="surface-plan-grid"
            width="1"
            height="1"
            patternUnits="userSpaceOnUse"
          >
            <path d="M 0 0 H 1 M 0 0 V 1" />
          </pattern>
        </defs>
        {showGrid && (
          <rect
            x={minU - pad}
            y={-maxV - pad}
            width={width + 2 * pad}
            height={height + 2 * pad}
            fill="url(#surface-plan-grid)"
          />
        )}
        <path className="plan-outline" d={outline} fillRule="evenodd" />
        <g aria-hidden="true" className="plan-panels">
          {variant?.placements
            .filter((panel) => panel.surface_id === surface.id)
            .map((panel) => (
              <rect
                key={panel.id}
                x={panel.u}
                y={-panel.v - panel.height_m}
                width={panel.width_m}
                height={panel.height_m}
              />
            ))}
        </g>
        {obstacles.map((obstacle, index) => {
          if (obstacle.surface_id !== surface.id) return null;
          const label = obstacle.kind === "chimney" ? "Komin" : "Okno dachowe";
          const isSelected = obstacle.id === selected;
          return (
            <rect
              key={obstacle.id}
              className={`plan-obstacle ${isSelected ? "is-selected" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={`${label} ${index + 1} w rzucie`}
              aria-pressed={isSelected}
              onClick={() => onSelect(obstacle.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(obstacle.id);
                }
              }}
              x={obstacle.u}
              y={-obstacle.v - obstacle.depth_m}
              width={obstacle.width_m}
              height={obstacle.depth_m}
            />
          );
        })}
      </svg>
      <div className="surface-plan-footer">
        <span>
          {meters.format(width)} × {meters.format(height)} m
        </span>
        <span>
          {selectedObstacle?.surface_id === surface.id
            ? `U ${meters.format(selectedObstacle.u)} · V ${meters.format(selectedObstacle.v)} m`
            : "U →  V ↑"}
        </span>
      </div>
    </section>
  );
}
