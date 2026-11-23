import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

test("the public production assessment runs and agrees with the working planner", async ({
  page,
}) => {
  await page.goto("/testy");
  const production = page.getByRole("article", {
    name: "Arkusze, rozkrój i trasa wiązki",
  });
  await production.getByRole("button", { name: /^Uruchom/ }).click();
  await expect(production.getByRole("status")).toHaveText("Zaliczony");
  const file = page.waitForEvent("download");
  await production
    .getByRole("button", { name: "Przedmiar i wiązki JSON" })
    .click();
  const contents = await readFile((await (await file).path())!);
  const measured = JSON.parse(contents.toString());
  expect(measured.stc_mwp).toBe(84000);
  expect(measured.stock).toHaveLength(2);
  expect(measured.wires["circuit-a"].length_mm).toBe(5750);
  await production.getByText("Identyfikator przebiegu i sumy SHA-256").click();
  await expect(
    production.getByText(createHash("sha256").update(contents).digest("hex")),
  ).toBeVisible();

  await production.getByRole("link", { name: "Otwórz kalkulator" }).click();
  await expect(page).toHaveURL(/\/produkcja$/);
  await page.getByRole("button", { name: "Oblicz plan" }).click();
  const summary = page.getByRole("status", { name: "Podsumowanie planu" });
  await expect(summary).toContainText("84 Wp");
  await expect(summary).toContainText(/5\s?750 mm/);
  await expect(page.getByText("LAB-PASSIVE")).toBeVisible();

  await page
    .getByRole("spinbutton", { name: "Zapas przewodu (mm)" })
    .fill("500");
  await expect(page.getByRole("button", { name: "Pobierz plan" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Oblicz plan" }).click();
  await expect(summary).toContainText(/6\s?000 mm/);
  const planFile = page.waitForEvent("download");
  await page.getByRole("button", { name: "Pobierz plan" }).click();
  const adjusted = JSON.parse(
    await readFile((await (await planFile).path())!, "utf8"),
  );
  expect(adjusted.input_sha256).not.toBe(measured.input_sha256);
  expect(adjusted.wires["circuit-a"].length_mm).toBe(6000);

  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    360,
  );
  await page.screenshot({
    path: "test-results/electrotile-production-mobile.png",
    fullPage: true,
  });
});
