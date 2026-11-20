# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: studio.spec.ts >> studio renders, edits, undoes, exports and imports
- Location: e2e/studio.spec.ts:5:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Geometria obliczona', { exact: true })
Expected: visible
Timeout: 30000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText('Geometria obliczona', { exact: true }) with timeout 30000ms
  - waiting for getByText('Geometria obliczona', { exact: true })

```

```yaml
- banner:
  - link "Registry9 BIPV Studio":
    - /url: /
    - text: REGISTRY9 BIPV STUDIO
  - text: PRZESTRZEŃ PROJEKTOWA
  - textbox "Nazwa projektu": Dom pod Szczecinem
  - text: R1 · DEMO
  - button "Projekty"
  - button "Eksport"
  - button "Zapisz projekt" [disabled]
  - button "Informacje o demonstratorze"
- complementary:
  - text: OBIEKTY PROJEKTU 5
  - button "Budynek mieszkalny Model parametryczny"
  - checkbox "Połać frontowa 180°" [checked]
  - text: Połać frontowa 180°
  - checkbox "Połać tylna 0°"
  - text: Połać tylna 0° PRZESZKODY
  - button "Dodaj komin"
  - button "Komin 1 Połać frontowa"
  - button "Okno dachowe 2 Połać frontowa"
  - button "Komin"
  - button "Okno"
  - text: GEOMETRIA BUDYNKU Szerokość dachu
  - spinbutton "Szerokość dachu": "14"
  - text: m Głębokość domu
  - spinbutton "Głębokość domu": "10"
  - text: m Wysokość okapu
  - spinbutton "Wysokość okapu": "3.2"
  - text: m Nachylenie
  - spinbutton "Nachylenie": "32"
  - text: ° Azymut frontu 180°
  - slider "Azymut frontu": "180"
  - text: Północ Południe REGUŁY ROZMIESZCZENIA Odsunięcie krawędzi
  - spinbutton "Odsunięcie krawędzi": "0.25"
  - text: m Strefa przeszkód
  - spinbutton "Strefa przeszkód": "0.2"
  - text: m Scena parametryczna m / ENU
- main:
  - navigation "Tryb pracy":
    - button "Projekt"
    - button "Słońce"
    - button "Warianty"
    - button "Materiały"
    - button "Kontrola"
  - text: PODGLĄD 3D
  - heading "Energia wpisana w architekturę." [level=1]
  - paragraph: Dach dwuspadowy · model edytowalny
  - button "Widok perspektywiczny"
  - button "Widok z góry"
  - button "Widok od frontu"
  - button "Siatka i wymiary"
  - button "Cofnij" [disabled]
  - button "Ponów" [disabled]
  - text: "N ENU Obrót: przeciągnij · Zoom: kółko · Kliknij obiekt Scena w metrach"
  - button "Układ poziomy WIĘCEJ MODUŁÓW 9,53 kWp·127 modułów":
    - text: Układ poziomy WIĘCEJ MODUŁÓW
    - emphasis: 9,53 kWp·127 modułów
  - button "Układ pionowy 8,55 kWp·114 modułów":
    - text: Układ pionowy
    - emphasis: 8,55 kWp·114 modułów
- complementary:
  - text: BILANS PROJEKTU MOC INSTALACJI · STC 9,53kWp Jedna połać aktywna Obliczono Moduły aktywne
  - strong: 127szt.
  - text: Pokrycie połaci
  - strong: 73,9%
  - text: Aktywna powierzchnia
  - strong: 61,0m²
  - text: Powierzchnia połaci
  - strong: 82,5m²
  - text: PRODUKT BIPV DEMO Panel dachowy Slate 75 Grafit satynowy Model modułu
  - combobox "Model modułu":
    - option "Slate 75 · 75 Wp" [selected]
    - option "Tile 32 · 32 Wp"
    - option "Linear 120 · 120 Wp"
  - text: Wymiary modułu 1,20 × 0,40 m Szczelina montażowa 15 mm Wymiary i moc są demonstracyjne. Katalog producenta podłączymy jako osobną, wersjonowaną warstwę. DEMONSTRATOR INŻYNIERSKI
  - paragraph: Geometria i rozmieszczenie są obliczane. Uzysk roczny, stringi i wycena pozostają do wdrożenia.
  - button "Sprawdź źródła i ograniczenia"
