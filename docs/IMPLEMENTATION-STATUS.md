# BIPV Studio i ET/2025/7 — stan na 21 listopada 2026

ET/2025/7 obejmuje testy funkcjonalne i niefunkcjonalne trzech modułów systemu Electrotile oraz poprawki wykrytych błędów. Realizacja trwa 14 dni od podpisania umowy. Zapytanie wymaga przykładowych scenariuszy i technicznego dowodu wykonania testów dachowych w paczce uruchamianej lokalnie. O punktacji decyduje cena netto. BIPV Studio pozostaje własnym demonstratorem, środowiskiem rozwoju oraz źródłem próbki testowej. Odbiór wymaga autoryzowanego dostępu do systemu, danych i środowiska klienta. [Zakres ET/2025/7](ELECTROTILE-DELIVERY.md) · [Plan produktu](PRODUCT-ROADMAP.md) · [Pełna lista pakietów i zależności](../foundry/PRODUCT-BACKLOG.tsv)

## Wersje i dowody

| Stan | Zweryfikowany zakres |
|---|---|
| **Produkcja P09** | Railway zwrócił status OK i SHA `8432f18e49f94c087881cceb03edc76b608d7d35`. Działa wybór adresu UUG i budynku EGiB. Poprzednie wydania dostarczyły edytor UV/3D, import geometrii, układ demonstracyjnych paneli, moc STC, eksport OBJ, rewizje i przestrzenie organizacji. [Historia wydań](https://github.com/maciejbrasewicz/bipv-blueprint/blob/main/docs/RELEASE.md) |
| **QA w PR #7** | 47 przypadków zaawansowanej regresji geometrii. Poprawione nieprawidłowe odrzucanie modułów przy dokładnym spasowaniu i azymut 360°. Dodatkowych 56 przypadków automatu odbiorczego kontroluje czasy, dane wejściowe, kompletność i dobór PV. 160 testów Python i 8 Chromium w przebiegu tej gałęzi. [PR #7](https://github.com/maciejbrasewicz/bipv-blueprint/pull/7) · [CI](https://github.com/maciejbrasewicz/bipv-blueprint/actions/runs/44917933406) |
| **Stos PR #8–#11** | Georeferencjonowana ortofotomapa i pomiar 2D, edytowalny obrys przeliczany do lokalnego ENU, propozycja konturu po wskazaniu wnętrza dachu, opcjonalne dwie połacie wyznaczone ręcznie podaną kalenicą i kątem. Model oznaczony jako szacowany. Eksploracyjny wynik detektora to 1 propozycja na 6 widocznych dachów, IoU ok. 0,81 i maksymalna rozbieżność krawędzi 1,23 m w tym przypadku. [PR #11](https://github.com/maciejbrasewicz/bipv-blueprint/pull/11) · [CI](https://github.com/maciejbrasewicz/bipv-blueprint/actions/runs/44930922753) |
| **Bieżący etap PR** | P13 obejmuje również eksport GLB z metryczną sceną, otworami, przeszkodami i aktywnym wariantem PV. Plik zawiera identyfikatory powierzchni i modułów oraz hash wejścia. Pełny stan sprawdzeń podaje przebieg CI przypięty do commita PR. |

Stos produktowy #8 → #9 → #10 → #11 → bieżący PR oraz niezależny PR #7 mają własne wyniki testów. Ich wdrożenie wymaga integracji i testu wspólnego SHA. Zakładana koperta runtime obejmuje jeden usypiany serwis Railway z jedną repliką, 250 MB RAM i 0,1 vCPU oraz Supabase Free. Aktualne bramki obejmują blokady zależności, Ruff, pytest, migracje na odrębnym Postgresie, budowę web, Chromium, test kontenera i lokalnie uruchamialną próbkę. Po promocji workflow weryfikuje SHA na żywym health oraz izolację projektów i rewizji. [Weryfikacja produkcji P09](https://github.com/maciejbrasewicz/bipv-blueprint/actions/runs/44913416525)

## Plan wdrożenia produktu

| Pakiety | Co jest dziś | Co zamyka następny etap |
|---|---|---|
| **P01–P08 · fundamenty** | Kontrakty Scene v1/v2, schematy Catalog/Job, syntetyczne sceny dachu i fasady, edycja otworu, historia rewizji, uprawnienia organizacji, przejęcie projektu gościa i CI. | Akceptacja pełnego logowania konta imiennego na środowisku pilotażowym i dane od producenta. |
| **P09–P16 · wejście i geometria** | P09 wdrożony. P11–P14 częściowo zrealizowane na stosie PR, łącznie z GLB w bieżącym etapie. Tor ortofotomapy ma skalę metryczną i ręczne poprawki. | P10 trwały stan zadania, retry, lease i anulowanie. P15 zdjęcia/rzuty z walidacją i audytem. Fasada ze zdjęcia, pomiar nachylenia i wysokości, walidacja kalibracji oraz bramka P16 z niezależnym pomiarem. |
| **P17–P24 · projekt PV, materiały, wiązki** | Istnieje kontrakt katalogu, układ geometryczny dla dwóch orientacji z demonstracyjnymi SKU, STC i podstawowy CSV. | Rzeczywisty katalog i reguły krycia, wzory mikropaneli, przedmiar i cięcia profili, obwody i wiązki, interfejs porównania oraz weryfikacja przez projektanta. |
| **P25–P32 · energia, oferta, audyt** | Wizualny cień i zapis projektu z historią stanowią bazę. | Dane pogodowe, uzysk DC/AC i bilans cienia, cennik i snapshot oferty, dokumenty klienta, audyt i rezerwacja odporna na podwójne zgłoszenie. Osobna referencja eksperta dla dachu i fasady. |
| **P33–P36 · automatyzacja, wydajność i odbiór** | Automat progów i wzorce pomiaru w PR #7. | Prawdziwy runner dla 10 i 20 adresów, pomiary z usługami klienckimi i limitami, awarie/retry, niezależna powtórka oraz narzędzia AI działające na sprawdzonym API domenowym. |
| **P37–P40 · pilotaż** | Istnieje pipeline weryfikacji i przypięcia wydania. | Flagi na organizację, backup i odtworzenie, logi biznesowe, co najmniej 3 pełne sprawy pilotażowe, decyzja na konkretnym SHA. |
| **P41–P60 · rozszerzenia** | Backlog po fundamencie. | Alternatywne źródła, pomiar przewagi ML, większa geometria, elektryka i optymalizacja materiałów, benchmark energii, DXF, rozwinięcie ofertowania i audytu, porównania rynkowe oraz drugie wydanie dla organizacji. |

Architektura docelowa łączy React/Three.js, domenowe API FastAPI/Pydantic, warstwę metryczną ENU/UV i Supabase Auth/Postgres/Storage. Dane projektowe, obliczenia i oferty są powiązane z rewizją oraz wersjami katalogu i reguł. Cięższe zadania mają dostać jawny stan i uruchamiany na żądanie worker. Rejestr dowodów zawiera wejście, wersję kodu, wynik, znaczniki czasu, warunki testu i skróty artefaktów. Z dev CI nie promujemy wyników na produkcję bez weryfikacji exact SHA. [Architektura docelowa](PRODUCT-ROADMAP.md#architektura) · [Plan testów](https://github.com/maciejbrasewicz/bipv-blueprint/blob/0a81580f32129f8d2f12c5a4024ec99965fe5d2f/docs/ELECTROTILE-TEST-ARCHITECTURE.md)

## Odbiór ET/2025/7

| Próba | Wymaganie | Co jest potrzebne do odbioru |
|---|---|---|
| I-01 · adres → model | 10 losowych adresów z jednego województwa, wyłącznie zdjęcie satelitarne. Cel 300 s, limit 900 s. | Prawo do źródła satelitarnego, zamrożona próba i niezależna ocena geometrii. |
| I-02 · dobór PV | Cel 60 s, limit 120 s, odchylenie do 20% względem profesjonalnych wycen. | Historyczne wejścia i wyceny (ok. 100), katalog, reguła typów SKU i ustalone liczenie odchylenia. |
| N-01 · partia zdjęć | 20 poprawnych wyników obróbki. Cel 300 s, limit 500 s od pierwszego zgłoszenia. | Kolejka, dokładnie przypisane wyniki, czasy zimne i ciepłe, ponowienia i błędy dostawcy. |
| III-02 · oferta | Kompletna wycena, wizualizacja i opłacalność w 6 h. | Środowisko klienta, uzgodnione start i koniec oraz dane ofertowe i katalog. |

Pozostałe ścieżki funkcjonalne to geometria i roczny uzysk, wzory mikropaneli i cięcia, schematy i wiązki oraz media, zamówienie i rezerwacja audytu. Wszystkie próby odbiorcze pozostają zablokowane do momentu uzyskania wymaganych danych i środowiska. Przebiegi Studio i replay mają własny status i dowód. Kolejność umowna obejmuje inwentaryzację i pomiar bazowy w dniach 1–2, testy w dniach 3–7, poprawki i retesty w dniach 8–11 i pełną regresję oraz raport w dniach 12–14. [Protokół i automat](https://github.com/maciejbrasewicz/bipv-blueprint/blob/0a81580f32129f8d2f12c5a4024ec99965fe5d2f/docs/ELECTROTILE-ACCEPTANCE.md)
