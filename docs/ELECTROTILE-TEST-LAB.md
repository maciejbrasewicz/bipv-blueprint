# ET/2025/7 — wykonawcza procedura testowania i retestu

Podstawa to załącznik 2, s. 9–13 oraz warunki zdolności z zapytania, s. 3. Wykonawca testuje funkcjonalność i parametry niefunkcjonalne trzech modułów Electrotile, zgłasza i poprawia usterki oraz przedstawia wyniki retestów. Dla każdej próby zachowuje wejście, niezależną referencję, wersję badanego systemu, działania operatora, wyniki i identyfikatory dowodów. [Protokół progów i danych](ELECTROTILE-ACCEPTANCE.md)

## Karty scenariuszy

Do rozpoczęcia przebiegu klient przekazuje konta i bezpieczne środowisko testowe, wersję systemu, mapowanie akcji i eksportów, firmowy katalog z wersją reguł, zestaw wycen oraz dozwolone obrazy i wzorce. Ustala też warunki sieci, cache, zasoby, tolerancje porównań, regułę wyłączeń i wskazuje osobę potwierdzającą przypadki referencyjne. Brak uzgodnionego warunku to BLOCKED. Błąd lub brak wyniku po rozpoczęciu poprawnie przygotowanej próby to FAIL.

| ID próby | Wykonanie | Wzorzec, wynik i dowód |
|---|---|---|
| I-01.1 | Wybierz seed i wylosuj 10 adresów z zamrożonej populacji jednego województwa. Dla każdego uruchom interfejs, poczekaj na rekonstrukcję, zapisz model i otwórz go w niezależnym czytniku. Zapisuj czas od uruchomienia interfejsu do poprawnego eksportu. | Cel 300 s, granica 900 s. Źródło geometrii to wyłącznie obraz satelitarny. Porównaj budynek, skalę i połacie z ustalonym wzorcem. Zachowaj plik, precyzyjny ślad etapów i wynik per adres, także przy braku obrazu lub błędzie eksportu. |
| I-01.2 | Odpowiedz na sytuację błędnego geokodowania, sąsiadujących budynków, braku pokrycia, przerwanego wywołania dostawcy i powtórzonego uruchomienia. | Potwierdzenie właściwej lokalizacji, jawny status błędu i brak przypisania starego wyniku do innego adresu. Dla każdego wariantu zachowaj stan i log źródła. |
| I-01.3 | Skoryguj wierzchołek obrysu, usuń przeszkodę i odtwórz ekspozycję w edytorze po otwarciu. Obejrzyj niezależnie model i skalę. | Identyfikatory i orientacja pozostają przypisane do właściwej powierzchni. Porównaj zapis i eksport przed/po. Osobne przypadki dachu i fasady. |
| I-02.1 | Wczytaj historyczny pakiet wejściowy i uruchom automatyczny dobór. Odbierz kompletne rozmieszczenie z liczbą i typami aktywnych modułów; ponów przy wyzerowanej użytecznej powierzchni. | Cel 60 s, granica 120 s, rozbieżność liczby do 20%. Typ według uzgodnionego mapowania SKU. Zero referencyjne wymaga zera; rozkład odchyleń licz per przypadek i przedstaw regułę agregacji. |
| I-02.2 | Przy granicy jednego panelu zmień dostępny wymiar o wartość tuż po obu stronach granicy. Powtórz po przesunięciu układu lokalnego, zmianie orientacji, przy kominie i otworze. | Ręcznie niezależne wymiary i pełne obrysy paneli; sprawdź brak przecinania otworu, odsunięcia, liczbę i moc Wp. Porównaj raport i eksport. |
| I-03.1 | Użyj identycznego pliku pogody, katalogu, orientacji i konfiguracji. Porównaj dach oraz fasadę bez cienia, z kominem i ze zmienionym kątem. | STC z sumy Wp, kWh/rok z niezależnego modelu, założenia STC i straty zapisane; tolerancję uzysku uzgodnij przed testem. |
| II-01.1 | Wybierz katalogowy wzór mikropanelu; zmień dopuszczalny wymiar. Powtórz wartość na krańcu zakresu i tuż poza nim. | Wersja i liczba elementów wzoru zgodne z kartą. Poza zakresem kontrolowane odrzucenie z ustalonym kodem. |
| II-01.2 | Dla rysunku referencyjnego zapisz przedmiar i listę cięć, także z kątami. Uruchom przypadki idealnego dopasowania, rzazu wymuszającego drugą sztangę i niedozwolonego profilu. | Porównaj pozycję po pozycji. Wiąż każde cięcie ze sztangą i SKU. Długości odcinków + niezależnie policzony rzaz + odpad muszą bilansować pełną długość. |
| II-01.3 | Zmień wymiar jednej połaci lub wycofaj SKU i przelicz dwa razy na tym samym wejściu. | Zostają tylko pozycje aktualnej rewizji. Pokrycie BOM sprawdź dla niezależnego rysunku i liczby mocowań, także przy braku wykonalnej listy. |
| II-02.1 | Wygeneruj schemat dla uzgodnionej topologii. Sprawdź porty, typ i polaryzację połączeń oraz kompletność wiązek. | Zestawienie końców i złączy ma odpowiadać zatwierdzonemu schematowi. Zmiana portu lub złącza powoduje rozbieżność per wiązka. |
| II-02.2 | Porównaj uzgodnioną ścieżkę z kilkoma odcinkami i zapasem. Zamknij dopuszczalną trasę i sprawdź alternatywę zatwierdzoną w manifeście lub udokumentowane odrzucenie. | Długość jest sumą odcinków i zapasu w mm. Odcinki muszą łączyć się w poprawnym porządku, a brak tras daje ustalony komunikat błędu. |
| III-01.1 | Wgraj zdjęcie i rzut, pobierz oba, zastąp jeden, usuń go i ponów próbę odczytu przez standardowy interfejs. | Typ, sumy plików i audyt odczytu odpowiadają aktualnym danym. Poprzednia i usunięta wersja nie są dostępne w ścieżce klienta. Retencję archiwalną ustal osobno. |
| III-01.2 | Opublikuj ofertę, zmień dane wejściowe i odczytaj tę samą wersję. Złóż zamówienie z oferty i ponów tę samą intencję wysyłki. | Suma opublikowanego snapshotu i kwota pozostają stałe. Dwa wywołania o jednym kluczu dają jeden rekord zamówienia związany z właściwą wersją. |
| III-01.3 | W tej samej sesji pomiarowej wypuść dwa nakładające się żądania rezerwacji tego samego terminu z dwóch kont testowych. Odczytaj zapisany stan po obu odpowiedziach. | Dokładnie jedno potwierdzenie, drugie żądanie zwraca konflikt. Jedna rezerwacja w stanie końcowym. Zapisz czasy rozpoczęcia i ukończenia obu wywołań na jednym zegarze. |
| III-02.1 | Od przyjęcia kompletnego zgłoszenia wykonaj kalkulację, wizualizację i pełną ofertę. Zmierz czas pracy i oczekiwania oddzielnie, zachowując jeden ciągły zegar. | Maksymalnie 6 h do dostępności wyceny, kalkulacji opłacalności i wizualizacji. Sprawdź komplet dokumentów, poprawność sum i zamrożone parametry. |
| N-01.1 | Wprowadź partię 20 adresów z planem napływu i zarejestruj otrzymanie ostatniego poprawnie obrobionego zdjęcia. Powtórz ze stanem zimnym i ciepłym zgodnie z protokołem. | Od pierwszego adresu do końca kompletu cel 300 s, granica 500 s. Sprawdź dokładnie 20 dopasowanych, niezdublowanych obrazów i raport czasów per adres. |
| N-01.2 | Powtórz obciążenie z kontrolowaną awarią dostawcy, ponowieniem i utratą procesu roboczego na wydzielonym środowisku. | Przypadek pozostaje w oryginalnej partii. Mierz od pierwotnego startu. Zapisz statusy, ponowienia i ewentualną utratę zadania lub niejednoznaczny wynik. |

