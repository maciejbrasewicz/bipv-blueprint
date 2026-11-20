import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

test("studio renders, edits, undoes, exports and imports", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByText("Geometria obliczona", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.locator("canvas")).toBeVisible();
  await page.evaluate(
    () =>
      new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r(null))),
      ),
  );
  await page.screenshot({
    path: "test-results/studio-desktop.png",
    fullPage: true,
  });
  const power = await page.locator(".power-number").innerText();
  await page.getByLabel("Szerokość dachu", { exact: true }).fill("10");
  await expect(page.locator(".power-number")).not.toHaveText(power);
  await page.getByRole("button", { name: "Cofnij", exact: true }).click();
  await expect(page.locator(".power-number")).toHaveText(power);
  await page.getByRole("button", { name: "Dodaj komin", exact: true }).click();
  await expect(page.getByLabel("Pozycja U", { exact: true })).toBeVisible();
  await page.getByLabel("Pozycja U", { exact: true }).fill("5.5");
  await page.getByRole("button", { name: "Słońce", exact: true }).click();
  await page.getByLabel("Godzina podglądu słońca").fill("15");
  await expect(
    page.getByText("Geometria obliczona", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/studio-sun.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Materiały", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pobierz zestawienie CSV" }),
  ).toBeEnabled();
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Pobierz zestawienie CSV" }).click();
  expect((await csvDownload).suggestedFilename()).toBe("bipv-materials.csv");
  await page.getByRole("button", { name: "Kontrola", exact: true }).click();
  await expect(page.locator(".hash")).toHaveText(/^[a-f0-9]{64}$/);
  await page.getByRole("button", { name: "Eksport", exact: true }).click();
  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Projekt JSON", exact: true }).click();
  const json = await jsonDownload;
  expect(json.suggestedFilename()).toBe("bipv-project.json");
  const content = await readFile((await json.path())!);
  expect(JSON.parse(content.toString()).scene.schema_version).toBe("1.0.0");
  await page.locator('input[type="file"]').setInputFiles({
    name: "bipv-project.json",
    mimeType: "application/json",
    buffer: content,
  });
  await expect(page.getByRole("status")).toContainText(
    "Zaimportowano i zweryfikowano",
  );
  if (process.env.LIVE_CLOUD === "1") {
    await page
      .getByRole("button", { name: "Zapisz projekt", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Zapisano w Supabase",
      { timeout: 30000 },
    );
    const key = await page.evaluate(() =>
      localStorage.getItem("bipv.workspace.v1")!,
    );
    const ref = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("bipv.cloudproject.v1")!),
    );
    const removed = await page.request.delete("/api/projects/" + ref.id, {
      headers: { "x-workspace-key": key },
    });
    expect(removed.status()).toBe(204);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Projekt", exact: true }).click();
  await page.screenshot({
    path: "test-results/studio-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Wyniki projektu", exact: true })
    .click();
  await expect(page.locator(".right-panel")).toBeVisible();
  await page.screenshot({
    path: "test-results/studio-mobile-inspector.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("live cloud isolates guest workspaces and rejects stale revisions", async ({
  request,
}) => {
  test.skip(
    process.env.LIVE_CLOUD !== "1",
    "Cloud integration runs only against the deployed service.",
  );
  const a = randomBytes(32).toString("hex"),
    b = randomBytes(32).toString("hex"),
    ha = { "x-workspace-key": a },
    hb = { "x-workspace-key": b };
  let id: string | undefined;
  try {
    const created = await request.post("/api/projects", {
      headers: ha,
      data: { scene: { name: "CI isolation fixture" } },
    });
    expect(created.status()).toBe(201);
    const p = await created.json();
    id = p.id;
    expect(p).not.toHaveProperty("owner_key_hash");
    const own = await request.get("/api/projects", { headers: ha });
    expect((await own.json()).projects).toHaveLength(1);
    const other = await request.get("/api/projects", { headers: hb });
    expect((await other.json()).projects).toEqual([]);
    expect(
      (await request.get("/api/projects/" + id, { headers: hb })).status(),
    ).toBe(404);
    expect(
      (
        await request.patch("/api/projects/" + id, {
          headers: hb,
          data: { scene: {}, expected_revision: 1 },
        })
      ).status(),
    ).toBe(409);
    expect(
      (await request.delete("/api/projects/" + id, { headers: hb })).status(),
    ).toBe(204);
    expect(
      (await request.get("/api/projects/" + id, { headers: ha })).status(),
    ).toBe(200);
    expect((await request.get("/api/projects")).status()).toBe(401);
    const updated = await request.patch("/api/projects/" + id, {
      headers: ha,
      data: { scene: { name: "CI revision fixture" }, expected_revision: 1 },
    });
    expect(updated.status()).toBe(200);
    expect((await updated.json()).revision).toBe(2);
    expect(
      (
        await request.patch("/api/projects/" + id, {
          headers: ha,
          data: { scene: {}, expected_revision: 1 },
        })
      ).status(),
    ).toBe(409);
  } finally {
    if (id) {
      expect(
        (await request.delete("/api/projects/" + id, { headers: ha })).status(),
      ).toBe(204);
      expect(
        (await request.get("/api/projects/" + id, { headers: ha })).status(),
      ).toBe(404);
    }
  }
});
