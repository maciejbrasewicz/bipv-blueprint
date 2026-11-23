# ET/2025/7 — kontrola publicznego repozytorium i wydania

Repozytorium `https://github.com/maciejbrasewicz/bipv-blueprint` jest publiczne.
**Nie publikuj ponownie historii ani nie twórz bez potrzeby kopii repozytorium.**
Historia tego repo, stare PR, commity i logi GitHub Actions są dostępne publicznie;
potwierdź, że nie ujawniają danych wrażliwych. GitHub nie gwarantuje, że
usunięcie pliku z bieżącej gałęzi usunie go z historii.

## Kanoniczny sposób oceny

1. **Produkt:** https://bipv-studio-production.up.railway.app/
2. **Interaktywne testy:** https://bipv-studio-production.up.railway.app/testy
3. **Kalkulator:** https://bipv-studio-production.up.railway.app/produkcja
4. **Źródła:** https://github.com/maciejbrasewicz/bipv-blueprint
5. **Testy CI:** zakładka Actions, workflow Quality gates i Public source evaluation.
6. **Releases:** pakiet `Registry9-ET-2025-7-Source-and-Tests.zip`,
   publikowany wyłącznie z zatwierdzonego i przetestowanego tagu
   `et2025-7-review-vN`. Do chwili publikacji tagu i wydania Releases
   nie wolno sugerować, że link już istnieje.
7. **BK2021:** załącz ZIP bezpośrednio do oferty — nie zastępuj go URL.

## Co sprawdzić po aktualizacji main

- [ ] Z publicznego okna incognito otwiera się README i `LICENSE`.
- [ ] Main zawiera `web/src/TestLab.tsx`, `server/demo_lab.py`,
  `web/src/ProductionStudio.tsx` oraz pełną dokumentację.
- [ ] GitHub Actions pokazuje SUCCESS dla commita będącego podstawą wydania.
- [ ] ZIP przechodzi `python scripts/verify_public_review.py PATH_TO_ZIP`.
- [ ] W ZIP występują prawdziwe źródła i instrukcje lokalnych testów
  (Python 3.12 i uv; pierwszy `uv sync` wymaga internetu).
- [ ] Katalogi `.git`, `.venv`, `node_modules` i dane produkcyjne
  nie trafiły do dystrybucji.
- [ ] To, że repozytorium jest publiczne, nie oznacza licencji open source:
  `LICENSE` dopuszcza jedynie ograniczoną ewaluację.
- [ ] Właściciel praw i uprawnienie do udzielenia licencji zostały sprawdzone.
- [ ] Oferta zawiera zał. 1, 3, 4, lokalnie uruchamialny ZIP i opis techniczny.
- [ ] Złożenie oferty następuje wyłącznie w module Oferty BK2021 przed terminem.

### Ścieżka użytkownika oceniającego

README → kliknięcie Laboratorium → wykonanie ET-3D-01 i ET-PROD-01
→ Studio/Kalkulator → repozytorium z kodem → pobranie ZIP
→ uruchomienie `uv sync --frozen --dev`, `uv run pytest`
i skryptów odtwarzających próbki → porównanie aktualnego wyniku
z dołączonym JUnit i benchmarkiem.

**Ważne rozgraniczenie:** wyniki dotyczą własnego demonstratora Registry9
i próbek syntetycznych. Nie są wynikiem odbioru rzeczywistych modułów Electrotile.
