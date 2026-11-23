import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

test("studio renders, edits, undoes, exports and imports", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.log("PAGE_ERROR", e.stack);
  });
  page.on("console", (m) => {
    if (m.type() === "error") console.log("BROWSER_ERROR", m.text());
  });
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
  await page.screenshot({
    path: "test-results/studio-desktop-review.jpg",
    type: "jpeg",
    quality: 70,
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
    try {
      const name = page.getByRole("textbox", { name: "Nazwa projektu" });
      const originalName = await name.inputValue();
      await name.fill("CI · zmieniona scena");
      const save = page.getByRole("button", {
        name: "Zapisz projekt",
        exact: true,
      });
      await save.click();
      await expect(page.getByRole("status")).toContainText("rewizja 2");
      await page.getByRole("button", { name: "Projekty", exact: true }).click();
      await page
        .getByRole("button", { name: "Historia projektu CI · zmieniona scena" })
        .click();
      await page
        .getByRole("button", { name: "Wczytaj rewizję 1", exact: true })
        .click();
      await expect(name).toHaveValue(originalName);
      await expect(page.getByRole("status")).toContainText(
        "Wczytano rewizję 1",
      );
      const unchanged = await page.request.get("/api/projects/" + ref.id, {
        headers: { "x-workspace-key": key },
      });
      expect((await unchanged.json()).revision).toBe(2);
      await save.click();
      await expect(page.getByRole("status")).toContainText("rewizja 3");
      const restored = await page.request.get(
        "/api/projects/" + ref.id + "/revisions/3",
        {
          headers: { "x-workspace-key": key },
        },
      );
      expect(restored.status()).toBe(200);
      expect((await restored.json()).scene.name).toBe(originalName);
    } finally {
      const removed = await page.request.delete("/api/projects/" + ref.id, {
        headers: { "x-workspace-key": key },
      });
      expect(removed.status()).toBe(204);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Projekt", exact: true }).click();
  await page.screenshot({
    path: "test-results/studio-mobile.png",
    fullPage: true,
  });
  await page.screenshot({
    path: "test-results/studio-mobile-review.jpg",
    type: "jpeg",
    quality: 75,
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
    const preservedEvidence = {
      surface_id: "south",
      status: "unverified",
      source_asset_ids: ["ed31462d-3212-4c3c-b00b-ac396c1ade2f"],
    };
    const site =
      process.env.GEO_ENABLED === "true"
        ? {
            address: "P09 fixture, Próbna 1",
            building_id: "P09_FIXTURE",
            latitude_deg: 52,
            longitude_deg: 19,
            source: "gugik-egib-wfs",
            retrieved_at: "2026-11-21T08:00:00Z",
          }
        : undefined;
    const sceneV2 = {
      schema_version: "2.0.0",
      geometry: { name: "CI revision fixture" },
      surface_evidence: [preservedEvidence],
      ...(site ? { site } : {}),
    };
    const updated = await request.patch("/api/projects/" + id, {
      headers: ha,
      data: { scene: sceneV2, expected_revision: 1 },
    });
    expect(updated.status()).toBe(200);
    expect(await updated.json()).toMatchObject({
      name: "CI revision fixture",
      revision: 2,
      scene: {
        schema_version: "2.0.0",
        geometry: { schema_version: "1.0.0", name: "CI revision fixture" },
        surface_evidence: [preservedEvidence],
      },
    });
    expect(
      (
        await request.patch("/api/projects/" + id, {
          headers: ha,
          data: { scene: {}, expected_revision: 1 },
        })
      ).status(),
    ).toBe(409);
    const historyPath = "/api/projects/" + id + "/revisions";
    const history = await request.get(historyPath, { headers: ha });
    expect(history.status()).toBe(200);
    const revisions: { revision: number }[] = (await history.json()).revisions;
    expect(revisions.map((r) => r.revision)).toEqual([2, 1]);
    const original = await request.get(historyPath + "/1", { headers: ha });
    expect(original.status()).toBe(200);
    expect((await original.json()).scene).toMatchObject({
      schema_version: "1.0.0",
      name: "CI isolation fixture",
    });
    const latest = await request.get(historyPath + "/2", { headers: ha });
    expect(latest.status()).toBe(200);
    const saved = (await latest.json()).scene;
    expect(saved).toMatchObject({
      schema_version: "2.0.0",
      surface_evidence: [preservedEvidence],
    });
    const computed = await request.post("/api/layout", {
      data: saved.geometry,
    });
    expect(computed.status()).toBe(200);
    expect((await computed.json()).variants[0].module_count).toBeGreaterThan(0);
    const foreignHistory = await request.get(historyPath, { headers: hb });
    expect((await foreignHistory.json()).revisions).toEqual([]);
    expect(
      (await request.get(historyPath + "/2", { headers: hb })).status(),
    ).toBe(404);
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

test("studio renders imported roof and facade and exports a 3D model", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByTestId("layout-status")).toHaveText(
    "Geometria obliczona",
  );
  await page.getByRole("button", { name: "Eksport", exact: true }).click();
  await page
    .getByRole("button", { name: "Wczytaj przykład dachu i fasady" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Nazwa projektu" }),
  ).toHaveValue(/dach L i fasada/);
  await expect(
    page.getByRole("checkbox", { name: "Fasada południowa" }),
  ).toBeChecked();
  await expect(page.getByTestId("layout-status")).toHaveText(
    "Geometria obliczona",
  );
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "Eksport", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Model 3D OBJ" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("bipv-model.obj");
  const model = await readFile((await file.path())!, "utf8");
  expect(model).toContain("g surface_roof-l");
  expect(model).toContain("g surface_facade-south");
  expect(model).toContain("g module_");
  await page.screenshot({
    path: "test-results/studio-imported-planes.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("studio renders a metric plan with shared selection and editable coordinates", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Geometria obliczona", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Rzut 2D", exact: true }).click();

  const plan = page.getByRole("region", { name: "Rzut powierzchni" });
  await expect(plan.getByLabel("Powierzchnia")).toHaveValue("south");
  const chimney = plan.getByRole("button", { name: "Komin 1 w rzucie" });
  await chimney.focus();
  await chimney.press("Enter");
  await expect(chimney).toHaveAttribute("aria-pressed", "true");

  const u = page.getByLabel("Pozycja U", { exact: true });
  await expect(u).toHaveValue("3.8");
  await u.fill("4.5");
  await expect(chimney).toHaveAttribute("x", "4.5");
  await page.getByRole("button", { name: "Cofnij", exact: true }).click();
  await expect(chimney).toHaveAttribute("x", "3.8");

  await page
    .getByRole("button", { name: "Widok perspektywiczny", exact: true })
    .click();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(u).toHaveValue("3.8");
  await page.getByRole("button", { name: "Warianty", exact: true }).click();
  await page.getByRole("button", { name: "Rzut 2D", exact: true }).click();
  await expect(chimney).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Układ pionowy/ }).click();
  await expect(
    page.getByRole("button", { name: /Układ pionowy/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(plan.locator(".plan-panels rect").first()).toBeVisible();
  await page.screenshot({ path: "test-results/studio-plan-desktop.png" });

  await plan.getByLabel("Powierzchnia").selectOption("north");
  await expect(plan.getByLabel("Geometria 2D · Połać tylna")).toBeVisible();
  await expect(chimney).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await plan.getByLabel("Powierzchnia").selectOption("south");
  await plan.getByRole("button", { name: "Komin 1 w rzucie" }).click();
  await expect(chimney).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: "test-results/studio-plan-mobile.png" });
});

test("account opens a claimed project without writing its organization scene to guest storage", async ({
  page,
}) => {
  const org = "26110000-0000-4000-8000-000000000010";
  const projectId = "26110000-0000-4000-8000-000000000011";
  let signedIn = false;
  let claimInput: unknown;
  let cloudScene: object;
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { cloud_configured: true } }),
  );
  await page.route("**/api/account/organizations", (route) =>
    route.fulfill(
      signedIn
        ? {
            json: {
              organizations: [{ id: org, name: "Biuro BIPV", role: "owner" }],
            },
          }
        : { status: 401, json: { detail: "Zaloguj się ponownie." } },
    ),
  );
  await page.route("**/api/account/sign-in", (route) => {
    signedIn = true;
    return route.fulfill({ status: 204 });
  });
  await page.route("**/api/projects", (route) => {
    cloudScene = route.request().postDataJSON().scene;
    return route.fulfill({ status: 201, json: { id: projectId, revision: 1 } });
  });
  await page.route("**/api/account/claim", (route) => {
    claimInput = route.request().postDataJSON();
    expect(route.request().headers()["x-workspace-key"]).toMatch(
      /^[a-f0-9]{64}$/,
    );
    return route.fulfill({ json: { id: projectId } });
  });
  await page.route("**/api/projects/" + projectId, (route) => {
    expect(route.request().headers()["x-organization-id"]).toBe(org);
    expect(route.request().headers()["x-workspace-key"]).toBeUndefined();
    return route.fulfill({
      json: { id: projectId, revision: 1, scene: cloudScene },
    });
  });

  await page.goto("/");
  const name = page.getByRole("textbox", { name: "Nazwa projektu" });
  await name.fill("Projekt do przeniesienia");
  await page.getByRole("button", { name: "Zapisz projekt" }).click();
  await expect(page.getByRole("status")).toContainText("rewizja 1");
  await page.getByRole("button", { name: "Konto i organizacje" }).click();
  await page.getByLabel("E-mail", { exact: true }).fill("studio@example.test");
  await page.getByLabel("Hasło", { exact: true }).fill("fake-password");
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await page.getByLabel("Organizacja docelowa").selectOption(org);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Przenieś otwarty projekt gościa" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Konto i organizacje" }),
  ).toBeHidden({ timeout: 30000 });
  await expect(page.locator(".version-pill")).toHaveText("Biuro BIPV", {
    timeout: 15000,
  });
  await expect(name).toHaveValue("Projekt do przeniesienia");
  expect(claimInput).toEqual({
    organization_id: org,
    project_id: projectId,
    expected_revision: 1,
  });
  expect(
    await page.evaluate(() => localStorage.getItem("bipv.scene.v1")),
  ).toBeNull();
  expect(
    await page.evaluate(() => localStorage.getItem("bipv.cloudproject.v1")),
  ).toBeNull();
});

