# Registry9 Engineering / BIPV Studio

**Metryczna geometria dachu i fasady · konfiguracja BIPV · weryfikowalne testy funkcjonalne**

BIPV Studio to działający demonstrator inżynierski i środowisko do odtwarzalnego testowania oprogramowania dachowego. Pokazuje zarówno proces projektowania, jak i metodę wykrywania błędów za pomocą niezależnych wzorców, wersjonowanych danych wejściowych i eksportowanych dowodów.

> **Zakres dowodów:** Studio jest własnym produktem demonstracyjnym Registry9. Nie jest systemem Electrotile. Wyniki jego testów nie stanowią odbioru modułów zamawiającego.

## Otwórz i sprawdź

| Miejsce | Co możesz zrobić | Dostęp |
| --- | --- | --- |
| **[Laboratorium Electrotile](https://bipv-studio-production.up.railway.app/testy)** | Uruchomić próby, porównać wynik z referencją, pobrać dowody i raport | Publiczny, bez konta |
| [Studio BIPV](https://bipv-studio-production.up.railway.app/) | Edytować scenę 2D/3D, porównać rozmieszczenie modułów PV i wyeksportować modele | Publiczny, podstawowe funkcje bez konta |
| [Kalkulator przedmiaru](https://bipv-studio-production.up.railway.app/produkcja) | Sprawdzić arkusze, rozkrój, rzaz i parametry wiązek w kontrolnym katalogu | Publiczny, bez konta |
| [Notatka techniczna dla ET/2025/7](docs/ET-2025-7-TECHNICAL-BRIEF.md) | Zakres, metoda, tabela dowodów i ograniczenia | GitHub – tylko upoważnieni |
| [Scenariusz demonstracji](docs/ET-2025-7-DEMO-PLAYBOOK.md) | Krótki, powtarzalny pokaz dla oceniającego | GitHub – tylko upoważnieni |
| [Lista kontrolna oferty](docs/ET-2025-7-SUBMISSION-CHECKLIST.md) | Wymagane dokumenty, podpisy, termin i finalny QA | Wewnętrzny |

**Repozytorium jest prywatne.** Nie należy podawać samego linku do niego jako wymaganego załącznika przetargowego. Do oferty dołącza się bezpośrednio wykonywalną paczkę ZIP z instrukcją oraz osobny materiał techniczny PDF. Materiały te nie wymagają dostępu do GitHuba.

## Co jest rzeczywiście zaimplementowane

- Wyszukiwanie polskich adresów (GUGiK UUG), wybór budynku z EGiB, ortofoto, przypięcie pochodzenia danych i ich ograniczeń do projektu. Dostawca danych publicznych może przejściowo nie odpowiadać.
- Metryczny model ENU/UV, edycja bryły i połaci dachu oraz fasad, otwory i przeszkody, historia i odtwarzanie wersji sceny.
- Dwuwymiarowy rzut oraz interaktywny podgląd 3D; rozmieszczanie pełnych obrysów modułów z odsunięciami i kontrolą kolizji, dwie orientacje i warianty siatki.
- Liczby modułów, powierzchnia aktywna i nominalna moc STC dla **jawnie demonstracyjnych SKU**. Porównanie wariantów i eksport JSON / CSV / OBJ / GLB.
- Scenariusz produkcyjny z kontrolnym katalogiem arkuszy, rozkrojem profili z rzazem, bilansem długości i grafem wiązki.
- Publiczne laboratorium z rzeczywistymi wykonaniami, niezależnym porównaniem artefaktów OBJ/GLB, raportami i SHA-256; QA obejmuje też testy brzegowe i regresyjne.
- Projektowy interfejs UX v2 z prowadzeniem po etapach, kluczowymi metrykami, jawnością założeń geometrycznych i interaktywnymi panelami mobilnymi.

**Aktualne wydanie produkcyjne:** `7a1b88034d1e6750b5b9945feca3364f136d0ce6`. Testy źródeł: [Quality gates #45168329114](https://github.com/maciejbrasewicz/bipv-blueprint/actions/runs/45168329114); testy działającego wydania: [Production verification #45169946732](https://github.com/maciejbrasewicz/bipv-blueprint/actions/runs/45169946732). Linki GitHub wymagają uprawnień, ale istotne dane i raporty są również dołączane do niezależnej paczki ofertowej.

## Próbka do zapytania ET/2025/7

Zamawiający wymaga **przykładowych scenariuszy testów aplikacji pokryć dachowych, opisu technicznego i paczki ZIP uruchamianej lokalnie z instrukcją**. Przygotowana próbka zawiera:

1. Sprawdzanie geometrii, ścian i eksportów OBJ/GLB przez niezależny odczyt wygenerowanych plików.
2. Obliczanie układu PV z marginesami, przeszkodami, fasadami i granicznymi przypadkami dopasowania.
3. Kontrole SKU, mocy STC, rozkroju profili z rzazem, portów, połączeń i długości tras.
4. Powtarzalny test-runner, JUnit, benchmarki i instrukcję ponownego uruchomienia.

**Wynik paczki ofertowej:** 217/217 testów Python (clean-room GitHub Actions), dwie analityczne sceny benchmarku PASS; wynik i identyfikator commita są zapisane w plikach paczki. To liczby dotyczące **lokalnej próbki**, nie liczby testów wykonanych w systemie Electrotile. Skróty plików pozwalają porównać dokładnie sprawdzone materiały.

Instrukcja źródłowa: [Roof test pack](docs/ROOF-TEST-PACK.md). Nie używaj archiwów z przestarzałych wydań ani samego linku do artefaktu GitHub zamiast załączenia ZIP w BK2021.

## Lokalny development pełnego Studio

Wymagania: Python 3.12+, uv oraz Node.js 24.

```bash
uv sync --frozen --dev
npm ci --prefix web --no-audit --no-fund
npm run build --prefix web
uv run --frozen uvicorn server.app:app --host 127.0.0.1 --port 8000
```

Aplikacja: http://127.0.0.1:8000, OpenAPI: http://127.0.0.1:8000/openapi.json. Funkcje geometryczne mogą działać bez konfiguracji chmury. Dane Supabase wymagają świadomego ustawienia `SUPABASE_URL` i `SUPABASE_PUBLISHABLE_KEY`, z migracjami w osobno wybranym projekcie. Nie należy podawać klucza service-role do frontendu.

```bash
uv run --frozen pytest -q
npm run format:check --prefix web
npm run build --prefix web
cd web && npx playwright install chromium && npm run test:e2e
```

**Uwaga:** powyższe polecenia dotyczą pełnego repozytorium. Dostarczana komisji uproszczona paczka ZIP ma własne instrukcje i **nie potrzebuje Node.js ani dostępu do repo**.

## Granice wiarygodności

EGiB dostarcza rzeczywisty **obrys budynku**, nie pomierzoną wysokość, geometrię połaci ani potwierdzenie możliwości montażu. Dach importowany z obrysu może mieć szacowaną wysokość i nachylenie. Studio nie wykonuje automatycznej rekonstrukcji dachu wyłącznie ze zdjęcia satelitarnego. Nie udostępnia pełnej produkcyjnej bazy wyrobów Electrotile, zwalidowanego rocznego uzysku DC/AC, kompletnego projektu elektrycznego ani pełnego procesu ofertowania i rezerwacji systemu zamawiającego. Limit interaktywnej powierzchni wybranych dachów to do 2000 m² (przy dodatkowym limicie obwiedni wyszukiwania). Nie należy wykorzystywać wyników demonstracyjnych jako projektu wykonawczego.

**Testy odbiorcze Electrotile nadal wymagają kodu, środowiska, wejść i zatwierdzonych referencji zamawiającego.** Szczególnie: 10 adresów dla rekonstrukcji satelitarnej, około 100 historycznych wycen, kolejka 20 zdjęć i pełna wycena z opłacalnością do 6 godzin. Wewnętrzna macierz: [Electrotile acceptance](docs/ELECTROTILE-ACCEPTANCE.md).

## Architektura i kontrola wydań

React + TypeScript + Three.js / MapLibre, FastAPI + Python + Shapely, metryczna scena ENU, Supabase/PostgreSQL. Frontend i backend są dostarczane razem w kontenerze Railway; wydania są przypinane do jednoznacznego SHA. Produkcyjny profil obejmuje 250 MB RAM i 0,1 vCPU, co ma znaczenie przy interpretacji benchmarków. Testy CI obejmują również rzeczywistą przeglądarkę i eksport plików.

[Architektura](docs/ARCHITECTURE.md) · [Test lab](docs/ELECTROTILE-TEST-LAB.md) · [Protokół odbioru](docs/ELECTROTILE-ACCEPTANCE.md) · [Engineering handoff](docs/HANDOFF.md) · [Historia projektu](docs/RELEASE.md)

---

**EN:** Registry9 BIPV Studio is a working roof/facade and photovoltaic layout demonstrator with reproducible engineering QA. Real EGiB footprints are **not** verified roof surveys. The independent, offline-capable test harness demonstrates the team's methodology; Electrotile production acceptance remains dependent on access to the customer's actual modules and reference data. The private source repository is not a substitute for the tender ZIP attachment.
