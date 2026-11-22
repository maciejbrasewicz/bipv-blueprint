import { useEffect, useRef } from "react";

type Point = [number, number];

export type FootprintSpecimen = {
  id: string;
  revision: number;
  input_sha256: string;
  height_m: number;
  rings_m: Point[][];
};

const width = 640;
const height = 336;

function drawSpecimen(
  ctx: CanvasRenderingContext2D,
  rings: Point[][],
  elevation: number,
  plan: boolean,
) {
  const project = ([e, n]: Point, z: number): Point =>
    plan
      ? [320 + e * 34, 168 - n * 34]
      : [320 + (e - n) * 25, 225 + (e + n) * 11 - z * 22];

  function outline(points: Point[]) {
    points.forEach(([x, y], i) =>
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y),
    );
    ctx.closePath();
  }

  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#345147";
  ctx.beginPath();
  for (let i = -10; i <= 10; i++) {
    ctx.moveTo(...project([-10, i], 0));
    ctx.lineTo(...project([10, i], 0));
    ctx.moveTo(...project([i, -10], 0));
    ctx.lineTo(...project([i, 10], 0));
  }
  ctx.stroke();

  function surface(fill: string, z: number) {
    ctx.beginPath();
    for (const ring of rings) outline(ring.map((p) => project(p, z)));
    ctx.fillStyle = fill;
    ctx.fill("evenodd");
    ctx.strokeStyle = "#d2ebd9";
    ctx.stroke();
  }

  if (plan) {
    surface("#53796d", 0);
    return;
  }

  const [outer, ...holes] = rings;
  ctx.beginPath();
  outline(outer.map((p) => project(p, elevation)));
  ctx.fillStyle = "#263e35";
  ctx.fill();

  function walls(ring: Point[], courtyard: boolean) {
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1];
      const b = ring[i];
      const slope = b[0] - a[0] - (b[1] - a[1]);
      if (slope === 0 || slope > 0 !== courtyard) continue;
      ctx.beginPath();
      outline([
        project(a, elevation),
        project(b, elevation),
        project(b, 0),
        project(a, 0),
      ]);
      ctx.fillStyle =
        a[0] === b[0] ? (courtyard ? "#587468" : "#5d8073") : "#3d6255";
      ctx.fill();
      ctx.strokeStyle = "#93b4a7";
      ctx.stroke();
    }
  }

  for (const ring of holes) walls(ring, true);
  walls(outer, false);
  surface("#729d8b", elevation);
}

export default function FootprintReference({
  specimen,
  plan,
}: {
  specimen: FootprintSpecimen;
  plan: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    drawSpecimen(ctx, specimen.rings_m, specimen.height_m, plan);
  }, [specimen, plan]);

  return (
    <canvas
      ref={canvas}
      width={width * 2}
      height={height * 2}
      role="img"
      aria-label={
        plan
          ? "Rzut kontrolny obrysu budynku z dziedzińcem"
          : "Bryła kontrolna budynku z dziedzińcem"
      }
    />
  );
}
