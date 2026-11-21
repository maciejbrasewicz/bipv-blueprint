import { expect, test } from "@playwright/test";
import { roofContour } from "../src/roofContour";
import type { PointUV } from "../src/types";

const bounds = { left: 10, top: 10, right: 150, bottom: 130 };

function image(
  paint: (x: number, y: number) => [number, number, number, number],
) {
  const width = 160;
  const height = 140;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(paint(x, y), (y * width + x) * 4);
  }
  return { data, width, height };
}

function contains(ring: PointUV[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[j];
    if (ay > y !== by > y && x < ax + ((bx - ax) * (y - ay)) / (by - ay))
      inside = !inside;
  }
  return inside;
}

// Independent sampled boundary metric for the benchmark, using no detector internals.
function boundarySamples(outline: PointUV[]) {
  return outline.flatMap(([x, y], i) => {
    const [nextX, nextY] = outline[(i + 1) % outline.length];
    const steps = Math.max(1, Math.ceil(2 * Math.hypot(nextX - x, nextY - y)));
    return Array.from(
      { length: steps },
      (_, j) =>
        [
          x + ((nextX - x) * j) / steps,
          y + ((nextY - y) * j) / steps,
        ] as PointUV,
    );
  });
}

function boundaryError(a: PointUV[], b: PointUV[]) {
  const nearest = (from: PointUV[], to: PointUV[]) =>
    from.reduce(
      (max, [x, y]) =>
        Math.max(
          max,
          to.reduce(
            (min, [u, v]) => Math.min(min, Math.hypot(x - u, y - v)),
            Infinity,
          ),
        ),
      0,
    );
  const x = boundarySamples(a);
  const y = boundarySamples(b);
  return Math.max(nearest(x, y), nearest(y, x));
}

const cases: { name: string; seed: PointUV; reference: PointUV[] }[] = [
  {
    name: "rectangular",
    seed: [70, 64],
    reference: [
      [40, 45],
      [105, 45],
      [105, 85],
      [40, 85],
    ],
  },
  {
    name: "concave",
    seed: [56, 65],
    reference: [
      [40, 30],
      [107, 30],
      [107, 55],
      [70, 55],
      [70, 99],
      [40, 99],
    ],
  },
  {
    name: "rotated",
    seed: [72, 65],
    reference: [
      [60, 32],
      [108, 56],
      [82, 108],
      [34, 84],
    ],
  },
];

for (const { name, seed, reference } of cases) {
  test(`seed contour recovers ${name} synthetic roof within analytical tolerances`, () => {
    const raster = image((x, y) => {
      const noise = ((x * 17 + y * 23) % 9) - 4;
      return contains(reference, x + 0.5, y + 0.5)
        ? [142 + noise, 79 + noise, 68 + noise, 255]
        : [61 + noise, 113 + noise, 82 + noise, 255];
    });
    const start = performance.now();
    const result = roofContour(raster, seed, bounds);
    const elapsed = performance.now() - start;
    expect(result).toHaveProperty("outline");
    if (!("outline" in result)) throw new Error(result.reason);

    let intersection = 0;
    let union = 0;
    for (let y = 0; y < raster.height; y++)
      for (let x = 0; x < raster.width; x++) {
        const expected = contains(reference, x + 0.5, y + 0.5);
        const actual = contains(result.outline, x + 0.5, y + 0.5);
        intersection += Number(expected && actual);
        union += Number(expected || actual);
      }
    const iou = intersection / union;
    const boundaryM = 0.2 * boundaryError(result.outline, reference);
    console.log(
      `synthetic ${name}: IoU=${iou.toFixed(4)}, sampled max boundary=${boundaryM.toFixed(3)} m, time=${elapsed.toFixed(2)} ms`,
    );
    expect(iou).toBeGreaterThan(0.96);
    expect(boundaryM).toBeLessThan(0.38);
    expect(elapsed).toBeLessThan(750);
  });
}

const seed: PointUV = [65, 55];
const inRoof = (x: number, y: number) =>
  x >= 35 && x < 105 && y >= 25 && y < 95;
const roof: [number, number, number, number] = [142, 79, 68, 255];
const ground: [number, number, number, number] = [61, 113, 82, 255];

test("seed contour declines an unbounded flood, low contrast, and a clipped roof", () => {
  expect(
    roofContour(
      image(() => roof),
      seed,
      bounds,
    ),
  ).toEqual({ reason: "weak-boundary" });
  expect(
    roofContour(
      image((x, y) => (inRoof(x, y) ? roof : [110, 79, 68, 255])),
      seed,
      bounds,
    ),
  ).toEqual({
    reason: "weak-boundary",
  });
  expect(
    roofContour(
      image((x, y) => (inRoof(x, y) ? roof : ground)),
      seed,
      { ...bounds, left: 50 },
    ),
  ).toEqual({
    reason: "weak-boundary",
  });
});

test("seed contour declines a courtyard that would be filled by a single ring", () => {
  const pixels = image((x, y) =>
    inRoof(x, y) && !(x >= 55 && x < 85 && y >= 60 && y < 90) ? roof : ground,
  );
  expect(roofContour(pixels, seed, bounds)).toEqual({
    reason: "complex-outline",
  });
});

test("seed contour declines missing pixels and a seed outside the search area", () => {
  const pixels = image(() => [0, 0, 0, 0]);
  expect(roofContour(pixels, seed, bounds)).toEqual({ reason: "no-data" });
  expect(roofContour(pixels, [2, 4], bounds)).toEqual({ reason: "outside" });
});

test("seed contour declines a stable segment that covers only part of the building", () => {
  const pixels = image((x, y) =>
    x >= 30 && x < 75 && y >= 25 && y < 70 ? roof : ground,
  );
  expect(
    roofContour(pixels, seed, bounds, { areaPx: 4900, maximumPx: 6250 }),
  ).toEqual({
    reason: "area-mismatch",
  });
});
