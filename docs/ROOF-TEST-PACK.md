# BIPV Studio · testy modułu pokryć dachowych

Paczka do ET/2025/7 zawiera kod testowanej wersji BIPV Studio, przypadki testowe, niezależne wartości oczekiwane oraz instrukcję. `SOURCE_COMMIT.txt` wskazuje wersję źródeł. Dane są syntetyczne i mają jednostki metryczne. Uruchomienie wymaga Pythona 3.12 i uv. Pierwsza instalacja pobiera zależności z rejestru. Przebieg testów działa lokalnie, bez konta i zewnętrznych usług.

## Uruchomienie

Rozpakuj ZIP i w katalogu z `pyproject.toml` wykonaj:

```sh
uv sync --frozen --dev
uv run --frozen pytest -q --junitxml roof-test-results.xml
uv run --frozen python -m scripts.benchmark_roof_tests --output roof-benchmark.json
```

Kod wyjścia 0 oznacza zaliczenie danego polecenia. XML zawiera wynik każdego przypadku. JSON zawiera trzy pomiary każdej operacji dla każdej sceny oraz medianę, maksimum i limit. Jeżeli paczka zawiera katalog `evidence/`, są w nim wyniki przebiegu dla załączonej wersji źródeł.

## Scenariusze wykonawcze

| Obszar | Wejście / wykonanie | Kryterium zaliczenia | Test |
|---|---|---|---|
| Rozmieszczenie i moc STC | Dach dwuspadowy bez przeszkód, oba obroty | Liczba modułów odpowiada obliczeniu analitycznemu z wymiarów, rozstawu i marginesu. Moc to liczba modułów × Wp | `test_geometry.py` |
| Kolizje | Dwie połacie, komin, trzy produkty, trzy nachylenia | Cały prostokąt modułu mieści się w obszarze montażowym. Brak nakładania modułów i wejścia w strefę komina | `test_geometry.py` |
| Narożniki i otwory | Dach w kształcie L, otwór, fasada z oknem | Brak przecięć z obszarami wykluczonymi. Pole i zwrot normalnej zgadzają się z referencją | `test_planar_geometry.py`, `test_product_contracts.py` |
| Granica dopasowania | Dachówka 0,60 × 0,40 m, margines 0,25 m, trzy przesunięcia UV oraz połać o 1 µm szersza i węższa od wymaganego wymiaru | Wynik odpowiednio 1 i 0 w orientacji poziomej, niezależnie od położenia. W wyjściu 32 Wp albo 0 Wp | `test_roof_acceptance.py` |
| Regresja geometrii | Cztery dokładnie dopasowane siatki w dziesięciu położeniach UV, niedobór 1 µm, azymuty przy północy, dach i fasada z otworem i kominem | Niezależna liczba i położenie paneli, poprawna kwalifikacja granic, orientacja oraz topologia i zgodność OBJ z API. Kontrole negatywne wykrywają brak grupy, odwróconą oś i panel w otworze | `test_geometry_regression.py` |
| Ocena czterech prób przetargu | Syntetyczne przebiegi ze zmienionym czasem, liczbą lub typem PV, brakiem obrazu, zdublowanym wynikiem, niewłaściwym źródłem lub zmienionym wejściem. Jedna odpowiedź API layoutu z analityczną referencją | Granice są włączające, skróty wejść i kompletność są sprawdzane, a wynik syntetyczny zachowuje blokadę odbioru | `test_electrotile_run.py` |
| Model 3D | Dach dwuspadowy dla azymutów 73°, 180° i 287° oraz dach L z fasadą | Wierzchołki OBJ mają prawidłowe osie, kalenica łączy połacie, ściany mają poprawną orientację i pole, a trójkąty respektują otwory | `test_roof_acceptance.py`, `test_planar_geometry.py` |
| Granice API | Uszkodzony obrys, nieznana połać, zbyt duża scena i żądanie; próba na granicy 250 m² | Prawidłowe dane przechodzą. Nieprawidłowe wejścia są odrzucane zgodnie z kontraktem. Limit geometrii zależy od zaznaczonych połaci | `test_api.py`, `test_geometry.py`, `test_roof_acceptance.py` |
| Zgodność danych | JSON Schema, Scene v1/v2, szablony katalogu, zadania i materiały wejściowe | Wygenerowane schematy są zgodne z kodem, a migracja sceny zachowuje geometrię i hash. Reguły opisujące dane bez źródła egzekwuje walidator | `test_product_contracts.py` |
| Wydajność regresji | Dwie połacie oraz 6 powierzchni o łącznym polu 240 m²; żądania obliczenia układu i eksportu OBJ | Liczby modułów są równe wartościom referencyjnym. Każda próba mieści się w technicznym budżecie 5 s dla układu i 10 s dla OBJ | `scripts/benchmark_roof_tests.py` |

Eksport jest sprawdzany w Wavefront OBJ. Wyrocznia dla przesuniętej połaci i pola dachu używa wymiarów z definicji sceny. Obrys dachu L i niezależne prostokąty wykluczeń są opisane w kodzie testów i publicznych danych paczki. Test kont z atrapą odpowiedzi dostawcy sprawdza zapis sesji oraz przejęcie projektu bez łączenia z Supabase.

Pomiar używa żądań wykonywanych w procesie testowym i obejmuje walidację, obliczenia, middleware oraz zwrot treści. Osobne wejścia wymuszają brak wpisu w cache wyniku. Próby ciepłe ponawiają identyczne wejście. Limity 5 i 10 s są budżetami regresji dla tego środowiska. Kryteria odbioru mierzy się na ścieżkach opisanych w [protokole ET/2025/7](PROTOKOL-ET-2025-7.md).
