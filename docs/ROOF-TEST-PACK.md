# BIPV Studio — przykładowe testy modułu dachowego

Paczka zawiera kod i automatyczne testy demonstratora BIPV Studio. Plik SOURCE_COMMIT.txt identyfikuje źródło. Testy działają lokalnie na danych syntetycznych. Nie potrzebują Railway, Supabase, klucza dostawcy map ani konta.

1. Rozpakuj ZIP do katalogu z prawem zapisu.
2. Zainstaluj Python 3.12+ i uv. Pierwsza instalacja zależności wymaga dostępu do rejestru pakietów.
3. W katalogu z pyproject.toml uruchom:

   ```sh
   uv sync --frozen --dev
   uv run --frozen pytest -q
   ```

| Scenariusz | Dane | Oczekiwany wynik |
|---|---|---|
| Dach dwuspadowy | Prostokąt o znanej szerokości, głębokości i nachyleniu | Liczba modułów zgadza się ze wzorem dla obu orientacji |
| Przeszkody | Trzy produkty, trzy kąty, obie połacie i komin | Cały prostokąt modułu mieści się w dopuszczalnym obszarze. Moduły nie nachodzą na siebie |
| Dach L i fasada | Dwie powierzchnie ENU ze zdefiniowanymi otworami | Układ wypełnia obie powierzchnie, zachowuje odstęp od otworów oraz mierzy obszar po ich odjęciu |
| Uszkodzona geometria | Osie równoległe, przecinający się obrys, otwór na krawędzi, nieznane ID | Walidacja odrzuca dane przed obliczeniem |
| Eksport 3D | Dach L i fasada oraz wybrana orientacja modułów | OBJ zawiera powierzchnie po właściwej transformacji osi, odtwarza obrys z otworem i ma tyle grup modułów, ile policzył silnik |
| API | Prawidłowa scena, błędne dane, przekroczony limit wejścia | Statusy odpowiedzi są zgodne z kontraktem, a domyślne pola sceny uzupełniają się przy walidacji |

Paczka pokazuje działające przykładowe testy pokryć. Progi dla zdjęć satelitarnych, porównanie z wycenami ekspertów, profilowanie wiązek i przebieg audytu wymagają odpowiednich modułów oraz danych referencyjnych. Macierz projektu wskazuje te braki.
