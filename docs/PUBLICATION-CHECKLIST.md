# Wydanie źródeł jako publicznego repozytorium — procedura bezpieczna

**Nie zmieniaj widoczności dotychczasowego `maciejbrasewicz/bipv-blueprint` na Public.** Ten projekt zawiera wielowersyjną prywatną historię, Pull Requesty, zgłoszenia, logi Actions i dokumentację rozwojową. Po zmianie widoczności stałyby się dostępne publicznie. Bezpieczniejsze jest **nowe repozytorium z jedną kontrolowaną wersją plików**.

## Co trzeba opublikować

- Źródła aktualnej wersji Studio, Laboratorium i Kalkulatora (bez `node_modules`, `.venv` i `.env`).
- `LICENSE` — własna restrykcyjna licencja **source-available / evaluation-only**, nie MIT, GPL ani Apache.
- Profesjonalny `README.md` z linkami do działającej aplikacji i uruchomienia testów.
- `server/tests`, `tests/fixtures`, `scripts`, `contracts`, `docs` — scenariusze, referencje i metodę oceny.
- `.github/workflows/source-evaluation.yml`, `.github/workflows/evaluation-release.yml` — niezależne wykonanie testów na GitHubie i zautomatyzowany ZIP Release.
- Pełny kod `web/src` i `server`, lecz **bez starych gałęzi, prywatnych issue/PR i historii repozytorium**.

## Krok 1. Pobierz ZIP z zielonego GitHub Actions

Z ostatniego poprawnego przebiegu Quality gates (na gałęzi publikacyjnej) pobierz artefakt
`electrotile-source-review-zip` zawierający
`Registry9-ET-2025-7-Source-and-Tests.zip`.

Dołączony `SOURCE_COMMIT.txt` wskazuje dokładny SHA źródła; `MANIFEST.json` i `SHA256SUMS.txt` zawierają spis i skróty wszystkich plików. Nie publikuj ZIP, jeśli CI albo test clean-room nie ma statusu SUCCESS.

## Krok 2. Stwórz czyste repozytorium

W GitHubie: **+ → New repository → Public**, przykładowa nazwa `registry9-bipv-studio`. Nie inicjalizuj repo README, licencją ani `.gitignore`, ponieważ te pliki pochodzą z naszego ZIP.

Po pobraniu i rozpakowaniu źródeł w katalogu docelowym:

```bash
git init -b main
git add .
git commit -m "Registry9 BIPV Studio | ET/2025/7 source-available evaluation release"
git remote add origin https://github.com/maciejbrasewicz/registry9-bipv-studio.git
git push -u origin main
```

To tworzy publiczne repo **z jednym nowym commitem, bez prywatnej historii**. Potrzebne są lokalny Git i uwierzytelnienie do GitHuba. Adres `registry9-bipv-studio` jest proponowany i będzie działał dopiero po rzeczywistym utworzeniu repo.

## Krok 3. CI i Releases

Nowe repo zawiera własne workflow:

1. `Public source evaluation` — Python, Chrome/Playwright, zbudowanie UI oraz clean-room test ZIP. Poczekaj na SUCCESS.
2. Utwórz tag `et2025-7-review-v1` wskazujący poprawny commit `main`, a GitHub Actions uruchomi `Publish evaluation ZIP release` i dołączy testowy ZIP do **Releases**. Dopóki ta operacja się nie zakończy, nie podawaj linku do Releases jako działającego.

Na karcie repozytorium README ma prowadzić do https://bipv-studio-production.up.railway.app/testy, a następnie do konkretnych testów i kodu.

## Krok 4. Check before submission

- [ ] Publiczna strona repo otwiera się w oknie incognito.
- [ ] GitHub Actions pokazuje nowe SUCCESS po publikacji (nie używa prywatnej historii).
- [ ] ZIP z Releases pobiera się bez logowania i przechodzi `python scripts/verify_public_review.py ...`.
- [ ] Testy uruchamiają się po rozpakowaniu i `uv sync --frozen --dev`, bez konta Registry9.
- [ ] Żaden publiczny plik nie zawiera tajnego klucza, danych klientów, pełnych wewnętrznych planów finansowych ani prywatnych rozmów.
- [ ] Treść `LICENSE` określa prawidłowego **właściciela praw majątkowych**. Jeżeli właścicielem kodu jest formalnie spółka, należy odpowiednio skorygować notice (co może wymagać sprawdzenia umów i autorstwa). Konsekwencje prawne restrykcyjnej licencji warto potwierdzić z prawnikiem.
- [ ] Publikacja nie jest mylona z open-source: GitHub nadal uprawnia do przeglądania i forkowania publicznych źródeł zgodnie z regulaminem.

**W ofercie:** publiczny link do Laboratorium, publiczny link do nowego repozytorium i GitHub Release, plus obowiązkowy ZIP testów dołączony jako plik w BK2021, nie jedynie URL.
