# Registry9 Engineering | Informacja techniczna do oferty ET/2025/7

**Wersja materiału:** 23 listopada 2026 · **Charakter:** załącznik informacyjny / dowód zdolności technicznej, nie formularz cenowy i nie protokół odbioru systemu Electrotile.

## 01. Streszczenie dla zamawiającego

Registry9 Engineering przedstawia działający demonstrator BIPV Studio oraz wykonywalny pakiet testów oprogramowania dachowego i fotowoltaicznego. Celem nie jest zaproponowanie zastępczego produktu, lecz **udokumentowanie zdolności do testowania funkcjonalnego i niefunkcjonalnego, diagnozowania problemów, wprowadzania napraw oraz niezależnej weryfikacji wyników**.

Próbka jest uruchamiana lokalnie i pokazuje: właściwy obrys budynku, integralność geometrii i modeli OBJ/GLB, rozmieszczenie oraz moc PV, reguły cięcia i bilans materiałowy, połączenia i długości wiązek. Wszystkie wyniki przykładowe pochodzą z własnych danych i kodu Registry9; kryteria odbioru Electrotile pozostają odrębne.

**Pierwszy krok oceniającego:** https://bipv-studio-production.up.railway.app/testy

## 02. Materiał do samodzielnej oceny

| Dowód | Co otrzymuje oceniający | Jak go sprawdzić |
| --- | --- | --- |
| Lokalny ZIP | Kod testowanego modułu, zamrożone wejścia i wzorce, runner, instrukcja, wyniki | Rozpakować, wykonać wskazane komendy Python 3.12 + uv; nie wymaga konta |
| Laboratorium /testy | Faktyczne wykonanie prób geometrii, PV, produktów i eksportów | Uruchomić test, porównać wynik z referencją, pobrać artefakty |
| Studio / | Interaktywny projekt, geometra dachu/fasady i warianty BIPV | Zmienić wymiary, przeszkodę lub orientację, sprawdzić liczbę, moc, eksport |
| Kalkulator /produkcja | Weryfikowalny przykład BOM i prowadzenia przewodu | Zmienić zapas kabla, porównać wynik i raport |
| Dokumentacja techniczna | Mapowanie wymagań, metodologia, ograniczenia i 14-dniowy przebieg | Odczytać niniejszy opis oraz protokół w ZIP |

**Adresy URL:** https://bipv-studio-production.up.railway.app · https://bipv-studio-production.up.railway.app/produkcja

## 03. Zakres testów — co zostało pokazane

**A. Geometria i eksport.** Wydobywanie modeli z metrycznej sceny, otwory i fasady, ściany budynków, skala i osie. Kontrola czyta rzeczywiste pliki OBJ i GLB; niezależny wzorzec analityczny sprawdza m.in. ściany dziedzińca i pełne trójkąty, bez uznawania samego otwarcia pliku za poprawność geometrii.

**B. Projektowanie PV.** Na zwalidowanej geometrii próbki sprawdzana jest liczba i położenie modułów, odsunięcia, przecięcia z przeszkodami, moc STC oraz zgodność widoku i eksportu. Kontrolne SKU nie stanowią zatwierdzonego katalogu producenta.

**C. Materiały i wiązki.** Zgodność typu arkusza, pełnych i połówkowych elementów, bilans profili z rzazem, porty i złącza, ciągłość grafu i długość przewodu; rozróżnienie błędu trasy od zgodności samej sumy metrów.

**D. Metoda QA.** Przypadek z frozen input i SHA-256, wersjonowana referencja, wykonanie, niezależna ocena, raport oraz retest na niezmienionym wejściu. Kontrole wykrywające celowo uszkodzone kopie danych pozostają osobną warstwą regresji inżynierskiej, **nie są prezentowane jako błędy działającego produktu**.

## 04. Dowody wykonania i odtwarzalność

| Rodzaj próby | Wynik | Właściwa interpretacja |
| --- | --- | --- |
| Clean-room lokalny ZIP | **217/217 testów Python**, bez błędów i pominięć | Testy własnej próbki, dostępne w JUnit w paczce |
| Lokalny benchmark | **2 sceny analityczne, PASS** | Czasy na określonym runnerze CI; nie są pomiarem systemu Electrotile |
| Pełny projekt / wydanie | CI #45168329114: zielone testy źródeł, przeglądarki i limitowanego kontenera | Kontrola jakości demonstratora |
| Weryfikacja live | CI #45169946732: weryfikacja opublikowanego commita i przepływów przeglądarkowych | Dowód działania publicznego Studio w chwili testu |

**Identyfikacja próbki:** SOURCE_COMMIT.txt = `28b30e6d2eee8ffc2eabaf7f5f4db0ae4f885211`; drzewo plików Git = `f0d5a80dc266b487b417d40a7433c0170bcb478c`. Opublikowany commit produktu: `7a1b88034d1e6750b5b9945feca3364f136d0ce6`, mający to samo drzewo kodu przy ostatnim przebiegu CI. Dane szczegółowe: `evidence/roof-test-results.xml` i `evidence/roof-benchmark.json` wewnątrz ZIP. Prywatne linki GitHub służą audytowi po przyznaniu dostępu, nie jako jedyna kopia dowodów.

