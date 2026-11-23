import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { Box3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

test("location waits for address and building choices and creates the selected EGiB model", async ({
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
      latitude_deg: 52.8063342,
      longitude_deg: 20.4840025,
      source: "gugik-egib-wfs",
      retrieved_at: "2026-11-21T10:00:00Z",
    },
    {
      address: addresses[1].label,
      building_id: "FIXTURE_SECOND",
      latitude_deg: 52.8063101,
      longitude_deg: 20.485931,
      source: "gugik-egib-wfs",
      retrieved_at: "2026-11-21T10:00:00Z",
    },
  ];
  const candidates = sites.map((site, index) => {
    const east = index * 130;
    return {
      site,
      distance_m: east,
      area_m2: 48,
      rings_m: [
        [
          [
            [east, 0],
            [east + 8, 0],
            [east + 8, 6],
            [east, 6],
            [east, 0],
          ],
        ],
      ],
    };
  });
  await page.route("**/api/geo/sources", (route) =>
    route.fulfill({ json: { enabled: true } }),
  );
  await page.route("**/api/geo/addresses", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      address: "Marki testowe, Próbna 12",
    });
    return route.fulfill({ json: { candidates: addresses } });
  });
  let footprintRequests = 0;
  await page.route("**/api/geo/buildings", (route) => {
    footprintRequests++;
    const request = route.request().postDataJSON();
    const radius = request.radius_m ?? 60;
    expect(request).toEqual(
      radius === 60 ? addresses[1] : { ...addresses[1], radius_m: radius },
    );
    // The provider can omit every nearby outline when a larger window hits its limit.
    const candidatesByRadius: Record<number, typeof candidates> = {
      60: [candidates[0]],
      120: [],
      240:
        footprintRequests < 5
          ? [candidates[1]]
          : [candidates[1], { ...candidates[0], area_m2: 50 }],
    };
    return route.fulfill({
      json: {
        radius_m: radius,
        partial: radius !== 60,
        candidates: candidatesByRadius[radius],
      },
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Ustal lokalizację budynku" }).click();
  const dialog = page.getByRole("dialog", { name: "Lokalizacja budynku" });
  await dialog
    .getByRole("searchbox", { name: "Miejscowość" })
    .fill("Marki testowe");
  await dialog
    .getByRole("searchbox", { name: "Ulica i numer budynku" })
    .fill("Próbna 12");
  await dialog.getByRole("button", { name: "Szukaj adresu" }).click();
  const second = dialog.getByRole("button", { name: /Region B/ });
  await expect(second).toBeVisible();
  expect(footprintRequests).toBe(0);
  await second.click();
  const confirm = dialog.getByRole("button", { name: "Potwierdź budynek" });
  await expect(confirm).toBeDisabled();
  const narrowBuilding = dialog.getByRole("radio", { name: /FIXTURE_FIRST/ });
  const wideBuilding = dialog.getByRole("radio", { name: /FIXTURE_SECOND/ });
  const range = dialog.getByRole("combobox", { name: "Zasięg mapy" });
  await expect(wideBuilding).toHaveCount(0);
  await narrowBuilding.check();
  await range.selectOption("120");
  await expect(range).toHaveValue("120");
  await expect(
    dialog.getByText(/Rejestr zwrócił ograniczony zestaw obrysów/),
  ).toBeVisible();
  await expect(narrowBuilding).toBeChecked();
  await range.selectOption("240");
  await expect(wideBuilding).toBeVisible();
  await expect(narrowBuilding).toBeChecked();
  await wideBuilding.check();
  await range.selectOption("60");
  await expect(range).toHaveValue("60");
  await expect(wideBuilding).toHaveCount(0);
  await expect(confirm).toBeDisabled();
  await range.selectOption("240");
  await wideBuilding.check();
  await expect(narrowBuilding).toHaveCount(1);
  await expect(narrowBuilding).toHaveAccessibleName(/50 m²/);
  expect(footprintRequests).toBe(5);
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
  expect(data.scene.geometry.custom_surfaces[0].id).toBe("egib-roof-1");
  expect(data.scene.geometry.custom_surfaces[0].origin).toEqual([0, 0, 6]);
  expect(data.scene.surface_evidence[0]).toMatchObject({
    status: "estimated",
    egib_assumed_height_m: 6,
  });

  await page.getByRole("button", { name: "Eksport", exact: true }).click();
  const model = page.waitForEvent("download");
  await page.getByRole("button", { name: "Model 3D GLB" }).click();
  const asset = await readFile((await (await model).path())!);
  const gltf = await new GLTFLoader().parseAsync(
    new Uint8Array(asset).buffer,
    "",
  );
  const walls = gltf.scene.getObjectByName("walls_egib-roof-1");
  expect(walls?.userData.role).toBe("estimated_footprint_walls");
  const wallBounds = new Box3().setFromObject(walls!);
  expect([wallBounds.min.y, wallBounds.max.y]).toEqual([0, 6]);
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
  await dialog
    .getByRole("searchbox", { name: "Miejscowość" })
    .fill("Marki testowe");
  await dialog
    .getByRole("searchbox", { name: "Ulica i numer budynku" })
    .fill("Próbna 12");
  const search = dialog.getByRole("button", { name: "Szukaj adresu" });
  await search.click();
  await expect(dialog.getByRole("alert")).toContainText("nie odpowiedział");
  await search.click();
  await expect(dialog.getByText(/Brak punktów adresowych/)).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Potwierdź budynek" }),
  ).toHaveCount(0);
});

test("orthophoto retries, measures, corrects a trace and exports estimated geometry", async ({
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
    latitude_deg: 52.1907565,
    longitude_deg: 21.5499962,
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
    ctx.fillRect(310, 270, 32, 30);
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
        sha256: "a".repeat(64),
        retrieved_at: "2026-11-21T10:02:00Z",
        image_base64: pixels[Math.min(imageryRequests++, 1)],
      },
    });
  });
  await page.getByRole("button", { name: "Ustal lokalizację budynku" }).click();
  const dialog = page.getByRole("dialog", { name: "Lokalizacja budynku" });
  await dialog
    .getByRole("searchbox", { name: "Miejscowość" })
    .fill("Adres testowy");
  await dialog
    .getByRole("searchbox", { name: "Ulica i numer budynku" })
    .fill("Próbna 20");
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

  await imageButton.click();
  await dialog.getByRole("button", { name: "Obrysuj dach" }).click();
  const form = dialog.getByRole("form", { name: "Obrys dachu" });
  const submit = form.getByRole("button", { name: "Zastąp geometrię obrysem" });
  await expect(submit).toBeDisabled();
  async function draw(e: number, n: number) {
    await svg.scrollIntoViewIfNeeded();
    const { x, y } = await svg.evaluate(
      (element, [east, north]) => {
        const matrix = (element as SVGSVGElement).getScreenCTM()!;
        const { x, y } = new DOMPoint(east, -north).matrixTransform(matrix);
        return { x, y };
      },
      [e, n],
    );
    await page.mouse.click(x, y);
  }
  for (const [e, n] of [
    [-6, -4],
    [6, -4],
    [-6, 4],
    [6, 4],
  ])
    await draw(e, n);
  await form.getByRole("spinbutton").fill("6.4");
  await submit.click();
  await expect(form.getByRole("alert")).toContainText("Obrys przecina się");

  await form.getByRole("button", { name: "Przesuń punkt 3" }).click();
  await draw(6, 4);
  await form.getByRole("button", { name: "Przesuń punkt 4" }).click();
  await draw(-6, 4);
  await submit.click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByText("Dach płaski · obrys z ortofotomapy").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cofnij", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ustal lokalizację budynku" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ponów", exact: true }).click();
  await page.reload();
  await expect(page.getByText(/EGiB · ORTHO_BUILDING/)).toBeVisible();

  const exportMenu = page.getByRole("button", { name: "Eksport", exact: true });
  await exportMenu.click();
  const objDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Model 3D OBJ" }).click();
  const obj = await readFile((await (await objDownload).path())!, "utf8");
  const roof = obj.split("g surface_trace-roof\n")[1].split("\ng ")[0];
  const vertices = roof
    .split("\n")
    .filter((line) => line.startsWith("v "))
    .map((line) => line.split(" ").slice(1).map(Number));
  expect(vertices).toHaveLength(6);
  expect(vertices.every(([, height]) => height === 6.4)).toBe(true);

  await exportMenu.click();
  const sceneDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Projekt JSON" }).click();
  const data = JSON.parse(
    await readFile((await (await sceneDownload).path())!, "utf8"),
  );
  const evidence = data.scene.surface_evidence[0];
  expect(evidence.status).toBe("estimated");
  expect(evidence.orthophoto_trace).toMatchObject({
    building_id: "ORTHO_BUILDING",
    image_sha256: "a".repeat(64),
    roof_height_m: 6.4,
  });
  const [first, second, third, fourth] = evidence.orthophoto_trace.outline_en_m;
  expect(second[0] - first[0]).toBeGreaterThan(11.5);
  expect(fourth[1] - first[1]).toBeGreaterThan(7.5);
  expect(third[0]).toBeGreaterThan(5.5);

  await page.getByRole("button", { name: "Zmień lokalizację budynku" }).click();
  await dialog.getByRole("button", { name: "Szukaj adresu" }).click();
  await dialog.getByRole("button", { name: point.label }).click();
  await selected.check();
  // Use a fresh image ID for this assisted draft so reopening does not restore the manual trace.
  await page.route("**/api/geo/orthophoto", (route) =>
    route.fulfill({
      json: {
        bounds_m: { west: 674187, south: 483524, east: 674307, north: 483644 },
        grid_m_per_pixel: 0.2,
        width_px: 600,
        height_px: 600,
        sha256: "c".repeat(64),
        retrieved_at: "2026-11-21T10:04:00Z",
        image_base64: pixels[1],
      },
    }),
  );
  await imageButton.click();
  await dialog.getByRole("button", { name: "Obrysuj dach" }).click();
  const suggest = form.getByRole("button", { name: "Zaproponuj obrys" });
  await suggest.click();
  await draw(-4, -4);
  await expect(form.getByRole("alert")).toContainText(
    "Nie znaleziono wyraźnego obrysu",
  );
  await expect(svg.locator(".trace-vertex")).toHaveCount(0);
  await suggest.click();
  await draw(4, 3);
  await expect(form.getByText(/Sprawdź i popraw/)).toBeVisible();
  await expect(svg.locator(".trace-vertex")).toHaveCount(4);
  await form.getByRole("button", { name: "Przesuń punkt 1" }).click();
  await draw(2.5, 6);
  await form.getByLabel("Kształt dachu").selectOption("gable");
  const placeRidge = form.getByRole("button", {
    name: "Wskaż dwa punkty kalenicy",
  });
  await placeRidge.click();
  await draw(0, 9);
  await draw(9, 9);
  await expect(svg.locator(".trace-ridge circle")).toHaveCount(2);
  await expect(svg.locator(".trace-ridge line")).toHaveCSS(
    "stroke",
    "rgb(107, 217, 255)",
  );
  await form.getByLabel("Nachylenie obu połaci (°)").fill("30");
  await form.getByLabel(/Wysokość kalenicy/).fill("5");
  await submit.click();
  await expect(form.getByRole("alert")).toContainText("dokładnie dwie połacie");
  await form.getByRole("button", { name: "Wskaż kalenicę ponownie" }).click();
  await draw(0, 3);
  await draw(9, 3);
  const applied = page.waitForResponse((response) =>
    response.url().endsWith("/scene/from-orthophoto"),
  );
  await submit.click();
  const result = await applied;
  expect(result.status()).toBe(200);
  const gable = await result.json();
  expect(gable.geometry.surfaces).toEqual(["trace-gable-a", "trace-gable-b"]);
  const [updated, other] = gable.surface_evidence;
  expect(updated.orthophoto_trace).toEqual(other.orthophoto_trace);
  expect(updated.orthophoto_trace.gable.pitch_deg).toBe(30);
  expect(updated.orthophoto_trace.gable.ridge_en_m).toHaveLength(2);
  expect(updated.orthophoto_trace.suggestion_method).toBe("seed-rgb-v1");
  expect(updated.orthophoto_trace.outline_en_m[0][0]).toBeCloseTo(2.5, 0);
  await expect(dialog).toBeHidden();

  await exportMenu.click();
  const gableDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Model 3D OBJ" }).click();
  const model = await readFile((await (await gableDownload).path())!, "utf8");
  expect(model).toContain("g surface_trace-gable-a\n");
  expect(model).toContain("g surface_trace-gable-b\n");

  await exportMenu.click();
  const binaryDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Model 3D GLB" }).click();
  const binary = await binaryDownload;
  expect(binary.suggestedFilename()).toBe("bipv-model.glb");
  const bytes = await readFile((await binary.path())!);
  const loaded = await new GLTFLoader().parseAsync(
    Uint8Array.from(bytes).buffer,
    "",
  );
  const roofNodes = loaded.scene.children.filter(
    (node) => node.userData.role === "surface",
  );
  expect(roofNodes.map((node) => node.userData.surfaceId)).toEqual([
    "trace-gable-a",
    "trace-gable-b",
  ]);
  for (const node of roofNodes)
    expect(new Box3().setFromObject(node).max.y).toBeCloseTo(5, 5);
  expect(
    loaded.scene.children.some((node) => node.userData.role === "pv"),
  ).toBe(true);
});

