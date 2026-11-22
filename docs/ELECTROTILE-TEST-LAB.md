# ET/2025/7 — wykonawcza procedura testowania i retestu

Podstawa to załącznik 2, s. 9–13 oraz warunki zdolności z zapytania, s. 3. Wykonawca testuje funkcjonalność i parametry niefunkcjonalne trzech modułów Electrotile, zgłasza i poprawia usterki oraz przedstawia wyniki retestów. Dla każdej próby zachowuje wejście, niezależną referencję, wersję badanego systemu, działania operatora, wyniki i identyfikatory dowodów. [Protokół progów i danych](ELECTROTILE-ACCEPTANCE.md)

## Demonstrator dla Electrotile

Górna nawigacja prowadzi do **Studia projektowego** oraz **Testów Electrotile** pod adresem `/testy`. Studio umożliwia samodzielne wskazanie adresu i budynku. Formularz osobno przyjmuje miejscowość oraz ulicę i numer, aby zapytanie miało format obsługiwany przez UUG. Użytkownik może wstawić przykładowy adres i wykonać rzeczywiste wyszukiwanie.

W publicznym laboratorium są cztery próby wykonywane na bieżącym wydaniu. Adres i budynek są sprawdzane przez GUGiK UUG i EGiB na żywo. Dobór PV i eksport geometrii używają zamrożonych danych kontrolnych Studio. Macierz obejmuje osiem wymagań, podaje kryteria i potrzebne dane klienta oraz wskazuje powiązane próby Studio. Wyniki prób Studio mają własny zakres w raporcie. Status odbioru produktu Electrotile pozostaje BLOCKED dla wymagań oczekujących na wejścia i dostęp.

### ET-3D-01 · Ściany budynku w OBJ i GLB

Publiczny przebieg używa zamrożonego obrysu kontrolnego z dziedzińcem, identyfikowanego przez `reference.json`. Buduje scenę i generuje oba formaty przy użyciu tych samych eksporterów, które obsługują Studio. Kontrola otwiera wygenerowane pliki i porównuje siatkę z referencją wyprowadzoną z oryginalnego obrysu oraz skali EPSG:2180 w południku centralnym. Wymaga czterech ścian zewnętrznych i czterech ścian dziedzińca, każdej złożonej z dwóch trójkątów od poziomu gruntu do zadanych 6 m. Tolerancja dopasowania wierzchołka wynosi 0,02 mm dla tego przypadku analitycznego.

Portal pokazuje oczekiwane i odczytane wartości w jednej tabeli. Udostępnia wejście oraz dokładne bajty OBJ i GLB z bieżącego pomiaru. Raport zawiera identyfikator i czas przebiegu, wersję wydania, czas wykonania, rewizję wzorca, rozmiar oraz SHA-256 każdego pobranego pliku. Widoki Bryła i Rzut obrazują wzorzec wejściowy. Kontrole regresji narzędzia pozostają częścią zbioru inżynierskiego.

Ten sam przebieg uruchamia się niezależnie od portalu, w nowym katalogu wynikowym.

```sh
uv run --frozen python -m scripts.run_electrotile_3d_case wyniki/et-3d-01
```

Runner zapisuje `input.json`, `model.obj`, `model.glb` i `report.json`. Wersję wydania odczytuje z `SOURCE_COMMIT.txt` w paczce. Przy uruchomieniu z repozytorium można przekazać `--version "$(git rev-parse HEAD)"`. Kod wyjścia 0 odpowiada zaliczonej próbie, 1 rozbieżności pomiaru.

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
| I–II–III.1 | Dla tej samej rewizji przeprowadź dobór pełnych, połówkowych i biernych elementów, wyeksportuj BOM i schemat elektryczny oraz wygeneruj ofertę. Powtórz po zmianie strony aktywnej na krawędzi dachu. | Porównaj SKU i pozycje, liczbę arkuszy i mikropaneli, wymiary nominalne i efektywne, zatwierdzone cięcie, moc, unikalne uczestnictwo elementów aktywnych w obwodach i ilości w ofercie. |
| N-01.1 | Wprowadź partię 20 adresów z planem napływu i zarejestruj otrzymanie ostatniego poprawnie obrobionego zdjęcia. Powtórz ze stanem zimnym i ciepłym zgodnie z protokołem. | Od pierwszego adresu do końca kompletu cel 300 s, granica 500 s. Sprawdź dokładnie 20 dopasowanych, niezdublowanych obrazów i raport czasów per adres. |
| N-01.2 | Powtórz obciążenie z kontrolowaną awarią dostawcy, ponowieniem i utratą procesu roboczego na wydzielonym środowisku. | Przypadek pozostaje w oryginalnej partii. Mierz od pierwotnego startu. Zapisz statusy, ponowienia i ewentualną utratę zadania lub niejednoznaczny wynik. |

