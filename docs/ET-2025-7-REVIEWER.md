# ET/2025/7 · Instrukcja oceny technicznej

**Przedmiot:** przykładowe testy modułów związanych z pokryciami dachowymi, lokalne wykonanie testów, niezależne kryteria, dowody i kod źródłowy. Nie jest to zamówienie na dostawę BIPV Studio.

## Dwie niezależne ścieżki oceny

**A. W przeglądarce — bez instalacji.** Wejdź na [Laboratorium](https://bipv-studio-production.up.railway.app/testy). Uruchom kontrolę eksportu geometrii z dziedzińcem oraz planu produkcyjnego. Zwróć uwagę na oddzielne wartości oczekiwane i otrzymane, pochodzenie wejść, SHA-256 raportu i pliki OBJ/GLB. Następnie otwórz [Studio](https://bipv-studio-production.up.railway.app/) i [Kalkulator](https://bipv-studio-production.up.railway.app/produkcja), by zobaczyć działanie testowanego silnika w interfejsie użytkownika.

**B. Na własnym komputerze — z ZIP, bez konta.** Rozpakuj załączony `Registry9-ET-2025-7-Source-and-Tests.zip`, a następnie (Python 3.12, uv):

```bash
uv sync --python 3.12 --frozen --dev
uv run --frozen pytest -q --junitxml wyniki.xml
uv run --frozen python -m scripts.run_electrotile_3d_case wynik-model-3d
uv run --frozen python -m scripts.run_electrotile_production_case wynik-przedmiar
```

Po uruchomieniu powstaną nowe pliki z aktualnego wykonania: wyniki testów, modele 3D, raporty, dane wejściowe i ich sumy kontrolne. Możesz odczytać je bez dostępu do portalu Registry9. Zapisany wynik uruchomienia GitHub Actions służy porównaniu, nie zastępuje lokalnego testu.

**Pierwsza instalacja zależności wymaga internetu**; same zamrożone przypadki domenowe można następnie wykonywać bez połączenia z systemem zamawiającego.

## Mapa kodu

| Cel | Gdzie czytać |
| --- | --- |
| Silnik układania modułów, geometria i API | `server/geometry.py`, `server/app.py`, `server/models.py` |
| Generowanie i odczyt modeli OBJ/GLB | `server/model_export.py`, `server/glb_export.py`, `scripts/electrotile_geometry.py` |
| Materiały, arkusze, cięcia i obwody | `server/production_plan.py`, `scripts/electrotile_product.py` |
| Laboratorium + raporty | `server/demo_lab.py`, `scripts/electrotile_lab.py` |
| Widoki użytkownika | `web/src/App.tsx`, `web/src/TestLab.tsx`, `web/src/ProductionStudio.tsx` |
| Scenariusze i niezależne oczekiwania | `server/tests/`, `tests/fixtures/electrotile-lab/` |
| Kryteria kwalifikacji ofertowej | `docs/ELECTROTILE-ACCEPTANCE.md` |
| Manifest i historia pochodzenia | `SOURCE_COMMIT.txt`, `MANIFEST.json`, `SHA256SUMS.txt` |

## Precyzyjny zakres dowodu

- Wyniki dotyczą autorskiej aplikacji Registry9 i wzorców testowych opisanych w pakiecie.
- Wybór rzeczywistego obrysu EGiB nie oznacza pomiaru połaci dachowej.
- Nie deklarujemy ukończenia i odbioru oprogramowania Electrotile na podstawie testów własnego demonstratora.
- Załącznik 2 §E obejmuje trzy moduły, a próby graniczne 10 adresów, historycznych wycen, 20 obrazów i pełnej oferty do 6 h wymagają dostępu do rzeczywistego systemu i danych Electrotile.
- Każdy wynik jest rozdzielony od wnioskowania o systemie klienta. Tester musi zachować zarówno przypadki pozytywne, jak i błędy albo blokady.

**Warunki licencyjne:** publiczny dostęp do źródeł służy przeglądowi i ewaluacji. Repozytorium jest **proprietary / source-available**, a nie open source. [LICENSE](../LICENSE).
