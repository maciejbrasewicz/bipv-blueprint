# Electrotile ET/2025/7 — zakres i plan wdrożenia

Źródła: [ogłoszenie 297365 w Bazie Konkurencyjności](https://bazakonkurencyjnosci.funduszeeuropejskie.gov.pl/ogloszenia/297365), Zapytanie ET/2025/7 z 6 listopada 2026, s. 1–4, oraz załącznik 2, sekcje A–E, s. 1–13. Poniższe progi i termin odzwierciedlają wersje dokumentów dostarczone do projektu.

Zapytanie dotyczy testów funkcjonalnych i niefunkcjonalnych trzech modułów oraz poprawiania błędów. Harmonogram to 14 dni od podpisania umowy. Dokument wskazuje 7 grudnia 2026 jako termin składania ofert, ocenę według ceny netto i lokalną paczkę ZIP z instrukcją jako próbkę potwierdzającą zdolność do wykonania prac. BIPV Studio jest własnym demonstratorem i źródłem próbki testowej. Testy systemu zamawiającego wymagają dostępu do jego modułów i danych.

| Obszar z załącznika 2 | Dostępne w Studio | Następny dowód odbioru |
|---|---|---|
| I · pozyskanie imagery i geolokalizacja | Import jawnych powierzchni w lokalnym ENU i eksport OBJ | Adres/GPS, licencjonowany dostawca zdjęć, ślad źródła oraz 10 wylosowanych adresów. Model tylko ze zdjęcia satelitarnego. Cel 300 s, limit 900 s od startu interfejsu |
| I · obrys, połacie, fasady, przeszkody | Dwuspadowy edytor, import wielokątów i otworów, ręczne kominy/okna | Narzędzie do korekty obrysu na obrazie i kalibracja metryczna. Dane wysokości, skali i niepewności zapisane z rekonstrukcją. Osobny test zdjęcia fasady |
| I · rozmieszczenie i dobór PV | Dwie orientacje siatki, pełna kontrola obrysu i odsunięć, moc STC z katalogu demonstracyjnego | Katalog Electrotile i przypadki referencyjne. Cel 60 s, limit 120 s, odchylenie do 20% od eksperta. Załącznik wskazuje ok. 100 historycznych wycen i modeli, a sposób oceny rodzaju produktu i agregacji błędów trzeba uzgodnić przed testem |
| I · uzysk roczny | Podgląd słońca i cienia w 3D | Roczne kWh względem lokalizacji, osi świata, nachylenia i cienia. Porównanie do niezależnego wyniku referencyjnego, osobny wariant pracy optymalizatorów |
| II · mikropanele, profile, wiązki | Eksport liczby i powierzchni modułów w CSV | Katalog schematów mikropaneli, reguły cięcia i obróbki, ułożenie elektryczne oraz długości wiązek. Zgodność z referencyjną listą materiałów/cięć i schematem |
| III · konfigurator klienta | Warianty, zapis projektu i historia | Dodawanie, edycja i usuwanie zdjęć/rzutów. Szczegółowa wycena z reguł i wersji katalogu, zamówienie oraz rezerwacja audytu. Cel całościowy dla oferty z wizualizacją i kalkulacją opłacalności do 6 h |
| Kolejka i wydajność | Pojedynczy kontener i ograniczone wywołania layoutu | Zlecenie 20 adresów oraz czas do przygotowania wstępnie obrobionych zdjęć. Cel 300 s, limit 500 s od pierwszego adresu. Rejestrować zarówno zimny start, jak i odpowiedzi dostawcy |

## Kolejność kolejnych integracji

1. **Dane i kalibracja.** Doprowadzić ścieżkę adres → obraz → edytowalny obrys → zwalidowana scena ENU → OBJ. Zachować licencję, pochodzenie, metodę i niepewność geometrii. Przypadki testowe mogą użyć jawnych fixture w oczekiwaniu na dane dostawcy.
2. **Katalog i materiały.** Wersjonowany import SKU z dokumentacji producenta, osobno wymiary pokrycia, szczeliny i dozwolony obrót. Następnie reguły profili i wiązek ze sprawdzalnym wejściem i wyjściem. Zestawienia powinny wskazywać użyty wariant sceny i wersję katalogu.
3. **Energia i elektryka.** Model uzysku ze zdefiniowanym źródłem danych pogodowych oraz osobnym modelem zacienienia. Zestaw obliczeń elektrycznych wymaga kart katalogowych i niezależnych przypadków weryfikacyjnych.
4. **Klient i oferta.** Dostęp imienny, kontrola mediów, odtwarzalne kalkulacje, dokument oferty i rezerwacja. Uwierzytelnianie kont i przejęcie projektu gościnnego można realizować równolegle z pracą na syntetycznych scenach.
5. **Odbiór.** Przenieść testy referencyjne i pomiary czasu na udostępnione moduły Electrotile. Raportować wynik, wejście, wersję aplikacji i sprzęt oraz jawnie rozróżniać błędy danych, geometrii i wydajności.

[Paczka testowa: instrukcja i scenariusze](ROOF-TEST-PACK.md) · [Kontrakt powierzchni i wdrożenie](HANDOFF.md).