## 05. Macierz do trzech modułów zamówienia

| Moduł Electrotile / §E | Demonstracja kompetencji Registry9 | Weryfikacja po uzyskaniu dostępu |
| --- | --- | --- |
| I — obraz, adres, bryła 3D, PV, moc i uzysk | Geokodowanie, EGiB, edytor geometrii, niezależny eksport i kontrola ułożenia PV/STC | 10 adresów **tylko ze zdjęć satelitarnych** (cel 300 s, maks. 900 s); typ i ilość PV względem ~100 wycen (cel 60 s, maks. 120 s, odchylenie ≤20%); roczny uzysk na referencji |
| II — mikropanele, profile, schematy i wiązki | Kontrolny katalog, arkusze aktywne/bierne, cięcie z rzazem i graf połączeń | Zatwierdzone SKU, technologia, plan obróbki, elektryka i listy materiałowe producenta |
| III — konfigurator, oferta, zamówienie, audyt | Wersjonowanie sceny, przykłady kontroli powiązania danych i zasada niezależnej wyceny | Media, cennik, dokumenty, rezerwacje, konflikty równoczesnych zapisów; pełny czas procesu **≤6 h** |
| Wydajność między modułami | Automatyczne benchmarki regresji i obserwowalność wejścia/wyjścia | Partia 20 adresów i poprawnie przetworzonych zdjęć (cel 300 s, maks. 500 s) |

**Zastrzeżenie metodyczne:** żaden z czterech ilościowych progów przywołanych powyżej nie został zaliczony na rzeczywistych modułach Electrotile. Publiczne Studio nie daje podstaw do twierdzenia, że zrekonstruowano prawdziwą połać tylko ze zdjęcia satelitarnego. Potrzebne są środowisko klienta, dane wejściowe, zatwierdzone wzorce, wersje katalogów oraz dostęp do poprawek.

## 06. Proponowana organizacja 14 dni od podpisania umowy

| Etap | Prace i przekazanie |
| --- | --- |
| Dni 1–2 | Dostęp i wersje modułów; inwentaryzacja API, danych, katalogu i kryteriów; zamrożenie manifestów, protokół startowy |
| Dni 3–6 | Wykonanie scenariuszy funkcjonalnych i granicznych; dokumentacja błędów i reprodukcja na właściwym środowisku |
| Dni 7–10 | Naprawy w uzgodnionym zakresie uprawnień, retesty bez zmiany wzorców; testy 10/20 adresów i referencyjnych wycen, jeśli dane są dostępne |
| Dni 11–14 | Regresja end-to-end, testy niezmienniczości, raport końcowy, surowe artefakty, lista otwartych problemów i przegląd odbiorowy |

**Warunki rozpoczęcia:** dostęp do instalowalnych modułów I/II/III, kodu i środowiska testowego, zgoda na poprawki, reprezentatywne zdjęcia, katalogi, historia wycen, dokumentacja technologii i kontakt merytoryczny po stronie zamawiającego. Niedostępność elementów nie może być interpretowana jako PASS; w raporcie stosuje się BLOCKED/NOT RUN zgodnie z ustalonym protokołem.

## 07. Architektura i integralność dowodów

- Frontend: React/TypeScript, przestrzenny widok Three.js, mapy MapLibre.
- Backend: Python/FastAPI + Shapely, metryczna geometria ENU/UV, kontrakty JSON, zapis rewizji w Supabase/PostgreSQL.
- Eksporty: OBJ/GLB oraz JSON/CSV zależnie od obszaru; niezależny odczyt surowych formatów i kontrola SHA-256.
- Wydanie: pojedynczy kontener Railway, stały SHA; dodatkowe testy przy ograniczeniach 250 MB RAM i 0,1 vCPU.
- Wiarygodność danych: rozróżnienie fikcyjnej sceny, obrysu EGiB i geometrii pomierzonej. Dane EGiB nie stanowią zatwierdzonej geometrii połaci ani oceny dopuszczalności montażu.

## 08. Oświadczenie o przeznaczeniu

Niniejszy opis i publiczny demonstrator są **dodatkowym materiałem potwierdzającym zdolność i metodę wykonawczą**. Formalną ofertę składa się na formularzu zamawiającego, wraz z wymaganymi oświadczeniami i paczką ZIP. Materiał nie zawiera ceny ani nie modyfikuje postanowień zapytania ET/2025/7.

**Kontakt i informacje o oferencie:** dane prawne i osoba upoważniona są podawane w podpisanym formularzu oferty; nie wynikają automatycznie z marki „Registry9 Engineering”.