test("a wider chosen building renders actual PV and an older saved footprint can be reactivated", async ({
  page,
}) => {
  const point = {
    label: "Budynek referencyjny, Testowa 4",
    region: "Scenariusz QA",
    easting_m: 500000,
    northing_m: 500000,
  };
  const site = {
    address: point.label,
    building_id: "QA-40x20",
    latitude_deg: 52.36594762063416,
    longitude_deg: 19,
    source: "gugik-egib-wfs",
    retrieved_at: "2026-11-23T09:00:00Z",
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
            area_m2: 800,
            distance_m: 0,
            rings_m: [
              [
                [
                  [-20, -10],
                  [20, -10],
                  [20, 10],
                  [-20, 10],
                  [-20, -10],
                ],
              ],
            ],
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Ustal lokalizację budynku" }).click();
  const dialog = page.getByRole("dialog", { name: "Lokalizacja budynku" });
  await expect(
    dialog.getByRole("combobox", { name: "Przykładowe okolice" }),
  ).toHaveCount(0);
  await dialog
    .getByRole("searchbox", { name: "Miejscowość" })
    .fill("Budynek referencyjny");
  await dialog
    .getByRole("searchbox", { name: "Ulica i numer budynku" })
    .fill("Testowa 4");
  await dialog.getByRole("button", { name: "Szukaj adresu" }).click();
  await dialog.getByRole("button", { name: point.label }).click();
  await dialog.getByRole("radio", { name: /^Budynek 1/ }).check();
  await dialog.getByRole("button", { name: "Potwierdź budynek" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("status").filter({ hasText: "Geometria obliczona" }),
  ).toBeVisible({ timeout: 45_000 });
  const modules = page.locator(".metric-grid strong").first();
  await expect(modules).not.toHaveText(/^(—|0)/);
  const count = Number((await modules.innerText()).replace(/\D/g, ""));
  expect(count).toBeGreaterThan(0);
  await expect(page.getByText("Model wstępny z EGiB")).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();

  await page.getByRole("button", { name: "Eksport", exact: true }).click();
  const saved = page.waitForEvent("download");
  await page.getByRole("button", { name: "Projekt JSON" }).click();
  const exported = JSON.parse(
    await readFile((await (await saved).path())!, "utf8"),
  );
  expect(exported.scene.geometry.surfaces).toEqual(["egib-roof-1"]);
  await page.getByRole("button", { name: "Eksport", exact: true }).click();
  const glbDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Model 3D GLB" }).click();
  const glbBytes = await readFile((await (await glbDownload).path())!);
  const gltf = await new GLTFLoader().parseAsync(
    new Uint8Array(glbBytes).buffer,
    "",
  );
  const pvMesh = gltf.scene.getObjectByName("pv_egib-roof-1");
  expect(pvMesh?.userData.role).toBe("pv");
  expect(pvMesh?.userData.moduleIds).toHaveLength(count);

  // A project saved by a previous release had an empty selection for large footprints.
  exported.scene.geometry.surfaces = [];
  await page.locator('input[type="file"]').setInputFiles({
    name: "legacy-large-footprint.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(
    page.getByRole("button", { name: "Aktywuj obrys do obliczeń" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Aktywuj obrys do obliczeń" }).click();
  await expect(page.getByTestId("layout-status")).toHaveText(
    "Geometria obliczona",
    { timeout: 45_000 },
  );
  await expect(modules).not.toHaveText(/^(—|0)/);
});
