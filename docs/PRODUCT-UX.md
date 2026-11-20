# Studio BIPV — interfejs produktu

[Roadmapa](PRODUCT-ROADMAP.md). Zaczynamy od jednego środowiska pracy projektanta z osobnym, lekkim portalem klienta. Wszystkie widoki projektu mają wspólne zaznaczenie i ID obiektów.

## Przepływy

| Widok | Główna akcja | Następny stan |
|---|---|---|
| Projekty | Wznowienie ostatniej pracy lub utworzenie z adresu | Status projektu, otwarte blokady, data i właściciel bez otwierania modelu |
| Mapa i źródła | Potwierdzenie budynku i danych do pomiaru | Warstwy zdjęcia z datą, źródłem i skalą; brak źródła prowadzi do wczytania dozwolonego rzutu lub zdjęcia |
| Warsztat 2D/3D | Zmiana obrysu lub kalibracji | Podświetlenie zmienionej połaci, zapis odwracalnej komendy, oznaczenie dotkniętych wyników; historia i ręczne przeliczenie |
| Projekt i warianty | Przeliczenie i porównanie dwóch wariantów | Moc, kWh/rok, aktywne i bierne moduły, odpad i cena. Blokada prowadzi do konkretnego elementu, reguły lub brakującego pomiaru |
| Oferta | Przegląd wersji, dokumentów i zatwierdzenie | Snapshot oferty, PDF, link i opcje zamówienia albo audytu |
| Portal klienta | Podgląd, wybór produktu i terminu | Potwierdzenie żądania z numerem wersji, informacja o ważności, błędy konfliktu terminu i następny dostępny slot |
| Rewizja po audycie | Dodanie pomiaru i porównanie z poprzednim stanem | Lista zmian geometrii, modułów i wyceny z linkami do źródła |

## System wizualny

Studio desktop wykorzystuje jasne, neutralne panele o wysokim kontraście i ciemniejsze neutralne płótno 3D. Widok przestrzenny pokazuje geometrię techniczną z cienką siatką i skalą, panel klienta używa tego samego modelu w dopracowanym oświetleniu. Mapa, 2D i 3D mają tę samą selekcję, kolory SKU i stabilne jednostki. Ikona, tekst i kolor rozróżniają element aktywny, bierny, blokadę, estymację i pomiar. Inter dla UI, IBM Plex Mono dla wymiarów, ID i wyników obliczeń. Komponenty współdzielą tokeny typografii, odstępów i stanów. Legendę stosujemy, gdy dodaje informację o włączonej warstwie. Dane katalogowe pochodzą z aktywnej wersji systemu.

Kontrolki zachowują focus i mają opis klawiatury. Użytkownik może zmienić obrys i przeszkodę numerycznie w inspektorze. Ruch wskaźnika podgląda zmianę, akcja zatwierdzona trafia do historii. Przy dużym modelu podgląd renderuje się przy żądaniu, a warstwy wynikowe przełączają się niezależnie. Portal klienta utrzymuje czytelność oferty przy szerokości 390 px i w trybie bez WebGL. Docelowe zrzuty porównawcze sprawdzamy także na laptopie 1440 × 900. Przekroje, mapy cienia i wykresy energii pokazują jednostki, zakres i status danych wejściowych.

## Pierwsza próba P03 i odbiór P30

Pierwszy PR otwiera już istniejącą scenę z istniejącymi API. Na dachu z lukarną lub otworem projektant wybiera przeszkodę w planie, widzi ją w modelu, zmienia parametr, cofa zmianę i przechodzi do porównania. PR zapisuje zrzut każdego kluczowego stanu i zmierzony czas reakcji na laptopie referencyjnym. Docelowo P30 w ramach ścieżki E2E dochodzi do oferty, zmiany terminu potrzebnej po konflikcie i porównania rewizji. Sprawdzamy także zablokowany eksport, brak pokrycia, zdjęcie weryfikowane, oczekujący job, ograniczony koszt oraz cofnięty link. Ekrany operacyjne czytają realny stan domenowy z API.
