# Registry9 Engineering | BIPV Studio + Test Lab
## Lokalny pakiet demonstracyjny ET/2025/7

**To nie jest prezentacja ani statyczne zdjęcia.** Pakiet zawiera działającą aplikację webową, gotowy frontend React/Three.js, serwer FastAPI, kod źródłowy, scenariusze kontroli jakości i raporty generowane na komputerze osoby oceniającej. **Nie potrzeba dostępu do GitHuba ani konta Electrotile.**

### 1. Uruchom aplikację

**Windows 10/11:** rozpakuj ZIP w zwykłym katalogu i uruchom dwukrotnie plik **START-STUDIO-WINDOWS.cmd**. Instalacja przy pierwszym uruchomieniu wymaga narzędzia `uv` (Astral; oficjalna strona https://docs.astral.sh/uv/getting-started/installation/). Instalacja w terminalu Windows:

```powershell
winget install --id astral-sh.uv -e
```

Po instalacji zamknij i ponownie otwórz terminal/Explorer, jeśli `uv` nie jest jeszcze widoczne. Skrypt sam pobierze środowisko Python 3.12 i zainstaluje pakiety z zamrożonego `uv.lock`. **Nie instaluje Node.js i nie potrzebuje Docker Desktop.** Jeżeli uruchamianie plików CMD jest zablokowane w firmie, uruchom te same komendy ręcznie:

```powershell
uv sync --python 3.12 --frozen --dev
uv run --python 3.12 --frozen python scripts\run_local_studio.py
```

**Linux lub macOS:** po zainstalowaniu `uv` uruchom `bash start-studio-mac-linux.sh`. Skrypt pracuje na tym samym kodzie i gotowym frontendzie.

W przeglądarce zostaną udostępnione trzy ścieżki:

| Obszar | Lokalny adres | Co sprawdzić |
| --- | --- | --- |
| **Laboratorium** | http://127.0.0.1:8765/testy | Uruchamianie rzeczywistych scenariuszy i eksportów OBJ/GLB oraz przedmiaru |
| **BIPV Studio** | http://127.0.0.1:8765/ | Model 2D/3D, edycja połaci/fasad, rozmieszczanie modułów, wyniki STC i eksport |
| **Kalkulator** | http://127.0.0.1:8765/produkcja | Przedmiar, rozkrój profili z rzazem i długości wiązek |

Port `8765` może zostać automatycznie zmieniony, jeśli jest zajęty; prawidłowy adres pojawi się w terminalu. Serwer nasłuchuje **wyłącznie pod 127.0.0.1**, nie udostępniając aplikacji w sieci lokalnej.

### 2. Uruchom komplet testów

Na Windows: **START-TESTS-WINDOWS.cmd**. Na Linux/macOS: `bash start-tests-mac-linux.sh`.

Jedna komenda z konsoli:

```powershell
uv run --python 3.12 --frozen python scripts\run_local_checks.py
```

Test-runner uruchamia kolejno:
- pełną regresję Python (pytest) z nowym raportem JUnit XML,
- benchmark API geometrii i eksportu OBJ, z pomiarem 3 prób na scenę,
- **ET-3D-01**: wygenerowanie, odczyt i sprawdzenie modeli OBJ/GLB na obrysie z dziedzińcem,
- **ET-PROD-01**: sprawdzenie arkuszy, rozkroju z rzazem i grafu wiązki.

Nowy folder `wyniki-lokalne/<data-id>/` zawiera JSON, JUnit, rzeczywiste modele, znormalizowane wyniki i logi. **Kod wyjścia 0 to PASS; inne wartości to FAIL**. Każdy przebieg tworzy nowy katalog bez podmieniania wcześniejszych dowodów.

### 3. Przegląd kodu

| Ścieżka w ZIP | Zawartość |
| --- | --- |
| `web/src/` | Kod React/TypeScript oraz scena i komponenty UX |
| `web/dist/` | **Gotowa, wbudowana aplikacja** (HTML/CSS/JS); nie trzeba uruchamiać `npm` |
| `server/` | FastAPI, geometria, OBj/GLB, kalkulator i testy Python |
| `scripts/` | Runner, niezależne kontrole, benchmark i lokalny serwer |
| `tests/fixtures/` | Wersjonowane przypadki testowe i ich oczekiwane wyniki |
| `contracts/` | Schematy i kontrakty wejścia/wyjścia |
| `docs/` | Protokół techniczny i metodyka testów |
| `MANIFEST.json` | Identyfikacja wersji i SHA-256 wszystkich załączonych plików |
| `SOURCE_COMMIT.txt` | Jednoznaczny commit źródeł |
| `SHA256SUMS.txt` | Lista sum kontrolnych plików |

`web/src` i `web/dist` pochodzą z tej samej kompilacji CI. Pakiet nie zawiera katalogu `node_modules`, plików `.env`, kluczy dostępu ani baz danych.

### 4. Tryb lokalny, internet i zakres

**Pierwsza instalacja wymaga dostępu do internetu**, aby pobrać zależności Python/uv i ewentualnie sam interpreter. Po instalacji scenariusze laboratoryjne na zamrożonych danych mogą być wykonywane bez internetu. Rzeczywiste wyszukiwanie adresów oraz ortofotomap od GUGiK wymaga połączenia z usługą publiczną i zależy od jej dostępności. Nie jest wymagane połączenie z chmurą Registry9/Supabase. Projekt można eksportować/importować lokalnie; funkcje wymagające kont i historii projektu w chmurze nie są aktywne w tym trybie.

Dane EGiB reprezentują rzeczywiste **obrysy budynków**, a nie potwierdzoną geometrię połaci, wysokość czy dopuszczalność montażu. Katalog demonstracyjny nie jest katalogiem produkcyjnym Electrotile. **Zielone testy lokalnego Studio nie oznaczają zaliczenia prób odbiorczych systemu Electrotile.** Te wymagają rzeczywistych modułów zamawiającego, jego danych i uzgodnionych wzorców.

### 5. Weryfikacja techniczna i bezpieczeństwo

Pakiet jest generowany i testowany automatycznie przez GitHub Actions. Procedura powinna m.in. potwierdzić sumy SHA-256, możliwość uruchomienia w czystym katalogu, serwowanie frontendowych assetów oraz cztery rzeczywiste scenariusze `/api/demo/tests/{id}`. Skrypty startowe nie instalują usług systemowych ani nie zapisują danych poza katalogiem pakietu i zwykłym cache `uv`. Naciśnij Ctrl+C, aby zamknąć serwer. Gdy lokalny komputer posiada ograniczenia polityk IT, można użyć publicznego https://bipv-studio-production.up.railway.app/testy; jest to opcja dodatkowa, nie zastępuje lokalnego ZIP.

**Prawa:** materiały przekazano wyłącznie do oceny zdolności technicznej w związku z ET/2025/7. Udostępnienie kodu w tym ZIP nie oznacza automatycznego udzielenia publicznej licencji open-source ani zgody na niezależną dystrybucję. Podstawy prawne wykorzystania kodu wynikają z odrębnych ustaleń stron.

**Kontakt:** Registry9 Engineering · informacje formalne oferenta znajdują się w podpisanym formularzu oferty.