## Uruchomienie laboratorium niezależnie od CI

`scripts.electrotile_lab` uruchamia dobór I-02.1, ocenę geometrii i mocy STC powiązaną z I-01.3, I-02.2 i I-03.1, a także II-01.2, II-02.1–2, III-01.1–3 i uzgodnione odrzucenia modułu II. Adapter dostaje na stdin plik wejściowy, a końcowe argumenty identyfikują kryterium i przypadek. Na stdout zwraca znormalizowany wynik odczytany z interfejsu, eksportu lub API. Dane odniesienia pozostają w manifeście. W środowisku klienta adapter trzeba połączyć z rzeczywistymi operacjami, odczytem stanu końcowego i śladem błędu. III-01.3 wymaga dowodu, że dwa wywołania rzeczywiście się na siebie nałożyły.

Manifest zamraża identyfikatory, kryteria, skróty wejść i dane referencyjne. `run` sprawdza wejścia przed próbą, zapisuje `capture.json`, znormalizowane wyniki w `artifacts/` i `report.json`. `score` sprawdza skróty przed oceną i wykazuje wartość oczekiwaną oraz faktyczną. Nieudane uruchomienie lub timeout pozostaje w raporcie. Przebieg porównawczy z `--baseline` ponownie sprawdza oba zestawy. Oryginalną usterkę zamyka tylko zaliczony retest na tym samym manifeście, środowisku i adapterze. Zmiana wersji wydania jest identyfikowana. Komenda zwraca 0 przy zaliczeniu, 1 przy FAIL lub NOT_RUN oraz 2 przy błędzie formatu danych lub konfiguracji. W trybach `studio-fixture` i `replay` raport odbiorczy pozostaje BLOCKED.

