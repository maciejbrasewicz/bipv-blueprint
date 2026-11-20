# Foundry — wykonanie planu produktowego

[Roadmapa produktu](../docs/PRODUCT-ROADMAP.md) · [Zadania i kryteria](PRODUCT-BACKLOG.tsv) · [Reguły repozytorium](../AGENTS.md).

## Start i przydział

Koordynator czyta backlog TSV i aktualny `main`. Zbiera SHA, identyfikator wymagania, dostęp do narzędzi i zależności. Ustawia stan zadania na READY, gdy wszyscy poprzednicy dostarczyli wymagane artefakty. Zależność może dostarczyć działający kontrakt z fixture i oznaczoną blokadą danych. Zależne wdrożenie pilotażowe musi wtedy odziedziczyć blokadę. Pierwszy dispatch to P01, P02 i P03 na wspólnej bazie, w oddzielnych katalogach roboczych. P01 zapisuje wersjonowane JSON, P02 przygotowuje fixtures w niezależnym katalogu, a P03 pracuje na adapterze obecnego Scene v1 w `web/`. Integrację P01 i P03 prowadzi P07.

| Rola | Odpowiedzialność | Niezależne sprawdzenie |
|---|---|---|
| Koordynator i integrator | Graf, SHA wejścia, przydział ścieżek, kolejność PR i dziennik decyzji | Użytkownik zatwierdza zmianę budżetu, uprawnień i zakresu danych |
| Data/API i Platform | Auth, SQL/RLS, typy, kolejka, CI, migracje i profil kosztu | QA uruchamia izolację i regresję po migracji na danych testowych |
| GIS/CV i Geometry | Adapter źródła, georeferencja, scena, inferencja, layout i eksport | QA przelicza skalę i pełne obrysy inną metodą, porównuje błędy i czas |
| Domain data, Materials, Electrical i Energy | Katalog, wzory, przedmiar, graf obwodów i energia | Projektant potwierdza instrukcje, przykłady i reguły techniczne |
| Studio UX, Offers i Audits | Interakcje, oferta, portal, stan zgłoszenia i rezerwacja | Instalator przechodzi podstawowe historie, QA weryfikuje współbieżność |
| AI/Pipeline | Kontrakty narzędzi, adapter modelu i ewaluacja kosztów | QA testuje rozbieżności liczb, nieaktualne wejścia i limity |
| Release QA | Sprawdzenie dokładnego SHA, benchmark, blokady wydania | Sprawdzenie w innym środowisku od implementacji; właściciel wydania weryfikuje raport |

Do czterech równoległych gałęzi modyfikujących repo. Integrator wyznacza obszar edycji w briefie i unika równoległych zmian kontraktu, lockfile, migracji i głównego workflow. Agent z GitHubem i runnerem dostaje prawo do swojej gałęzi oraz odczyt CI. Agent bez terminala dostarcza kontrakt, analizę lub diff do wykonania przez runner. Plan używa zwykłych briefów, JSON i GitHuba, dzięki czemu działa z Foundry różnych dostawców. ID platformy/modelu, koszty i ograniczenia wpisujemy po sprawdzeniu konkretnego projektu i dostępnych narzędzi. Akcje produkcyjne przechodzą przez jedną ścieżkę promocji z wymaganymi sprawdzeniami. Do konwersacji agentów trafiają wyłącznie dane dopuszczone do takiego użycia.

## Brief do wklejenia dla P01–P03

Uruchom osobną sesję dla każdego ID. W miejscu `BASE_SHA` wstaw bieżący SHA `main`.