test("studio keeps the 2D workspace and account available when WebGL fails", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (context, ...args) {
      if (context.includes("webgl")) return null;
      return Reflect.apply(getContext, this, [context, ...args]);
    } as typeof getContext;
  });
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { cloud_configured: true } }),
  );
  await page.route("**/api/account/organizations", (route) =>
    route.fulfill({ status: 401, json: { detail: "Zaloguj się ponownie." } }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Rzut powierzchni" }),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByRole("button", { name: "Widok perspektywiczny" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Konto i organizacje", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Konto i organizacje", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("E-mail", { exact: true })).toBeVisible();
});

test("Scene v2 hole correction invalidates old results and undo restores provenance", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const status = page.getByTestId("layout-status");
  await expect(status).toHaveText("Geometria obliczona");

  // Synthetic source ID exercises the measured-data contract.
  const sourceId = "f945ff7a-6a3e-4848-a321-07f60530b25d";
  const origin = { latitude_deg: 53.43, longitude_deg: 14.55 };
  const examplePlanes = JSON.parse(
    await readFile(
      new URL("../src/example-planes.json", import.meta.url),
      "utf8",
    ),
  );
  const scene = {
    schema_version: "2.0.0",
    geometry: examplePlanes,
    origin,
    surface_evidence: [
      {
        surface_id: "roof-l",
        status: "measured",
        source_asset_ids: [sourceId],
      },
    ],
  };
  await page.locator('input[type="file"]').setInputFiles({
    name: "synthetic-scene-v2.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(scene)),
  });
  await expect(
    page.getByRole("textbox", { name: "Nazwa projektu" }),
  ).toHaveValue(/dach L/);
  await expect(status).toHaveText("Geometria obliczona");
  await page.getByRole("button", { name: "Rzut 2D", exact: true }).click();

  const plan = page.getByRole("region", { name: "Rzut powierzchni" });
  const hole = plan.getByRole("button", { name: "Otwór 1 w rzucie" });
  await hole.focus();
  await hole.press("Enter");
  await expect(hole).toHaveAttribute("aria-pressed", "true");
  const initialPath = await hole.getAttribute("d");
  const editor = page.getByRole("form", { name: "Korekta otworu" });
  const u = editor.getByLabel("U otworu (m)", { exact: true });
  const apply = editor.getByRole("button", { name: "Zastosuj korektę" });
  const evidence = page.locator(".surface-inspector .info-note");
  await expect(evidence).toContainText("Zmierzona");

  await u.fill("0");
  await apply.click();
  await expect(editor.getByRole("alert")).toBeVisible();
  await expect(hole).toHaveAttribute("d", initialPath!);
  await expect(evidence).toContainText("Zmierzona");

  let resumeLayout!: () => void;
  const stalled = new Promise<void>((resolve) => {
    resumeLayout = resolve;
  });
  await page.route("**/api/layout", async (route) => {
    if (
      route.request().postDataJSON().custom_surfaces?.[0]
        .holes_uv_m[0][0][0] === 2.5
    )
      await stalled;
    await route.continue();
  });
  await u.fill("2.5");
  await apply.click();
  await expect(status).toHaveText("Przeliczanie układu");
  await expect(evidence).toContainText("Niezweryfikowana");
  await expect(plan.locator(".plan-panels rect")).toHaveCount(0);
  const exportMenu = page.getByRole("button", { name: "Eksport", exact: true });
  await exportMenu.click();
  const exportObj = page.getByRole("button", { name: "Model 3D OBJ" });
  await expect(exportObj).toBeDisabled();
  await exportMenu.click();
  resumeLayout();

  await expect(status).toHaveText("Geometria obliczona");
  await expect(hole).toHaveAttribute("d", /^M 2\.5 -2 /);
  await page
    .getByRole("button", { name: "Widok perspektywiczny", exact: true })
    .click();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(u).toHaveValue("2.5");
  await exportMenu.click();
  const download = page.waitForEvent("download");
  await exportObj.click();
  const model = await readFile((await (await download).path())!, "utf8");
  expect(model).toContain("v -3.50000000 4.00000000 2.00000000");

  await page.getByRole("button", { name: "Cofnij", exact: true }).click();
  await expect(u).toHaveValue("2");
  await expect(evidence).toContainText("Zmierzona");
  await expect(status).toHaveText("Geometria obliczona");
  await page.getByRole("button", { name: "Rzut 2D", exact: true }).click();
  await expect(hole).toHaveAttribute("d", initialPath!);

  // Reopen the saved local document and verify portable JSON round-trip.
  await page.reload();
  await expect(status).toHaveText("Geometria obliczona");
  await exportMenu.click();
  const exportedJson = page.waitForEvent("download");
  await page.getByRole("button", { name: "Projekt JSON" }).click();
  const restored = JSON.parse(
    await readFile((await (await exportedJson).path())!, "utf8"),
  );
  expect(restored.scene.schema_version).toBe("2.0.0");
  expect(restored.scene.origin).toEqual(origin);
  expect(restored.scene.surface_evidence).toEqual(scene.surface_evidence);
  expect(restored.scene.geometry.custom_surfaces[0].holes_uv_m).toEqual(
    examplePlanes.custom_surfaces[0].holes_uv_m,
  );
  expect(errors).toEqual([]);
});

test("the explicitly labeled technical scenario is discoverable and shows computed modules", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Otwórz przykład techniczny" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Nazwa projektu" }),
  ).toHaveValue("Przykład · dach L i fasada");
  await expect(page.getByTestId("layout-status")).toHaveText(
    "Geometria obliczona",
    { timeout: 30_000 },
  );
  const count = Number(
    (await page.locator(".metric-grid strong").first().innerText()).replace(
      /\D/g,
      "",
    ),
  );
  expect(count).toBeGreaterThan(0);
  await expect(
    page.getByRole("button", { name: "Ustal lokalizację budynku" }),
  ).toBeVisible();
});