Pakiety II i III używają milimetrów, tysięcznych części stopnia oraz kwot w jednostkach podrzędnych waluty. Dla II-01 polityka liczby przejść na detal i szerokości rzazu pochodzi z manifestu producenta. Dla II-02 dopuszczalne trasy i zapas pochodzą ze schematu referencyjnego. SHA-256 nie potwierdza autorstwa eksportu ani poprawności mapowania danych. Po stronie klienta zachowaj oryginalny eksport, czas operatora, identyfikator żądania i ślad przejść w dostępie ograniczonym do projektu. Pola adaptera i testowe kody odrzuceń to jawny kontrakt normalizacji.

### Demonstracja kontroli, awarii i retestu

```sh
base=tests/fixtures/electrotile-lab/functional-replay
release=$(git rev-parse HEAD)
python -m scripts.electrotile_lab run "$base/manifest.json" "$base/inputs" /tmp/et-before \
  --run-id replay-before --scope replay --release-sha "$release" \
  --environment-id lab --adapter-id fixture-v1 \
  --adapter python tests/fixtures/electrotile-lab/replay_adapter.py faulty
# Pierwszy przebieg celowo zwraca 1.
python -m scripts.electrotile_lab run "$base/manifest.json" "$base/inputs" /tmp/et-after \
  --run-id replay-after --scope replay --release-sha "$release" \
  --environment-id lab --adapter-id fixture-v1 \
  --adapter python tests/fixtures/electrotile-lab/replay_adapter.py fixed
python -m scripts.electrotile_lab score "$base/manifest.json" /tmp/et-after --baseline /tmp/et-before
```

W wykonanym przebiegu pierwsza wersja atrap wykazała 9 rozbieżności w 3 scenariuszach i zaliczyła kontrolowane odrzucenie wzoru. Retest syntetyczny zaliczył 4 z 4 i ponownie sprawdził wszystkie 9 usterek. Ręczne dane wzorcowe to między innymi 6000 = 3000 + 2500 + 2 × 3 + 494 mm oraz `2500 + 3500 + 200 = 6200` mm przewodu. W wyścigu dwóch rezerwacji obie odpowiedzi są zbierane z rzeczywiście nakładających się wywołań kodu atrapy.

### Próby doboru PV przez prawdziwe API Studio

```sh
base=tests/fixtures/electrotile-lab/studio-pv
python -m scripts.electrotile_lab run "$base/manifest.json" "$base/inputs" /tmp/et-studio-pv \
  --run-id studio-pv --scope studio-fixture --release-sha "$(git rev-parse HEAD)" \
  --environment-id studio-test --adapter-id studio-layout-http-v1 \
  --adapter python -m scripts.electrotile_studio_adapter http://127.0.0.1:8000
```