```text
Repo: maciejbrasewicz/bipv-blueprint
Zadanie: P01 | P02 | P03 (wybierz przy przydziale jedno ID)
Baza: BASE_SHA
Cel: produkt BIPV dla instalatora. Odczytaj AGENTS.md, docs/PRODUCT-ROADMAP.md,
     własny wiersz w foundry/PRODUCT-BACKLOG.tsv i docs/HANDOFF.md.
Tryb: zaimplementuj zadanie w osobnej gałęzi product/<id>-<temat>.
Zakres P01: contracts/ oraz propozycja migracji w supabase/migrations/.
Zakres P02: zestaw danych testowych i manifest w tests/fixtures/product/.
Zakres P03: web/ oraz kontrakt widoku znajdujący się w docs/PRODUCT-UX.md.
Kryteria: sprawdź własny wiersz TSV. Zachowaj istniejący import i użytkownika gościa.
Wynik: PR z wymaganiami, komendami i wynikami. Utrwal base_sha, head_sha,
       błędy, blokady danych i wpływ na testy na podstawie rzeczywistego przebiegu.
Granice: fixture lub dozwolone źródła. Zero płatnych zasobów, promocji Railway,
         uruchamiania produkcyjnych migracji i materiałów klienta w tym zadaniu.
```

Kolejny pakiet używa tego samego formatu z zakresem zmian i kryterium odpowiadającym jego wierszowi. PR po zmianie kontraktu wymienia klientów wejścia, stare payloady, ścieżkę migracji i regresję. Jeżeli potrzebna jest uznana licencja, karta produktu, dane klienta lub zgoda specjalisty, agent opisuje brak i kontynuuje pracę na ustalonej próbce, gdzie ma to sens.

## Wynik pracy i promocja

| Rekord | Pola |
|---|---|
| Dispatch | `task_id`, `base_sha`, `owner`, `write_paths`, `depends_on`, `requirements`, `data_scope`, `tool_allowlist`, `limits`, oczekiwana lista artefaktów |
| Handoff PR | `head_sha`, `changed_paths`, polecenia i obserwowane wyniki, link do runu, pomiar czasu/kosztu, status ryzyka i lista ograniczeń |
| Bramka QA | `reviewed_sha`, `run_id`, `dataset_version`, `input_hash`, status PASS/FAIL/BLOCKED, `evidence_url`, otwarte błędy, weryfikujący |
| Promocja | `approved_sha`, SHA manifestu, wersja schematu, plan przywrócenia, wdrożenie, stan końcowy i odczyt żywego health |

Pomyślny przegląd dotyczy konkretnego SHA. Nowy commit wymagający sprawdzeń wraca do CI. QA odtwarza test i może dać oddzielny test wyroczni bez polegania na funkcji implementującego. Artefakty z fixture i metrykami zapisujemy w Actions z SHA-256, przy krótkiej retencji. Wydane wyniki biznesowe wracają do prywatnego Storage i rekordu rewizji. Ponowienie po błędzie wykonuje się w granicach zadania. Po dwóch nieskutecznych naprawach integrator rozcina problem na reprodukcję i właściwą poprawkę. Codzienny przegląd ogranicza się do blokerów, kolejności merge, wydatku i próby użytkownika. Przed dopuszczeniem pilota sprawdzamy wyniki QA na izolowanym środowisku i odczytujemy wdrożony SHA.

## Przydział 40, 60 i 100 wywołań

- **40**. P01–P40. 32 zadania budowy, 8 kontroli, sześć tygodni kalendarzowych planu. Główna ścieżka to organizacja → adres → projekt → BOM i uzysk → oferta → pomiar.
- **60**. P41–P60. 20 dodatkowych wywołań na jakość ML, alternatywne źródła, parametryzację elektryki, niezawodność i rozszerzone wdrożenie. Część prac wchodzi równolegle w tygodniu 5. P60 zależy od wydania bazowego.
- **100**. 60 zadań oraz rezerwa 40 wywołań. Do 12 na dane i porównanie katalogów, 12 na błędy z pilotażu, 8 na niezależne powtórzenie benchmarków, 8 na ergonomię i optymalizację kosztu. Każde wywołanie rezerwy zaczyna od ID bazowego, konkretnej porażki lub pomiaru i oczekiwanej zmiany. Rozszerzenia do nowych systemów wynikają z tych danych.

Licznik dotyczy zaplanowanych pakietów i kontroli w Foundry. Pakiet może wymagać dodatkowych zadań, gdy agent odkryje błąd blokujący; wtedy koordynator używa rezerwy lub ogranicza zakres danej fali. Osobno liczymy koszt agentów wdrażających i koszt działania produktu na projekcie.
