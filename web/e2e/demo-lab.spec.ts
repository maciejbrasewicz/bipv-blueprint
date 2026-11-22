import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

test("Electrotile lab measures the current export and downloads matching evidence", async ({
  page,
}) => {
  await page.goto("/");
  const navigation = page.getByRole("navigation", {
    name: "Sekcje demonstratora",
  });
  await navigation.getByRole("link", { name: "Testy Electrotile" }).click();
  await expect(page).toHaveURL(/\/testy$/);
  await expect(
    page.getByRole("heading", { name: "Testy Electrotile", level: 1 }),
  ).toBeVisible();
  const footprint = page.getByRole("article", {
    name: "Ściany budynku w OBJ i GLB",
  });
  await expect(footprint.getByRole("status")).toHaveText("Do uruchomienia");
  await footprint.getByRole("button", { name: "Rzut", exact: true }).click();
  await expect(
    footprint.getByRole("img", { name: /Rzut kontrolny/ }),
  ).toBeVisible();
  await footprint.getByRole("button", { name: "Bryła", exact: true }).click();
  await expect(
    footprint.getByRole("img", { name: /Bryła kontrolna/ }),
  ).toBeVisible();
  await footprint
    .getByRole("button", { name: "Uruchom test eksportu" })
    .click();
  await expect(footprint.getByRole("status")).toHaveText("Zaliczony");
  await expect(
    footprint.getByRole("row", { name: "krawędzie z pełną ścianą 8 8 8" }),
  ).toBeVisible();
  await expect(
    footprint.getByRole("row", {
      name: "trójkąty ścian 16 16 16",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Czeka na dane", { exact: true })).toHaveCount(8);
  const geometry = page.getByRole("article", {
    name: "Dach z otworem i fasada w OBJ",
  });
  await geometry.getByRole("button", { name: /^Uruchom/ }).click();
  await expect(geometry.getByRole("status")).toHaveText("Zaliczony");
  await expect(geometry.getByText("survey-pitched-opening")).toBeVisible();

  const file = page.waitForEvent("download");
  await page.getByRole("button", { name: "Pobierz raport JSON" }).click();
  const report = JSON.parse(
    await readFile((await (await file).path())!, "utf8"),
  );
  expect(report.scope).toBe("demo");
  expect(
    report.requirements.map((item: { status: string }) => item.status),
  ).toEqual(Array(8).fill("blocked"));
  const exportReport = report.results["footprint-export"];
  expect(exportReport.scope).toBe("studio-fixture");
  expect(exportReport.artifact_payloads).toBeUndefined();
  expect(exportReport.reference.id).toBe("ET-3D-01");
  expect(report.results.obj.checks).toHaveLength(2);

  for (const artifact of exportReport.artifacts) {
    const fileEvent = page.waitForEvent("download");
    await footprint.getByRole("button", { name: artifact.label }).click();
    const downloaded = await fileEvent;
    expect(downloaded.suggestedFilename()).toBe(artifact.name);
    const bytes = await readFile((await downloaded.path())!);
    expect(bytes.length).toBe(artifact.bytes);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      artifact.sha256,
    );
  }

  await page.screenshot({
    path: "test-results/electrotile-lab-desktop.png",
    fullPage: true,
  });
  await navigation.getByRole("link", { name: "Studio projektowe" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("button", { name: "Ustal lokalizację budynku" }),
  ).toBeVisible();
});

test("Electrotile lab keeps the model and inspection table usable on a narrow phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/testy");
  await page.getByRole("button", { name: "Uruchom test eksportu" }).click();
  await expect(
    page.getByRole("table", { name: "Porównanie eksportu OBJ i GLB" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Model GLB" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Model GLB" })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    360,
  );
  await page.screenshot({
    path: "test-results/electrotile-lab-mobile.png",
    fullPage: true,
  });
});

test("live address search uses GUGiK through the browser and selects a building", async ({
  page,
}) => {
  test.skip(process.env.LIVE_GEO !== "1", "Requires the live GUGiK providers");
  await page.goto("/");
  await page.getByRole("button", { name: "Ustal lokalizację budynku" }).click();
  const dialog = page.getByRole("dialog", { name: "Lokalizacja budynku" });
  await dialog.getByRole("searchbox", { name: "Miejscowość" }).fill("Stargard");
  await dialog
    .getByRole("searchbox", { name: "Ulica i numer budynku" })
    .fill("Szczecińska 1");
  const addressResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/geo/addresses"),
  );
  await dialog.getByRole("button", { name: "Szukaj adresu" }).click();
  expect((await addressResponse).status()).toBe(200);
  await dialog.getByRole("button", { name: /Stargard, Szczecińska 1/ }).click();
  const building = dialog.getByRole("radio", { name: /^Budynek 1/ });
  await expect(building).toBeVisible({ timeout: 25_000 });
  await building.check();
  await dialog.getByRole("button", { name: "Potwierdź budynek" }).click();
  await expect(
    page.getByRole("button", { name: "Zmień lokalizację budynku" }),
  ).toContainText("Stargard, Szczecińska 1");
});
