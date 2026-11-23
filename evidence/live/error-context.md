# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: location.spec.ts >> location waits for address and building choices and saves only the selected reference
- Location: e2e/location.spec.ts:4:1

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: locator.fill: Test timeout of 90000ms exceeded.
Call log:
  - waiting for getByRole('dialog', { name: 'Lokalizacja budynku' }).getByRole('searchbox', { name: 'Adres w Polsce' })

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - navigation "Sekcje demonstratora" [ref=e4]:
    - link "Studio projektowe" [ref=e5] [cursor=pointer]:
      - /url: /
    - link "Testy Electrotile" [ref=e17] [cursor=pointer]:
      - /url: /testy
    - link "Kalkulator produkcji" [ref=e23] [cursor=pointer]:
      - /url: /produkcja
  - banner [ref=e27]:
    - link "Registry9 BIPV Studio" [ref=e28] [cursor=pointer]:
      - /url: /
      - generic [ref=e33]:
        - text: REGISTRY9
        - generic [ref=e34]: BIPV STUDIO
    - generic [ref=e36]:
      - generic [ref=e37]: PRZESTRZEŃ PROJEKTOWA
      - textbox "Nazwa projektu" [ref=e38]: Dom pod Szczecinem
    - generic [ref=e39]: TRYB GOŚCIA
    - generic [ref=e40]:
      - button "Konto i organizacje" [ref=e41] [cursor=pointer]
      - button "Projekty" [ref=e45] [cursor=pointer]
      - button "Eksport" [ref=e49] [cursor=pointer]
      - button "Zapisz projekt" [ref=e55] [cursor=pointer]
      - button "Pomoc BIPV Studio" [ref=e59] [cursor=pointer]
  - generic [ref=e63]:
    - complementary [ref=e64]:
      - generic [ref=e65]:
        - generic [ref=e66]: OBIEKTY PROJEKTU
        - generic [ref=e67]: "5"
      - button "Ustal lokalizację budynku" [ref=e68] [cursor=pointer]:
        - generic [ref=e72]:
          - text: Lokalizacja budynku
          - generic [ref=e73]: Wyszukaj adres
      - button "Otwórz przykład techniczny" [ref=e76] [cursor=pointer]:
        - generic [ref=e81]:
          - text: Przykład techniczny
          - generic [ref=e82]: Sprawdzalna scena 3D · bez adresu
      - button "Budynek mieszkalny Model parametryczny" [ref=e85] [cursor=pointer]:
        - generic [ref=e89]:
          - text: Budynek mieszkalny
          - generic [ref=e90]: Model parametryczny
      - generic [ref=e93]:
        - generic [ref=e94] [cursor=pointer]:
          - checkbox "Połać frontowa 180°" [checked] [ref=e95]
          - text: Połać frontowa
          - generic [ref=e96]: 180°
        - generic [ref=e97] [cursor=pointer]:
          - checkbox "Połać tylna 0°" [ref=e98]
          - text: Połać tylna
          - generic [ref=e99]: 0°
      - generic [ref=e100]:
        - text: PRZESZKODY
        - button "Dodaj komin" [ref=e101] [cursor=pointer]
      - generic [ref=e103]:
        - button "Komin 1 Połać frontowa" [ref=e104] [cursor=pointer]:
          - generic [ref=e108]:
            - text: Komin 1
            - generic [ref=e109]: Połać frontowa
        - button "Okno dachowe 2 Połać frontowa" [ref=e112] [cursor=pointer]:
          - generic [ref=e115]:
            - text: Okno dachowe 2
            - generic [ref=e116]: Połać frontowa
      - generic [ref=e119]:
        - button "Komin" [ref=e120] [cursor=pointer]
        - button "Okno" [ref=e122] [cursor=pointer]
      - generic [ref=e125]: GEOMETRIA BUDYNKU
      - generic [ref=e130]:
        - generic [ref=e131]:
          - generic [ref=e132]: Szerokość dachu
          - generic [ref=e133]:
            - spinbutton "Szerokość dachu" [ref=e134]: "14"
            - generic [ref=e135]: m
        - generic [ref=e136]:
          - generic [ref=e137]: Głębokość domu
          - generic [ref=e138]:
            - spinbutton "Głębokość domu" [ref=e139]: "10"
            - generic [ref=e140]: m
        - generic [ref=e141]:
          - generic [ref=e142]: Wysokość okapu
          - generic [ref=e143]:
            - spinbutton "Wysokość okapu" [ref=e144]: "3.2"
            - generic [ref=e145]: m
        - generic [ref=e146]:
          - generic [ref=e147]: Nachylenie
          - generic [ref=e148]:
            - spinbutton "Nachylenie" [ref=e149]: "32"
            - generic [ref=e150]: °
      - generic [ref=e151]:
        - generic [ref=e152]:
          - text: Azymut frontu
          - generic [ref=e153]: 180°
        - slider "Azymut frontu" [ref=e154]: "180"
        - generic [ref=e155]:
          - text: Północ
          - generic [ref=e156]: Południe
      - generic [ref=e158]: REGUŁY ROZMIESZCZENIA
      - generic [ref=e159]:
        - generic [ref=e160]:
          - generic [ref=e161]: Odsunięcie krawędzi
          - generic [ref=e162]:
            - spinbutton "Odsunięcie krawędzi" [ref=e163]: "0.25"
            - generic [ref=e164]: m
        - generic [ref=e165]:
          - generic [ref=e166]: Strefa przeszkód
          - generic [ref=e167]:
            - spinbutton "Strefa przeszkód" [ref=e168]: "0.2"
            - generic [ref=e169]: m
      - generic [ref=e170]:
        - text: Scena parametryczna
        - generic [ref=e172]: m / ENU
    - main [ref=e173]:
      - navigation "Tryb pracy" [ref=e175]:
        - button "Projekt" [ref=e176] [cursor=pointer]
        - button "Słońce" [ref=e180] [cursor=pointer]
        - button "Warianty" [ref=e188] [cursor=pointer]
        - button "Materiały" [ref=e194] [cursor=pointer]
        - button "Kontrola" [ref=e201] [cursor=pointer]
      - generic [ref=e206]:
        - generic:
          - generic: PODGLĄD 3D
          - heading "Energia wpisana w architekturę." [level=1]
          - paragraph: Dach dwuspadowy · model edytowalny
        - generic [ref=e207]:
          - button "Rzut 2D" [ref=e208] [cursor=pointer]
          - button "Widok perspektywiczny" [pressed] [ref=e214] [cursor=pointer]
          - button "Widok z góry" [ref=e218] [cursor=pointer]
          - button "Widok od frontu" [ref=e221] [cursor=pointer]
          - button "Siatka i wymiary" [pressed] [ref=e228] [cursor=pointer]
          - button "Cofnij" [disabled] [ref=e231]
          - button "Ponów" [disabled] [ref=e235]
        - generic:
          - generic: "N"
          - generic: ENU
        - generic:
          - text: "Obrót: przeciągnij"
          - generic: ·
          - text: "Zoom: kółko"
          - generic: ·
          - text: Kliknij obiekt
        - generic [ref=e242]: Scena w metrach
        - generic [ref=e244]:
          - button "Układ poziomy NAJWIĘCEJ MODUŁÓW 9,53 kWp·127 modułów" [pressed] [ref=e245] [cursor=pointer]:
            - generic [ref=e248]:
              - generic [ref=e249]:
                - text: Układ poziomy
                - generic [ref=e250]: NAJWIĘCEJ MODUŁÓW
              - emphasis [ref=e251]: 9,53 kWp·127 modułów
          - button "Układ pionowy 8,55 kWp·114 modułów" [ref=e255] [cursor=pointer]:
            - generic [ref=e258]:
              - generic [ref=e259]: Układ pionowy
              - emphasis [ref=e260]: 8,55 kWp·114 modułów
    - complementary [ref=e264]:
      - generic [ref=e265]: BILANS PROJEKTU
      - generic [ref=e268]:
        - generic [ref=e269]: MOC INSTALACJI · STC
        - generic [ref=e272]: 9,53kWp
        - generic [ref=e273]:
          - generic [ref=e274]: 1 · wybrane powierzchnie
          - generic [ref=e275]: Obliczono
      - generic [ref=e276]:
        - generic [ref=e277]:
          - generic [ref=e278]: Moduły aktywne
          - strong [ref=e279]: 127szt.
        - generic [ref=e280]:
          - generic [ref=e281]: Pokrycie powierzchni
          - strong [ref=e282]: 73,9%
        - generic [ref=e283]:
          - generic [ref=e284]: Aktywna powierzchnia
          - strong [ref=e285]: 61,0m²
        - generic [ref=e286]:
          - generic [ref=e287]: Powierzchnia projektu
          - strong [ref=e288]: 82,5m²
      - generic [ref=e289]:
        - text: PRODUKT BIPV
        - generic [ref=e290]: KATALOG TESTOWY
      - generic [ref=e293]:
        - text: Panel dachowy
        - generic [ref=e294]: Slate 75
        - text: Grafit satynowy
      - generic [ref=e295]:
        - text: Model modułu
        - combobox "Model modułu" [ref=e296]:
          - option "Slate 75 · 75 Wp" [selected]
          - option "Tile 32 · 32 Wp"
          - option "Linear 120 · 120 Wp"
      - generic [ref=e297]:
        - generic [ref=e298]: Wymiary modułu
        - generic [ref=e299]: 1,20 × 0,40 m
      - generic [ref=e300]:
        - generic [ref=e301]: Szczelina montażowa
        - generic [ref=e302]: 15 mm
      - generic [ref=e303]: Wymiary i moc są demonstracyjne. Katalog producenta podłączymy jako osobną, wersjonowaną warstwę.
      - generic [ref=e308]:
        - paragraph [ref=e309]: Geometria i rozmieszczenie są obliczane. Uzysk roczny, stringi i wycena pozostają do wdrożenia.
        - button "Sprawdź źródła i ograniczenia" [ref=e310] [cursor=pointer]
  - contentinfo [ref=e313]:
    - generic [ref=e314]:
      - generic [ref=e316]: Geometria obliczona
      - text: Kopia lokalna
    - generic [ref=e322]:
      - text: grid-search/0.3.0
      - generic [ref=e323]: ·
      - text: 6f0a9e77e6
    - generic [ref=e324]:
      - text: Supabase podłączony
      - button "Nowy projekt" [ref=e327] [cursor=pointer]
  - dialog "Lokalizacja budynku" [ref=e331]:
    - generic [ref=e332]:
      - heading "Lokalizacja budynku" [level=2] [ref=e333]
      - button "Zamknij lokalizację" [active] [ref=e334] [cursor=pointer]
    - generic [ref=e338]:
      - generic [ref=e339]:
        - text: Miejscowość
        - searchbox "Miejscowość" [ref=e340]
      - generic [ref=e341]:
        - text: Ulica i numer budynku
        - searchbox "Ulica i numer budynku" [ref=e342]
      - button "Szukaj adresu" [disabled] [ref=e343]
    - paragraph [ref=e348]: Wyszukaj rzeczywisty adres w Polsce i potwierdź właściwy budynek na mapie. Obrys EGiB nie potwierdza kształtu połaci ani przydatności dachu do montażu — zweryfikuj go przed ofertą.