## Uruchomienie laboratorium niezależnie od CI

`scripts.electrotile_lab` uruchamia dobór I-02.1, ocenę geometrii i mocy STC powiązaną z I-01.3, I-02.2 i I-03.1, a także II-01.2, II-02.1–2, III-01.1–3, I–II–III.1 oraz uzgodnione odrzucenia modułu II. Adapter dostaje na stdin plik wejściowy, a końcowe argumenty identyfikują kryterium i przypadek. Na stdout zwraca znormalizowany wynik odczytany z interfejsu, eksportu lub API. Dane odniesienia pozostają w manifeście. W środowisku klienta adapter trzeba połączyć z rzeczywistymi operacjami, odczytem stanu końcowego i śladem błędu. III-01.3 wymaga dowodu, że dwa wywołania rzeczywiście się na siebie nałożyły.

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

### Próba integracji na wzorcu eTile Classic

Próba używa wymiarów nominalnych i efektywnych oraz liczby mikropaneli pełnych i połówkowych z publicznej karty eTile Classic. Identyfikatory SKU, moc 100/50/0 Wp, wartości cięć 30/40 mm, rewizje i układ są syntetyczne. Wymiar po cięciu i zasady wykonawcze należy ocenić z rysunkiem producenta. [Karta eTile Classic](https://www.electrotile.com/pl/dachy-solarne/blachodachowka-solarna-etile-classic)

- `classic-mixed` obejmuje cztery fizyczne arkusze. Trzy są aktywne i zawierają razem 16 mikropaneli. Zewnętrznie identyczne lewe i prawe połówki mają inne SKU i różne dopuszczone krawędzie cięcia. Łączna moc testowa wynosi 200 Wp.
- `classic-passive` obejmuje jeden arkusz w BOM i ofercie, 0 mikropaneli, 0 Wp oraz pustą listę stringów.

Przy wdrożeniu u klienta mapuj identyfikatory arkuszy według rzeczywistych pozycji projektu i odpowiadających im identyfikatorów w schemacie. Odczytaj BOM i ofertę niezależnie od układu i zachowaj dokumenty źródłowe oraz ich rewizje. W tym teście porównuje się ilości pozycji pokrycia. Profile i przewody mają własne próby II-01 i II-02. Moc w dowodzie jest w całkowitych mWp, a wymiary i cięcie są w całkowitych mm. Wymiary efektywne i nominalne dotyczą elementu przed cięciem. Aktywny arkusz występuje w znormalizowanym schemacie raz, gdzie porty i optymalizatory mapują się na fizyczne arkusze. Odrębne próby elektryczne oceniają zgodność połączeń i dobór wiązek.

```sh
base=tests/fixtures/electrotile-lab/product-replay
release=$(git rev-parse HEAD 2>/dev/null || cat SOURCE_COMMIT.txt)
for mode in faulty fixed; do
  code=0
  uv run --frozen python -m scripts.electrotile_lab run "$base/manifest.json" "$base/inputs" "/tmp/et-classic-$mode" \
    --run-id "classic-$mode" --scope replay --release-sha "$release" \
    --environment-id local --adapter-id classic-replay-v1 \
    --adapter python tests/fixtures/electrotile-lab/replay_adapter.py "$mode" || code=$?
  if [ "$mode" = faulty ]; then test "$code" -eq 1 || exit 1; else test "$code" -eq 0 || exit 1; fi
done
uv run --frozen python -m scripts.electrotile_lab score "$base/manifest.json" /tmp/et-classic-fixed \
  --baseline /tmp/et-classic-faulty
```

Pierwsze uruchomienie odrzuciło oba kontrolowane przypadki i wykazało 14 rozbieżności. Obejmowały użycie wymiaru nominalnego jako krycia, zamianę lewej i prawej połówki, cięcie po stronie aktywnej, wpięcie elementu biernego, zdublowanie aktywnego udziału w stringu oraz ofertę ze starej rewizji. Retest zaliczył 2/2 i zamknął wszystkie 14 rozbieżności w próbie kontrolnej. Do oceny instalacji producenta potrzebny jest dostęp do rzeczywistych eksportów i zatwierdzonych reguł.
