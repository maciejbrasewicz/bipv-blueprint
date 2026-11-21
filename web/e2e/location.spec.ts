import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("location waits for address and building choices and saves only the selected reference", async ({
  page,
}) => {
  const addresses = [
    {
      label: "Marki testowe, Próbna 12",
      region: "Region A",
      easting_m: 500000,
      northing_m: 500000,
    },
    {
      label: "Marki testowe, Próbna 12",
      region: "Region B",
      easting_m: 600000,
      northing_m: 550000,
    },
  ];
  const sites = [
    {
      address: addresses[1].label,
      building_id: "FIXTURE_FIRST",
      latitude_deg: 52.42,
      longitude_deg: 20.18,
      source: "gugik-egib-wfs",
      retrieved_at: "2026-11-21T10:00:00Z",
    },
    {
      address: addresses[1].label,
      building_id: "FIXTURE_SECOND",
      latitude_deg: 52.4204,
      longitude_deg: 20.1804,
      source: "gugik-egib-wfs",
      retrieved_at: "2026-11-21T10:00:00Z",
    },
  ];
  await page.route("**/api/geo/sources", (route) =>
    route.fulfill({ json: { enabled: true } }),
  );
  await page.route("**/api/geo/addresses", (route) =>
    route.fulfill({ json: { candidates: addresses } }),
  );
  let footprintRequests = 0;
  await page.route("**/api/geo/buildings", (route) => {
    footprintRequests++;
    expect(route.request().postDataJSON()).toEqual(addresses[1]);
    return route.fulfill({
      json: {
        radius_m: 60,
        partial: true,
        candidates: sites.map((site, index) => ({
          site,
          distance_m: index * 20,
          area_m2: 48,
          rings_m: [
            [
              [
                [index * 20, 0],
                [8 + index * 20, 0],
                [8 + index * 20, 6],
                [index * 20, 6],
                [index * 20, 0],
              ],
            ],
          ],
        })),
      },
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Ustal lokalizację budynku" }).click();
  const dialog = page.getByRole("dialog", { name: "Lokalizacja budynku" });
  const query = dialog.getByRole("searchbox", { name: "Adres w Polsce" });
  await query.fill("Próbna 12");
  await dialog.getByRole("button", { name: "Szukaj adresu" }).click();
  const second = dialog.getByRole("button", { name: /Region B/ });
  await expect(second).toBeVisible();
  expect(footprintRequests).toBe(0);
  await second.click();
  const confirm = dialog.getByRole("button", { name: "Potwierdź budynek" });
  await expect(confirm).toBeDisabled();
  await expect(
    dialog.getByText("Rejestr zwrócił ograniczony zestaw obrysów."),
  ).toBeVisible();
  await dialog.getByRole("radio", { name: /Budynek 2/ }).check();
  await expect(dialog.locator(".chosen-building")).toHaveCount(1);
  await confirm.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/EGiB · FIXTURE_SECOND/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/EGiB · FIXTURE_SECOND/)).toBeVisible();

  await page.getByRole("button", { name: "Eksport", exact: true }).click();
  const exported = page.waitForEvent("download");
  await page.getByRole("button", { name: "Projekt JSON" }).click();
  const data = JSON.parse(
    await readFile((await (await exported).path())!, "utf8"),
  );
  expect(data.scene.site).toEqual(sites[1]);
  expect(data.scene.geometry.schema_version).toBe("1.0.0");
  expect(data.scene.geometry.custom_surfaces ?? null).toBeNull();
});

test("location lets the user retry provider failure and handles lack of coverage", async ({
  page,
}) => {
  await page.route("**/api/geo/sources", (route) =>
    route.fulfill({ json: { enabled: true } }),
  );
  let attempts = 0;
  await page.route("**/api/geo/addresses", (route) => {
    attempts++;
    return attempts === 1
      ? route.fulfill({
          status: 504,
          json: { detail: "GUGiK nie odpowiedział w wyznaczonym czasie." },
        })
      : route.fulfill({ json: { candidates: [] } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Ustal lokalizację budynku" }).click();
  const dialog = page.getByRole("dialog", { name: "Lokalizacja budynku" });
  await dialog.getByRole("searchbox").fill("Adres testowy");
  const search = dialog.getByRole("button", { name: "Szukaj adresu" });
  await search.click();
  await expect(dialog.getByRole("alert")).toContainText("nie odpowiedział");
  await search.click();
  await expect(dialog.getByText(/Brak punktów adresowych/)).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Potwierdź budynek" }),
  ).toHaveCount(0);
});

test("orthophoto keeps the EGiB reference and supports a 3-4-5 metre map measurement", async ({
  page,
}) => {
  const point = {
    label: "Adres testowy, Próbna 20",
    region: "",
    easting_m: 674247,
    northing_m: 483584,
  };
  const site = {
    address: point.label,
    building_id: "ORTHO_BUILDING",
    latitude_deg: 52.42,
    longitude_deg: 20.18,
    source: "gugik-egib-wfs",
    retrieved_at: "2026-11-21T10:00:00Z",
  };
  await page.route("**/api/geo/sources", (route) =>
    route.fulfill({ json: { enabled: true } }),
  );
  await page.route("**/api/geo/addresses", (route) =>
    route.fulfill({ json: { candidates: [point] } }),
  );
  await page.route("**/api/geo/buildings", (route) =>
    route.fulfill({
      json: {
        radius_m: 60,
        partial: false,
        candidates: [
          {
            site,
            distance_m: 0,
            area_m2: 48,
            rings_m: [
              [
                [
                  [0, 0],
                  [8, 0],
                  [8, 6],
                  [0, 6],
                  [0, 0],
                ],
              ],
            ],
          },
        ],
      },
    }),
  );
  await page.goto("/");
  const pixels = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 600;
    const blank = canvas.toDataURL("image/png").split(",")[1];
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#6f8565";
    ctx.fillRect(0, 0, 600, 600);
    ctx.fillStyle = "#def4ca";
    ctx.fillRect(310, 270, 24, 30);
    return [blank, canvas.toDataURL("image/png").split(",")[1]];
  });
  let imageryRequests = 0;
  await page.route("**/api/geo/orthophoto", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      easting_m: 674247,
      northing_m: 483584,
    });
    return route.fulfill({
      json: {
        bounds_m: { west: 674187, south: 483524, east: 674307, north: 483644 },
        grid_m_per_pixel: 0.2,
        width_px: 600,
        height_px: 600,
        image_base64: pixels[imageryRequests++],
      },
    });
  });
  await page.getByRole("button", { name: "Ustal lokalizację budynku" }).click();
  const dialog = page.getByRole("dialog", { name: "Lokalizacja budynku" });
  await dialog.getByRole("searchbox").fill("Adres testowy");
  await dialog.getByRole("button", { name: "Szukaj adresu" }).click();
  await dialog.getByRole("button", { name: point.label }).click();
  const imageButton = dialog.getByRole("button", {
    name: "Pokaż ortofotomapę",
  });
  await expect(imageButton).toBeVisible();
  expect(imageryRequests).toBe(0);
  const selected = dialog.getByRole("radio", { name: /Budynek 1/ });
  await selected.check();
  await imageButton.click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Brak pokrycia ortofotomapą",
  );
  await expect(selected).toBeChecked();
  await imageButton.click();
  const svg = dialog.locator("svg.building-map");
  const image = svg.locator("image");
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("x", "-60");
  await expect(image).toHaveAttribute("y", "-60");
  await expect(image).toHaveAttribute("width", "120");

  await dialog.getByRole("button", { name: "Zmierz odległość" }).click();
  const coords = await svg.evaluate((element) => {
    const matrix = (element as SVGSVGElement).getScreenCTM()!;
    return [
      [8, 5],
      [11, 9],
    ].map(([u, v]) => {
      const { x, y } = new DOMPoint(u, v).matrixTransform(matrix);
      return { x, y };
    });
  });
  for (const { x, y } of coords) await page.mouse.click(x, y);
  // Mouse coordinates are rounded by Chromium before dispatch.
  await expect(dialog.getByRole("status")).toHaveText(
    /Odległość: (4,[5-9]|5(,[0-5])?) m/,
  );
  await expect(svg.locator("line")).toHaveCount(1);
  await expect(selected).toBeChecked();
  await dialog.getByRole("button", { name: "Ukryj ortofotomapę" }).click();
  await expect(image).toHaveCount(0);
  await expect(svg.locator("line")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Potwierdź budynek" }),
  ).toBeEnabled();
});