```

# Test source

```ts
  1   | import { expect, test } from "@playwright/test";
  2   | import { readFile } from "node:fs/promises";
  3   | 
  4   | test("location waits for address and building choices and saves only the selected reference", async ({
  5   |   page,
  6   | }) => {
  7   |   const addresses = [
  8   |     {
  9   |       label: "Marki testowe, Próbna 12",
  10  |       region: "Region A",
  11  |       easting_m: 500000,
  12  |       northing_m: 500000,
  13  |     },
  14  |     {
  15  |       label: "Marki testowe, Próbna 12",
  16  |       region: "Region B",
  17  |       easting_m: 600000,
  18  |       northing_m: 550000,
  19  |     },
  20  |   ];
  21  |   const sites = [
  22  |     {
  23  |       address: addresses[1].label,
  24  |       building_id: "FIXTURE_FIRST",
  25  |       latitude_deg: 52.42,
  26  |       longitude_deg: 20.18,
  27  |       source: "gugik-egib-wfs",
  28  |       retrieved_at: "2026-11-21T10:00:00Z",
  29  |     },
  30  |     {
  31  |       address: addresses[1].label,
  32  |       building_id: "FIXTURE_SECOND",
  33  |       latitude_deg: 52.4204,
  34  |       longitude_deg: 20.1804,
  35  |       source: "gugik-egib-wfs",
  36  |       retrieved_at: "2026-11-21T10:00:00Z",
  37  |     },
  38  |   ];
  39  |   await page.route("**/api/geo/sources", (route) =>
  40  |     route.fulfill({ json: { enabled: true } }),
  41  |   );
  42  |   await page.route("**/api/geo/addresses", (route) =>
  43  |     route.fulfill({ json: { candidates: addresses } }),
  44  |   );
  45  |   let footprintRequests = 0;
  46  |   await page.route("**/api/geo/buildings", (route) => {
  47  |     footprintRequests++;
  48  |     expect(route.request().postDataJSON()).toEqual(addresses[1]);
  49  |     return route.fulfill({
  50  |       json: {
  51  |         radius_m: 60,
  52  |         partial: true,
  53  |         candidates: sites.map((site, index) => ({
  54  |           site,
  55  |           distance_m: index * 20,
  56  |           area_m2: 48,
  57  |           rings_m: [
  58  |             [
  59  |               [
  60  |                 [index * 20, 0],
  61  |                 [8 + index * 20, 0],
  62  |                 [8 + index * 20, 6],
  63  |                 [index * 20, 6],
  64  |                 [index * 20, 0],
  65  |               ],
  66  |             ],
  67  |           ],
  68  |         })),
  69  |       },
  70  |     });
  71  |   });
  72  | 
  73  |   await page.goto("/");
  74  |   await page.getByRole("button", { name: "Ustal lokalizację budynku" }).click();
  75  |   const dialog = page.getByRole("dialog", { name: "Lokalizacja budynku" });
  76  |   const query = dialog.getByRole("searchbox", { name: "Adres w Polsce" });
> 77  |   await query.fill("Próbna 12");
      |               ^ Error: locator.fill: Test timeout of 90000ms exceeded.
  78  |   await dialog.getByRole("button", { name: "Szukaj adresu" }).click();
  79  |   const second = dialog.getByRole("button", { name: /Region B/ });
  80  |   await expect(second).toBeVisible();
  81  |   expect(footprintRequests).toBe(0);
  82  |   await second.click();
  83  |   const confirm = dialog.getByRole("button", { name: "Potwierdź budynek" });
  84  |   await expect(confirm).toBeDisabled();
  85  |   await expect(
  86  |     dialog.getByText("Rejestr zwrócił ograniczony zestaw obrysów."),
  87  |   ).toBeVisible();
  88  |   await dialog.getByRole("radio", { name: /Budynek 2/ }).check();
  89  |   await expect(dialog.locator(".chosen-building")).toHaveCount(1);
  90  |   await confirm.click();
  91  |   await expect(dialog).toBeHidden();
  92  |   await expect(page.getByText(/EGiB · FIXTURE_SECOND/)).toBeVisible();
  93  |   await page.reload();
  94  |   await expect(page.getByText(/EGiB · FIXTURE_SECOND/)).toBeVisible();
  95  | 
  96  |   await page.getByRole("button", { name: "Eksport", exact: true }).click();
  97  |   const exported = page.waitForEvent("download");
  98  |   await page.getByRole("button", { name: "Projekt JSON" }).click();
  99  |   const data = JSON.parse(
  100 |     await readFile((await (await exported).path())!, "utf8"),
  101 |   );
  102 |   expect(data.scene.site).toEqual(sites[1]);
  103 |   expect(data.scene.geometry.schema_version).toBe("1.0.0");
  104 |   expect(data.scene.geometry.custom_surfaces ?? null).toBeNull();
  105 | });
  106 | 
  107 | test("location lets the user retry provider failure and handles lack of coverage", async ({
  108 |   page,
  109 | }) => {
  110 |   await page.route("**/api/geo/sources", (route) =>
  111 |     route.fulfill({ json: { enabled: true } }),
  112 |   );
  113 |   let attempts = 0;
  114 |   await page.route("**/api/geo/addresses", (route) => {
  115 |     attempts++;
  116 |     return attempts === 1
  117 |       ? route.fulfill({
  118 |           status: 504,
  119 |           json: { detail: "GUGiK nie odpowiedział w wyznaczonym czasie." },
  120 |         })
  121 |       : route.fulfill({ json: { candidates: [] } });
  122 |   });
  123 |   await page.goto("/");
  124 |   await page.getByRole("button", { name: "Ustal lokalizację budynku" }).click();
  125 |   const dialog = page.getByRole("dialog", { name: "Lokalizacja budynku" });
  126 |   await dialog.getByRole("searchbox").fill("Adres testowy");
  127 |   const search = dialog.getByRole("button", { name: "Szukaj adresu" });
  128 |   await search.click();
  129 |   await expect(dialog.getByRole("alert")).toContainText("nie odpowiedział");
  130 |   await search.click();
  131 |   await expect(dialog.getByText(/Brak punktów adresowych/)).toBeVisible();
  132 |   await expect(
  133 |     dialog.getByRole("button", { name: "Potwierdź budynek" }),
  134 |   ).toHaveCount(0);
  135 | });
  136 | 
```