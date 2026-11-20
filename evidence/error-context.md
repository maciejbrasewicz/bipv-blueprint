# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: studio.spec.ts >> studio renders, edits, undoes, exports and imports
- Location: e2e/studio.spec.ts:5:1

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: locator.click: Test timeout of 90000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Projekt', exact: true })

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - link "Registry9 BIPV Studio" [ref=e5] [cursor=pointer]:
      - /url: /
      - generic [ref=e6]:
        - text: REGISTRY9
        - generic [ref=e7]: BIPV STUDIO
    - textbox "Nazwa projektu" [ref=e9]: Dom pod Szczecinem
    - generic [ref=e10]:
      - button [ref=e11] [cursor=pointer]
      - button [ref=e14] [cursor=pointer]
      - button [disabled] [ref=e17]
  - main [ref=e21]:
    - generic [ref=e22]:
      - button "Parametry projektu" [ref=e24] [cursor=pointer]
      - navigation "Tryb pracy" [ref=e28]:
        - button [ref=e29] [cursor=pointer]
        - button [ref=e32] [cursor=pointer]
        - button [ref=e39] [cursor=pointer]
        - button [ref=e44] [cursor=pointer]
        - button [ref=e50] [cursor=pointer]
      - button "Wyniki projektu" [ref=e55] [cursor=pointer]
    - generic [ref=e60]:
      - generic:
        - generic: PODGLĄD 3D
        - heading "Każdy wynik ma swoje źródło." [level=1]
        - paragraph: Metry, wersja silnika i dane wejściowe
      - generic [ref=e61]:
        - button "Widok perspektywiczny" [ref=e62] [cursor=pointer]
        - button "Widok z góry" [ref=e66] [cursor=pointer]
        - button "Widok od frontu" [ref=e69] [cursor=pointer]
        - button "Siatka i wymiary" [ref=e76] [cursor=pointer]
        - button "Cofnij" [ref=e79] [cursor=pointer]
        - button "Ponów" [disabled] [ref=e83]
      - generic:
        - generic: "N"
        - generic: ENU
      - generic:
        - text: "Obrót: przeciągnij"
        - generic: ·
        - text: "Zoom: kółko"
        - generic: ·
        - text: Kliknij obiekt
      - generic [ref=e90]: Scena w metrach
      - generic [ref=e92]:
        - button "Układ poziomy WIĘCEJ MODUŁÓW 8,93 kWp·119 modułów" [ref=e93] [cursor=pointer]:
          - generic [ref=e94]:
            - generic [ref=e95]:
              - text: Układ poziomy
              - generic [ref=e96]: WIĘCEJ MODUŁÓW
            - emphasis [ref=e97]: 8,93 kWp·119 modułów
        - button "Układ pionowy 7,95 kWp·106 modułów" [ref=e98] [cursor=pointer]:
          - generic [ref=e99]:
            - generic [ref=e100]: Układ pionowy
            - emphasis [ref=e101]: 7,95 kWp·106 modułów
  - contentinfo [ref=e102]:
    - generic [ref=e103]:
      - generic [ref=e105]: Geometria obliczona
      - text: Kopia lokalna
    - generic [ref=e111]:
      - text: grid-search/0.1.0
      - generic [ref=e112]: ·
      - text: dcb9ca960a
    - generic [ref=e113]: Tryb lokalny
