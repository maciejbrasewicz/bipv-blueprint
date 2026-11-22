import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("Electrotile test portal runs the Studio geometry and replay and exports evidence", async ({
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
  await footprint.getByRole("button", { name: /^Uruchom/ }).click();
  await expect(footprint.getByRole("status")).toHaveText("Zaliczony");
  await expect(footprint.getByText(/OBJ · 0 trójkątów ścian/)).toBeVisible();
  await expect(
    footprint.getByRole("heading", { name: "Retest GLB OK" }),
  ).toBeVisible();
  await expect(page.getByText("Zablokowana", { exact: true })).toHaveCount(4);
  const geometry = page.getByRole("article", {
    name: "Dach z otworem i fasada w OBJ",
  });
  await expect(geometry.getByRole("status")).toHaveText("Do uruchomienia");
  await geometry.getByRole("button", { name: /^Uruchom/ }).click();
  await expect(geometry.getByRole("status")).toHaveText("Zaliczony");
  await expect(geometry.getByText("survey-pitched-opening")).toBeVisible();
  await expect(geometry.getByText(/SHA-256 OBJ/).first()).toBeVisible();
  const replay = page.getByRole("article", {
    name: "Arkusze eTile od projektu do oferty",
  });
  await replay.getByRole("button", { name: /^Uruchom/ }).click();
  await expect(replay.getByRole("status")).toHaveText("Zaliczony");
  await expect(replay.getByText("11 wykrytych rozbieżności")).toBeVisible();
  const file = page.waitForEvent("download");
  await page.getByRole("button", { name: "Pobierz raport JSON" }).click();
  const report = JSON.parse(
    await readFile((await (await file).path())!, "utf8"),
  );
  expect(report.scope).toBe("demo");
  expect(report.results["footprint-export"].baseline.obj.wall_triangles).toBe(
    0,
  );
  expect(
    report.results["footprint-export"].checks.map(
      (check: { actual: Record<string, number> }) =>
        check.actual["krawędzie z pełną ścianą"],
    ),
  ).toEqual([8, 8]);
  expect(report.results.obj.checks).toHaveLength(2);
  expect(report.results.product.checks[0].actual).toHaveLength(11);
  await navigation.getByRole("link", { name: "Studio projektowe" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("button", { name: "Ustal lokalizację budynku" }),
  ).toBeVisible();
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