- contentinfo:
  - text: Geometria obliczona Kopia lokalna grid-search/0.1.0 · 6f0a9e77e6 Tryb lokalny
  - button "Nowy projekt"
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
> 17  |   ).toBeVisible({ timeout: 30000 });
      |     ^ Error: expect(locator).toBeVisible() failed
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
  29  |   const power = await page.locator(".power-number").innerText();
  30  |   await page.getByLabel("Szerokość dachu", { exact: true }).fill("10");
  31  |   await expect(page.locator(".power-number")).not.toHaveText(power);
  32  |   await page.getByRole("button", { name: "Cofnij", exact: true }).click();
  33  |   await expect(page.locator(".power-number")).toHaveText(power);
  34  |   await page.getByRole("button", { name: "Dodaj komin", exact: true }).click();
  35  |   await expect(page.getByLabel("Pozycja U", { exact: true })).toBeVisible();
  36  |   await page.getByLabel("Pozycja U", { exact: true }).fill("5.5");
  37  |   await page.getByRole("button", { name: "Słońce", exact: true }).click();
  38  |   await page.getByLabel("Godzina podglądu słońca").fill("15");
  39  |   await expect(
  40  |     page.getByText("Geometria obliczona", { exact: true }),
  41  |   ).toBeVisible();
  42  |   await page.screenshot({
  43  |     path: "test-results/studio-sun.png",
  44  |     fullPage: true,
  45  |   });
  46  |   await page.getByRole("button", { name: "Materiały", exact: true }).click();
  47  |   await expect(
  48  |     page.getByRole("button", { name: "Pobierz zestawienie CSV" }),
  49  |   ).toBeEnabled();
  50  |   const csvDownload = page.waitForEvent("download");
  51  |   await page.getByRole("button", { name: "Pobierz zestawienie CSV" }).click();
  52  |   expect((await csvDownload).suggestedFilename()).toBe("bipv-materials.csv");
  53  |   await page.getByRole("button", { name: "Kontrola", exact: true }).click();
  54  |   await expect(page.locator(".hash")).toHaveText(/^[a-f0-9]{64}$/);
  55  |   await page.getByRole("button", { name: "Eksport", exact: true }).click();
  56  |   const jsonDownload = page.waitForEvent("download");
  57  |   await page.getByRole("button", { name: "Projekt JSON", exact: true }).click();
  58  |   const json = await jsonDownload;
  59  |   expect(json.suggestedFilename()).toBe("bipv-project.json");
  60  |   const content = await readFile((await json.path())!);
  61  |   expect(JSON.parse(content.toString()).scene.schema_version).toBe("1.0.0");
  62  |   await page.locator('input[type="file"]').setInputFiles({
  63  |     name: "bipv-project.json",
  64  |     mimeType: "application/json",
  65  |     buffer: content,
  66  |   });
  67  |   await expect(page.getByRole("status")).toContainText(
  68  |     "Zaimportowano i zweryfikowano",
  69  |   );
  70  |   if (process.env.LIVE_CLOUD === "1") {
  71  |     await page
  72  |       .getByRole("button", { name: "Zapisz projekt", exact: true })
  73  |       .click();
  74  |     await expect(page.getByRole("status")).toContainText(
  75  |       "Zapisano w Supabase",
  76  |       { timeout: 30000 },
  77  |     );
  78  |     const key = await page.evaluate(() =>
  79  |       localStorage.getItem("bipv.workspace.v1")!,
  80  |     );
  81  |     const ref = await page.evaluate(() =>
  82  |       JSON.parse(localStorage.getItem("bipv.cloudproject.v1")!),
  83  |     );
  84  |     const removed = await page.request.delete("/api/projects/" + ref.id, {
  85  |       headers: { "x-workspace-key": key },
  86  |     });
  87  |     expect(removed.status()).toBe(204);
  88  |   }
  89  |   await page.setViewportSize({ width: 390, height: 844 });
  90  |   await page.getByRole("button", { name: "Projekt", exact: true }).click();
  91  |   await page.screenshot({
  92  |     path: "test-results/studio-mobile.png",
  93  |     fullPage: true,
  94  |   });
  95  |   await page
  96  |     .getByRole("button", { name: "Wyniki projektu", exact: true })
  97  |     .click();
  98  |   await expect(page.locator(".right-panel")).toBeVisible();
  99  |   await page.screenshot({
  100 |     path: "test-results/studio-mobile-inspector.png",
  101 |     fullPage: true,
  102 |   });
  103 |   expect(errors).toEqual([]);
  104 | });
  105 | 
  106 | test("live cloud isolates guest workspaces and rejects stale revisions", async ({
  107 |   request,
  108 | }) => {
  109 |   test.skip(
  110 |     process.env.LIVE_CLOUD !== "1",
  111 |     "Cloud integration runs only against the deployed service.",
  112 |   );
  113 |   const a = randomBytes(32).toString("hex"),
  114 |     b = randomBytes(32).toString("hex"),
  115 |     ha = { "x-workspace-key": a },
  116 |     hb = { "x-workspace-key": b };
  117 |   let id: string | undefined;
```