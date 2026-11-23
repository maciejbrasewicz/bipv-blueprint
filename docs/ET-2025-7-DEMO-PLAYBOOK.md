# ET/2025/7 · Siedmiominutowy pokaz dla oceniającego

**Start:** https://bipv-studio-production.up.railway.app/testy

**Cel:** pokazać *pracujący produkt i niezależny sposób sprawdzenia*, nie slajdy ani deklaracje bez dowodów. Do wykonania demonstracji nie jest potrzebny dostęp do prywatnego GitHuba.

## Przebieg

| Czas | Czynność oceniającego | Co stanowi dowód |
| --- | --- | --- |
| 0:00–1:30 | Otwórz **Testy Electrotile**, uruchom próbę eksportu 3D **ET-3D-01** | Użyty obrys wzorcowy, rzeczywisty model OBJ/GLB, 8 ścian i 16 trójkątów dla testu z dziedzińcem; wersja i identyfikatory artefaktów |
| 1:30–3:00 | Pobierz wynik, porównaj tabelę z referencją; zweryfikuj SHA-256 plików | Zgodność raportu z surowym eksportem, a nie tylko komunikat „PASS” |
| 3:00–4:30 | Uruchom test **ET-PROD-01** lub otwórz **Kalkulator produkcji** | Typy elementów, moc STC, rozkrój z rzazem, bilans profili, przebieg wiązki; zmiana zapasu przewodu zmienia wynik |
| 4:30–6:00 | Otwórz **Studio**, porównaj orientacje modułów i widoki 2D/3D, zmień parametr lub przeszkodę, wykonaj eksport GLB/JSON | Liczba modułów, bryła i eksport wynikają z tych samych danych wejściowych |
| 6:00–7:00 | Przejrzyj pochodzenie danych i ograniczenia; otwórz README lokalnego ZIP | Rozróżnienie sceny kontrolnej od danych EGiB i brak nieuzasadnionego potwierdzenia geometrii dachu |

## Niezależna próba lokalna

W załączonym ZIP, po rozpakowaniu i instalacji Pythona 3.12 oraz uv:

```bash
uv sync --frozen --dev
uv run --frozen pytest -q --junitxml=moje-wyniki.xml
uv run --frozen python -m scripts.benchmark_roof_tests --output moje-pomiary.json
uv run --frozen python -m scripts.run_electrotile_3d_case wynik-modelu
uv run --frozen python -m scripts.run_electrotile_production_case wynik-przedmiaru
```

- `README.md` i `00_START_TUTAJ.md` w ZIP objaśniają scenariusze.
- `evidence/roof-test-results.xml` i `evidence/roof-benchmark.json` dokumentują poprzedni wykonany przebieg.
- `SOURCE_COMMIT.txt` identyfikuje wersję źródeł.
- `SHA256SUMS.txt` służy do sprawdzenia integralności poszczególnych plików paczki.

Pierwsza instalacja zależności wymaga internetu. Same testy są przeznaczone do lokalnego wykonania bez konta i usług Electrotile.

## Jak interpretować wyniki

**Przykładowa scena to referencja testowa, nie certyfikowana połać dachowa.** Wyszukiwanie adresu korzysta z żywych usług GUGiK, które bywają przejściowo niedostępne; błąd dostawcy jest raportowany, a nie przykrywany fikcyjnym wynikiem. W razie problemów z WFS pokaz można wykonać na dostarczonych, zamrożonych danych kontrolnych.

**Obiecujemy metodę i reprodukowalność, nie wynik testów systemu, którego nie udostępniono.** Rekonstrukcja tylko z obrazu satelitarnego, zestaw ~100 wycen, partia 20 zdjęć oraz czas pełnej oferty do 6 h pozostają do przetestowania na właściwym środowisku i danych zamawiającego.

## Szybkie linki

- Laboratorium: https://bipv-studio-production.up.railway.app/testy
- Studio: https://bipv-studio-production.up.railway.app/
- Kalkulator: https://bipv-studio-production.up.railway.app/produkcja
- Podstawa: zapytanie ET/2025/7, załącznik 2, §E, strony 9–13.
