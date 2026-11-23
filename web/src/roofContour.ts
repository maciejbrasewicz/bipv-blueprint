import type { PointUV } from "./types";

export const ROOF_CONTOUR_METHOD = "seed-rgb-v1";

type Pixels = Pick<ImageData, "width" | "height" | "data">;
export type PixelBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
type Result =
  | { outline: PointUV[] }
  | {
      reason:
        | "outside"
        | "no-data"
        | "weak-boundary"
        | "complex-outline"
        | "area-mismatch";
    };

// The RGB thresholds and shape limits are conservative defaults for this baseline.
const THRESHOLDS = [29, 46] as const;
const MAX_SEARCH_SIDE = 320;
const MIN_REGION = 25;
const MAX_PERIMETER = 1400;

function seedColor(image: Pixels, x: number, y: number) {
  const channels: [number[], number[], number[]] = [[], [], []];
  for (let row = y - 1; row <= y + 1; row++) {
    for (let col = x - 1; col <= x + 1; col++) {
      const offset = 4 * (row * image.width + col);
      if (image.data[offset + 3] < 128) continue;
      channels.forEach((channel, i) => channel.push(image.data[offset + i]));
    }
  }
  if (channels[0].length < 5) return null;
  return channels.map(
    (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)],
  );
}

function grow(
  image: Pixels,
  seed: PointUV,
  bounds: PixelBounds,
  rgb: number[],
  threshold: number,
) {
  const { left, top, right, bottom } = bounds;
  const { width, height, data } = image;
  const region = new Uint8Array(width * height);
  const queue = new Int32Array((right - left) * (bottom - top));
  const thresholdSquared = threshold * threshold;
  let scale = 0;

  function add(x: number, y: number) {
    const index = y * width + x;
    if (region[index]) return;
    const i = index * 4;
    const difference =
      (data[i] - rgb[0]) ** 2 +
      (data[i + 1] - rgb[1]) ** 2 +
      (data[i + 2] - rgb[2]) ** 2;
    if (data[i + 3] < 128 || difference > thresholdSquared) {
      region[index] = 2;
      return;
    }
    region[index] = 1;
    queue[scale++] = index;
  }

  add(seed[0], seed[1]);
  for (let cursor = 0; cursor < scale; cursor++) {
    const index = queue[cursor];
    const y = Math.floor(index / width);
    const x = index - width * y;
    if (x === left || x === right - 1 || y === top || y === bottom - 1)
      return null;
    add(x - 1, y);
    add(x + 1, y);
    add(x, y - 1);
    add(x, y + 1);
  }
  return { region, size: scale, pixels: queue.subarray(0, scale) };
}

function signedArea(ring: PointUV[]) {
  return (
    ring.reduce((sum, [ax, ay], i) => {
      const [bx, by] = ring[(i + 1) % ring.length];
      return sum + ax * by - ay * bx;
    }, 0) / 2
  );
}

function boundary(image: Pixels, mask: NonNullable<ReturnType<typeof grow>>) {
  const { width } = image;
  const stride = width + 1;
  const edges = new Map<number, number>();
  let ambiguous = false;

  function edge(from: number, to: number) {
    if (edges.has(from)) ambiguous = true;
    edges.set(from, to);
  }

  for (const index of mask.pixels) {
    const y = Math.floor(index / width);
    const x = index - width * y;
    const v = y * stride + x;
    if (mask.region[index - width] !== 1) edge(v, v + 1);
    if (mask.region[index + 1] !== 1) edge(v + 1, v + stride + 1);
    if (mask.region[index + width] !== 1) edge(v + stride + 1, v + stride);
    if (mask.region[index - 1] !== 1) edge(v + stride, v);
    if (ambiguous || edges.size > MAX_PERIMETER) return null;
  }

  let outside: PointUV[] = [];
  let outsideArea = 0;
  while (edges.size) {
    const start = edges.keys().next().value!;
    const ring: PointUV[] = [];
    let v = start;
    do {
      const to = edges.get(v);
      if (to === undefined) return null;
      ring.push([v % stride, Math.floor(v / stride)]);
      edges.delete(v);
      v = to;
    } while (v !== start);
    const area = signedArea(ring);
    if (area > outsideArea) {
      outside = ring;
      outsideArea = area;
    }
  }
  return outsideArea > 0 &&
    outsideArea - mask.size <= Math.max(9, 0.08 * outsideArea)
    ? outside
    : null;
}