Uruchom Studio w innym procesie. Trzy wymiary referencyjne wynikają z ręcznie policzonej siatki. Obserwowane API zwróciło 6, 0 i 20 modułów; przebieg uruchomiony lokalnie trwał odpowiednio około 216 ms, 246 ms i 161 ms per przypadek, z narzutem adaptera. To wynik demonstracji API na syntetycznych danych. I-01, N-01 i III-02 korzystają z własnych rejestracji zdarzeń oraz `scripts.check_electrotile_run` i wymagają faktycznych artefaktów oraz warunków klienta.

### Niezależna kontrola geometrii i mocy STC

Wzorce analityczne zawierają połać skośną 3,20 × 2,10 m z otworem 0,575 × 0,80 m oraz fasadę 1,15 × 1,34 m. Oczekiwane pola eksportu wynoszą 6,26 m² (po odjęciu otworu) i 1,541 m². Na połaci po uwzględnieniu otworu i marginesów mieszczą się trzy rzędy po dwie dachówki. Na fasadzie mieszczą się dwa rzędy po jednej. Dla przykładowej dachówki 32 Wp daje to odpowiednio 0,192 i 0,064 kWp. Tolerancje manifestu dotyczą precyzji syntetycznego eksportu. Odbiór klienta wymaga osobno zatwierdzonych tolerancji pomiarowych.

Adapter pobiera układ i OBJ przez HTTP, sprawdza ich wspólny identyfikator sceny, zachowuje źródłowy tekst OBJ i jego SHA-256. Kontrola odczytuje geometrię ścian bez użycia kodu eksportera. Sprawdza poprawność płaszczyzny i orientacji, pokrycie obrysu z otworami, powielone fragmenty, liczbę i wymiary paneli, położenie względem raportu i dozwolonego obszaru, nakładanie modułów oraz moc STC. Aktualny kontrakt przyjmuje metryczny OBJ z grupami `surface_<id>` i `module_<id>`, w osiach X = wschód, Y = góra, Z = −północ. Dane wymagane przez I-01 dla rekonstrukcji satelitarnej oraz roczny uzysk z I-03 wymagają osobnych przebiegów.

```sh
# W pierwszym terminalu.
uv run --frozen uvicorn server.app:app --port 8000

# W drugim terminalu w katalogu repozytorium. Użyj nowego katalogu na każdy przebieg.
base=tests/fixtures/electrotile-lab/studio-geometry
release=$(git rev-parse HEAD)
uv run --frozen python -m scripts.electrotile_lab run "$base/manifest.json" "$base/inputs" /tmp/et-geometry \
  --run-id geometry-clean --scope studio-fixture --release-sha "$release" \
  --environment-id studio-test --adapter-id studio-http-v2 \
  --adapter python -m scripts.electrotile_studio_adapter http://127.0.0.1:8000
```

| Próba kontrolna | Wykryta rozbieżność |
|---|---|
| Przelicz współrzędne przez ×1000 | Geometria opuszcza płaszczyznę, a pole i granice przestają odpowiadać wzorcowi. |
| Odwróć kolejność wierzchołków ściany | Pojawia się odwrócona orientacja. |
| Powiel ścianę siatki | Suma pól ścian przekracza pole ich unii. |
| Przenieś moduł do otworu | Moduł przecina obszar wyłączony z montażu. |
| Zmień wartość mocy z kWp na Wp bez konwersji | Wynik odbiega o czynnik 1000. |
| Przesuń pozycję modułu w raporcie o 1 cm | Raport i eksport podają różne położenia. |

Na lokalnym HTTP oba eksporty Studio przeszły. Laboratorium wykryło wszystkie sześć kontrolowanych zmian i odnotowało 46 rozbieżności, licząc osobno skutki w poszczególnych płaszczyznach i panelach. Retest na dwóch świeżych eksportach zamknął wszystkie 46. Skrypt `geometry_control.py` pobiera wynik z tego samego API, po czym wprowadza wskazaną zmianę w kopii dowodu. Dla odtworzenia użyj parametrów `--adapter python tests/fixtures/electrotile-lab/geometry_control.py MODE http://127.0.0.1:8000`, z trybem `scale`, `winding`, `duplicate-face`, `opening`, `power-units` lub `layout-shift`. Powtórz z trybem `clean` do nowego katalogu i porównaj oba uruchomienia przez `score --baseline`.
