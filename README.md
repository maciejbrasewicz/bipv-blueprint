# Registry9 Engineering — BIPV Studio

**Interaktywny projekt dachu i fasady BIPV. Niezależna walidacja geometrii, konfiguracji PV, materiałów i eksportów.**

[Otwórz Laboratorium Testowe](https://bipv-studio-production.up.railway.app/testy) · [Przejdź do BIPV Studio](https://bipv-studio-production.up.railway.app/) · [Kalkulator materiałów i wiązek](https://bipv-studio-production.up.railway.app/produkcja)

> **Source available · proprietary.** Kod jest udostępniony do przeglądu i wykonywania prób ewaluacyjnych, lecz **nie jest open source**. Użycie komercyjne, integracja z innymi produktami i redystrybucja wymagają odrębnej zgody. Szczegóły: [LICENSE](LICENSE). GitHub umożliwia przeglądanie i forkowanie publicznych repozytoriów na zasadach swojego regulaminu.

## 1. Co można sprawdzić od razu — bez instalowania czegokolwiek

| Obszar | Co działa | Dowód widoczny dla oceniającego |
| --- | --- | --- |
| **[Laboratorium](https://bipv-studio-production.up.railway.app/testy)** | Uruchomienie konkretnych prób na kontrolnych wejściach, niezależna kontrola plików i raportów | Wersja, wartości oczekiwane i rzeczywiste, czas, wynik, eksport OBJ/GLB/JSON, SHA-256 |
| **[Studio](https://bipv-studio-production.up.railway.app/)** | Metryczny model 2D/3D, połacie, przeszkody, fasady, dwa warianty rozmieszczenia PV | Rzeczywista liczba modułów, nominalna moc STC, geometria i eksport |
| **[Kalkulator](https://bipv-studio-production.up.railway.app/produkcja)** | Zestawienie arkuszy, cięć profili, rzazu i grafu wiązek | Bilans ilości, przewodów i reguł na katalogu kontrolnym |

**Najlepszy punkt wejścia dla ET/2025/7 to Laboratorium.** Nie wymaga logowania. Przykładowe wejścia są wersjonowane i pochodzą z własnych przypadków testowych. Nie trzeba zakładać konta w Registry9, prosić o dostęp do GitHuba ani uruchamiać środowiska deweloperskiego.

## 2. Po co udostępniamy kod?

Zapytanie **ET/2025/7** wymaga wykazania zdolności do testowania aplikacji lub modułów związanych z pokryciami dachowymi: scenariuszy, opisu technicznego i **lokalnie uruchamialnej paczki ZIP z instrukcją**.

Publikujemy materiał techniczny, żeby dało się zweryfikować nie deklaracje, lecz implementację:

- Kod silnika geometrii i układania modułów PV wraz z niezależnymi oczekiwanymi wynikami.
- Kod laboratoriów ET-3D-01 i ET-PROD-01: bezpośrednie obliczenia, odczyt artefaktów, diagnoza rozbieżności.
- Testy przypadków brzegowych dla dachów, fasad, otworów, obwiedni, cięć, identyfikatorów części i wiązek.
- Wersjonowane wejścia i schematy, testy API i automatyczne testy interfejsu.
- Kontrolę CI wykonywaną **na GitHubie**, która rozpakowuje ZIP w nowym katalogu i wykonuje testy z załączonego kodu.

**GitHub Actions nie uruchamia się na komputerze zamawiającego.** W ZIP znajdują się testy możliwe do uruchomienia zwykłym Pythonem; wyniki GitHub Actions są **dodatkowym, niezależnym zapisem** tego, że takie uruchomienie już przeprowadzono.

## 3. Co przekazujemy jako ZIP

W sekcji **Releases** lub w załączniku oferty udostępniamy plik:

**`Registry9-ET-2025-7-Source-and-Tests.zip`**

Nie jest to „klon portalu” ani plik prezentacji. To wydanie kodu i kontroli jakości przeznaczone do **przejrzenia i samodzielnego wykonania testów**, bez dostępu do naszych danych i usług chmurowych. W paczce znajdują się:

| Folder | Zawartość |
| --- | --- |
| `web/src/` | Źródła React/TypeScript interfejsu Studio, Laboratorium i Kalkulatora |
| `server/` | FastAPI, geometria, generatory OBJ/GLB, plan produkcji i testy Python |
| `scripts/` | Narzędzia do odtwarzania i niezależnej oceny, benchmarki, pakowanie i weryfikacja |
| `tests/fixtures/` | Przykładowe scenariusze, dane wejściowe, wzorce i odpowiedzi do porównań |
| `contracts/` | Schematy API i danych |
| `docs/` | Metodyka, zakres i zasady odbioru |
| `supabase/` | Schematy SQL i testy integracyjne bazy (bez danych produkcyjnych) |
| `LICENSE` | Restrykcyjna licencja ewaluacyjna |
| `MANIFEST.json` i `SHA256SUMS.txt` | Dokładne pochodzenie wydania i kontrola każdego pliku |

**Przebieg lokalny — Python 3.12 + [uv](https://docs.astral.sh/uv/)**

Rozpakuj ZIP, otwórz terminal w katalogu z `pyproject.toml` i wykonaj:

```bash
uv sync --python 3.12 --frozen --dev
uv run --frozen pytest -q --junitxml=wyniki.xml
uv run --frozen python -m scripts.benchmark_roof_tests --output benchmark.json
uv run --frozen python -m scripts.run_electrotile_3d_case wynik-model-3d
uv run --frozen python -m scripts.run_electrotile_production_case wynik-przedmiar
```

Na Windows są to te same polecenia w PowerShell. Instalacja `uv` i pierwsze pobranie zależności wymagają internetu. **Same zamrożone przypadki testowe nie potrzebują konta GitHub, dostępu do Railway ani Supabase.**

Źródła całego interfejsu są w repozytorium. Opcjonalne lokalne uruchomienie *aplikacji developerskiej* jest opisane niżej, lecz **nie jest wymagane** do przeglądu portalu online ani oceny scenariuszy testowych.

## 4. Wybór najlepszych scenariuszy

| Test | Co weryfikuje | Co pobieramy |
| --- | --- | --- |
| **ET-3D-01** | Wierność geometrii, skala i kompletność ścian w OBJ i GLB dla obrysu z dziedzińcem | Oba modele, oryginalne wejście, kontrolne wartości, SHA-256 |
| **ET-PROD-01** | Elementy aktywne i bierne, wymiary, bilans cięć z rzazem, końce i długości wiązek | Przedmiar, referencje, raport i pliki wejściowe |
| **PV layout** | Pełne dopasowanie poligonów, strefy wykluczenia i odstępy, orientacja i moc STC | Wyniki rozmieszczenia i zgodność wariantów |
| **Próby brzegowe** | Rozbieżności w wymiarze granicznym, kolizji, typie produktu, grafie lub eksporcie | Jednoznaczne przyczyny, osobne wyniki PASS/FAIL |

Metodologia: [ELECTROTILE-TEST-LAB](docs/ELECTROTILE-TEST-LAB.md) · [Protokół kwalifikacji](docs/ELECTROTILE-ACCEPTANCE.md) · [Instrukcja próbki](docs/ROOF-TEST-PACK.md).

## 5. Architektura i odtwarzalność

```text
React / TypeScript / Three.js
     │
     ├── Studio: dach, fasada, warstwy i układy BIPV
     ├── Laboratorium: wykonanie prób, referencje i wyniki
     └── Kalkulator: produkty, materiały i wiązki
     │
     ▼
FastAPI (Python) ── Shapely / pyproj / silnik reguł
     ├── JSON Schema / wersjonowana scena ENU/UV
     ├── OBJ / GLB / raporty / SHA-256
     ├── Wzorce i niezależne walidatory
     └── Opcjonalne: GUGiK UUG / EGiB / ORTO; Supabase
```

CI w GitHub Actions wykonuje testy domeny/API, testy Chrome/Playwright, budowę frontendu, limitowany kontener Docker oraz niezależną instalację ZIP. Wydanie porównujemy przez dokładny SHA commita i dołączone manifesty, a nie przez hasło „wszystko przetestowane”. Uruchomienie lokalnych testów odbywa się zwykłymi komendami Pythona.

## 6. Granice dowodu — bez marketingowej fikcji

BIPV Studio jest **autorskim demonstratorem Registry9**, nie wdrożeniem systemu Electrotile. Realny EGiB dostarcza obrys budynku; nie potwierdza kąta połaci, wysokości budynku ani możliwości montażu. Przykładowy katalog PV jest kontrolny, nie producenta. Produkcyjne parametry energetyczne, pełna rekonstrukcja wyłącznie z obrazu satelitarnego, rzeczywisty katalog Electrotile i kompletna wycena zamawiającego wymagają integracji oraz jego danych.

W szczególności **nie deklarujemy zaliczenia na systemie zamawiającego**: próby 10 adresów z rekonstrukcją satelitarną, doboru względem około 100 historycznych wycen, kolejki 20 obrazów ani pełnego procesu oferty ≤6 h. Pakiet pokazuje zdolność do wykonania i audytowalny sposób testowania tych funkcji.

Dostęp do usług GUGiK jest zależny od aktualnej dostępności API i wymaga internetu. Scenariusze na zamrożonych, opisanych wejściach pozostają odtwarzalne bez tych usług.

## 7. Lokalny development portalu (opcjonalnie)

Python 3.12+, uv, Node.js 24. Nie jest to część obowiązkowej procedury odbioru ZIP.

```bash
uv sync --frozen --dev
npm ci --prefix web --no-audit --no-fund
npm run build --prefix web
uv run --frozen uvicorn server.app:app --host 127.0.0.1 --port 8000
```

Otwórz `http://127.0.0.1:8000/`. Aplikacja potrafi działać bez kluczy Supabase w zakresie geometrii i testów kontrolnych; historia projektów wymagająca chmury pozostaje wyłączona. Nie udostępniamy żadnych kluczy produkcyjnych. Niektóre funkcje map wymagają dostępu do usług GUGiK.

## 8. Warunki wykorzystania

**Registry9 Restricted Source Evaluation License v1.0** — [LICENSE](LICENSE). Zgoda na ocenę, pobranie i uruchomienie testów wewnątrz organizacji. Bez automatycznej zgody na produkcyjne zastosowanie, odsprzedaż, tworzenie produktu pochodnego, redystrybucję ani szkolenie modeli AI na tym kodzie. Prawa GitHub dotyczące przeglądania/forkowania repozytoriów pozostają zachowane. Biblioteki zewnętrzne podlegają własnym licencjom.

© 2026 Registry9 BIPV Studio authors and respective rights holders. All rights reserved.