```

# Test source

```ts
  1   | import { expect, test } from "@playwright/test";
  2   | import { readFile } from "node:fs/promises";
  3   | import { randomBytes } from "node:crypto";
  4   | 
  5   | test("studio renders, edits, undoes, exports and imports", async ({ page }) => {
  6   |   const errors: string[] = [];
  7   |   page.on("pageerror", (e) => {
  8   |     errors.push(e.message);
  9   |     console.log("PAGE_ERROR", e.stack);
  10  |   });
  11  |   page.on("console", (m) => {
  12  |     if (m.type() === "error") console.log("BROWSER_ERROR", m.text());
  13  |   });
  14  |   await page.goto("/");
  15  |   await expect(
  16  |     page.getByText("Geometria obliczona", { exact: true }),
  17  |   ).toBeVisible({ timeout: 30000 });
  18  |   await expect(page.locator("canvas")).toBeVisible();
  19  |   await page.evaluate(
  20  |     () =>
  21  |       new Promise((r) =>
  22  |         requestAnimationFrame(() => requestAnimationFrame(() => r(null))),
  23  |       ),
  24  |   );
  25  |   await page.screenshot({
  26  |     path: "test-results/studio-desktop.png",
  27  |     fullPage: true,
  28  |   });
  29  |   await page.screenshot({
  30  |     path: "test-results/studio-desktop-review.jpg",
  31  |     type: "jpeg",
  32  |     quality: 70,
  33  |     fullPage: true,
  34  |   });
  35  |   const power = await page.locator(".power-number").innerText();
  36  |   await page.getByLabel("Szerokość dachu", { exact: true }).fill("10");
  37  |   await expect(page.locator(".power-number")).not.toHaveText(power);
  38  |   await page.getByRole("button", { name: "Cofnij", exact: true }).click();
  39  |   await expect(page.locator(".power-number")).toHaveText(power);
  40  |   await page.getByRole("button", { name: "Dodaj komin", exact: true }).click();
  41  |   await expect(page.getByLabel("Pozycja U", { exact: true })).toBeVisible();
  42  |   await page.getByLabel("Pozycja U", { exact: true }).fill("5.5");
  43  |   await page.getByRole("button", { name: "Słońce", exact: true }).click();
  44  |   await page.getByLabel("Godzina podglądu słońca").fill("15");
  45  |   await expect(
  46  |     page.getByText("Geometria obliczona", { exact: true }),
  47  |   ).toBeVisible();
  48  |   await page.screenshot({
  49  |     path: "test-results/studio-sun.png",
  50  |     fullPage: true,
  51  |   });
  52  |   await page.getByRole("button", { name: "Materiały", exact: true }).click();
  53  |   await expect(
  54  |     page.getByRole("button", { name: "Pobierz zestawienie CSV" }),
  55  |   ).toBeEnabled();
  56  |   const csvDownload = page.waitForEvent("download");
  57  |   await page.getByRole("button", { name: "Pobierz zestawienie CSV" }).click();
  58  |   expect((await csvDownload).suggestedFilename()).toBe("bipv-materials.csv");
  59  |   await page.getByRole("button", { name: "Kontrola", exact: true }).click();
  60  |   await expect(page.locator(".hash")).toHaveText(/^[a-f0-9]{64}$/);
  61  |   await page.getByRole("button", { name: "Eksport", exact: true }).click();
  62  |   const jsonDownload = page.waitForEvent("download");
  63  |   await page.getByRole("button", { name: "Projekt JSON", exact: true }).click();
  64  |   const json = await jsonDownload;
  65  |   expect(json.suggestedFilename()).toBe("bipv-project.json");
  66  |   const content = await readFile((await json.path())!);
  67  |   expect(JSON.parse(content.toString()).scene.schema_version).toBe("1.0.0");
  68  |   await page.locator('input[type="file"]').setInputFiles({
  69  |     name: "bipv-project.json",
  70  |     mimeType: "application/json",
  71  |     buffer: content,
  72  |   });
  73  |   await expect(page.getByRole("status")).toContainText(
  74  |     "Zaimportowano i zweryfikowano",
  75  |   );
  76  |   if (process.env.LIVE_CLOUD === "1") {
  77  |     await page
  78  |       .getByRole("button", { name: "Zapisz projekt", exact: true })
  79  |       .click();
  80  |     await expect(page.getByRole("status")).toContainText(
  81  |       "Zapisano w Supabase",
  82  |       { timeout: 30000 },
  83  |     );
  84  |     const key = await page.evaluate(() =>
  85  |       localStorage.getItem("bipv.workspace.v1")!,
  86  |     );
  87  |     const ref = await page.evaluate(() =>
  88  |       JSON.parse(localStorage.getItem("bipv.cloudproject.v1")!),
  89  |     );
  90  |     const removed = await page.request.delete("/api/projects/" + ref.id, {
  91  |       headers: { "x-workspace-key": key },
  92  |     });
  93  |     expect(removed.status()).toBe(204);
  94  |   }
  95  |   await page.setViewportSize({ width: 390, height: 844 });
> 96  |   await page.getByRole("button", { name: "Projekt", exact: true }).click();
      |                                                                    ^ Error: locator.click: Test timeout of 90000ms exceeded.
  97  |   await page.screenshot({
  98  |     path: "test-results/studio-mobile.png",
  99  |     fullPage: true,
  100 |   });
  101 |   await page
  102 |     .getByRole("button", { name: "Wyniki projektu", exact: true })
  103 |     .click();
  104 |   await expect(page.locator(".right-panel")).toBeVisible();
  105 |   await page.screenshot({
  106 |     path: "test-results/studio-mobile-inspector.png",
  107 |     fullPage: true,
  108 |   });
  109 |   expect(errors).toEqual([]);
  110 | });
  111 | 
  112 | test("live cloud isolates guest workspaces and rejects stale revisions", async ({
  113 |   request,
  114 | }) => {
  115 |   test.skip(
  116 |     process.env.LIVE_CLOUD !== "1",
  117 |     "Cloud integration runs only against the deployed service.",
  118 |   );
  119 |   const a = randomBytes(32).toString("hex"),
  120 |     b = randomBytes(32).toString("hex"),
  121 |     ha = { "x-workspace-key": a },
  122 |     hb = { "x-workspace-key": b };
  123 |   let id: string | undefined;
  124 |   try {
  125 |     const created = await request.post("/api/projects", {
  126 |       headers: ha,
  127 |       data: { scene: { name: "CI isolation fixture" } },
  128 |     });
  129 |     expect(created.status()).toBe(201);
  130 |     const p = await created.json();
  131 |     id = p.id;
  132 |     expect(p).not.toHaveProperty("owner_key_hash");
  133 |     const own = await request.get("/api/projects", { headers: ha });
  134 |     expect((await own.json()).projects).toHaveLength(1);
  135 |     const other = await request.get("/api/projects", { headers: hb });
  136 |     expect((await other.json()).projects).toEqual([]);
  137 |     expect(
  138 |       (await request.get("/api/projects/" + id, { headers: hb })).status(),
  139 |     ).toBe(404);
  140 |     expect(
  141 |       (
  142 |         await request.patch("/api/projects/" + id, {
  143 |           headers: hb,
  144 |           data: { scene: {}, expected_revision: 1 },
  145 |         })
  146 |       ).status(),
  147 |     ).toBe(409);
  148 |     expect(
  149 |       (await request.delete("/api/projects/" + id, { headers: hb })).status(),
  150 |     ).toBe(204);
  151 |     expect(
  152 |       (await request.get("/api/projects/" + id, { headers: ha })).status(),
  153 |     ).toBe(200);
  154 |     expect((await request.get("/api/projects")).status()).toBe(401);
  155 |     const updated = await request.patch("/api/projects/" + id, {
  156 |       headers: ha,
  157 |       data: { scene: { name: "CI revision fixture" }, expected_revision: 1 },
  158 |     });
  159 |     expect(updated.status()).toBe(200);
  160 |     expect((await updated.json()).revision).toBe(2);
  161 |     expect(
  162 |       (
  163 |         await request.patch("/api/projects/" + id, {
  164 |           headers: ha,
  165 |           data: { scene: {}, expected_revision: 1 },
  166 |         })
  167 |       ).status(),
  168 |     ).toBe(409);
  169 |   } finally {
  170 |     if (id) {
  171 |       expect(
  172 |         (await request.delete("/api/projects/" + id, { headers: ha })).status(),
  173 |       ).toBe(204);
  174 |       expect(
  175 |         (await request.get("/api/projects/" + id, { headers: ha })).status(),
  176 |       ).toBe(404);
  177 |     }
  178 |   }
  179 | });
  180 | 
  181 | test.afterEach(async ({ page }, info) => {
  182 |   if (info.status !== info.expectedStatus)
  183 |     console.log(
  184 |       "PAGE_TEXT",
  185 |       await page
  186 |         .locator("body")
  187 |         .innerText()
  188 |         .catch(() => "unavailable"),
  189 |     );
  190 | });
  191 | 
```