function segmentDistanceSquared(p: PointUV, a: PointUV, b: PointUV) {
  const x = b[0] - a[0];
  const y = b[1] - a[1];
  const squared = x * x + y * y;
  const t = squared
    ? Math.max(
        0,
        Math.min(1, ((p[0] - a[0]) * x + (p[1] - a[1]) * y) / squared),
      )
    : 0;
  return (p[0] - a[0] - t * x) ** 2 + (p[1] - a[1] - t * y) ** 2;
}

function simplify(ring: PointUV[]) {
  // Boundary extraction starts at the first edge reached by the flood. Start
  // simplification at a stable corner instead of potentially retaining a point
  // in the middle of the first straight edge.
  const anchor = ring.reduce((best, [x, y], index) => {
    const [bx, by] = ring[best];
    return y < by || (y === by && x < bx) ? index : best;
  }, 0);
  ring = [...ring.slice(anchor), ...ring.slice(0, anchor)];
  const closed = [...ring, ring[0]];
  const keep = new Set([0]);
  const stack = [[0, closed.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let furthest = 1.5 ** 2;
    let split = 0;
    for (let i = start + 1; i < end; i++) {
      const distance = segmentDistanceSquared(
        closed[i],
        closed[start],
        closed[end],
      );
      if (distance > furthest) {
        furthest = distance;
        split = i;
      }
    }
    if (split) {
      keep.add(split);
      if (keep.size > 48) return [];
      stack.push([start, split], [split, end]);
    }
  }
  return ring.filter((_, index) => keep.has(index));
}

export function roofContour(
  image: Pixels,
  clicked: PointUV,
  region: PixelBounds,
  footprint?: { areaPx: number; maximumPx: number },
): Result {
  const [x, y] = clicked.map(Math.floor);
  const bounds = {
    left: Math.max(0, Math.floor(region.left)),
    top: Math.max(0, Math.floor(region.top)),
    right: Math.min(image.width, Math.ceil(region.right)),
    bottom: Math.min(image.height, Math.ceil(region.bottom)),
  };
  if (
    x < bounds.left + 1 ||
    x >= bounds.right - 1 ||
    y < bounds.top + 1 ||
    y >= bounds.bottom - 1 ||
    bounds.right - bounds.left > MAX_SEARCH_SIDE ||
    bounds.bottom - bounds.top > MAX_SEARCH_SIDE
  )
    return { reason: "outside" };

  const color = seedColor(image, x, y);
  if (!color) return { reason: "no-data" };
  const strict = grow(image, [x, y], bounds, color, THRESHOLDS[0]);
  const lenient = grow(image, [x, y], bounds, color, THRESHOLDS[1]);
  if (
    !strict ||
    !lenient ||
    strict.size < MIN_REGION ||
    lenient.size > 1.3 * strict.size
  ) {
    return { reason: "weak-boundary" };
  }

  const ring = boundary(image, strict);
  if (!ring) return { reason: "complex-outline" };
  const outline = simplify(ring);
  const area = signedArea(outline);
  if (
    outline.length < 3 ||
    Math.abs(area - signedArea(ring)) > 0.1 * strict.size
  )
    return { reason: "complex-outline" };
  if (
    footprint &&
    (area < 0.6 * footprint.areaPx ||
      area > Math.min(1.6 * footprint.areaPx, footprint.maximumPx))
  ) {
    return { reason: "area-mismatch" };
  }
  return { outline };
}
