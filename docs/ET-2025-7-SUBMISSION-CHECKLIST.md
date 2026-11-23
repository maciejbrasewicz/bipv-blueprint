# ET/2025/7 · Lista kontrolna przed złożeniem oferty

**Zamawiający:** Electrotile Sp. z o.o. · **Postępowanie:** ET/2025/7 / BK 297365 · **Termin w przekazanym zapytaniu:** 07.12.2026 (godzinę, zmiany i odpowiedzi sprawdzić na bieżąco w BK2021). **Jedno kryterium oceny:** 100% ceny netto. **Realizacja:** 14 dni od podpisania umowy.

**Nie wysyłać oferty dopóki nie są zamknięte wszystkie pozycje obowiązkowe.** Dodatkowy materiał techniczny jest wsparciem, nie substytutem dokumentów z zapytania.

## A. Cztery obowiązkowe załączniki

- [ ] **Załącznik nr 3 – formularz oferty**, wypełniony dokładnie na wzorze zamawiającego. Musi zawierać pełne dane oferenta, datę, ważność 30 dni, zakres, pełną cenę netto i brutto, poprawny VAT, warunki i termin płatności, 14 dni realizacji, dane kontaktowe oraz podpis osoby upoważnionej.
- [ ] **Załącznik nr 1 – oświadczenie o braku powiązań**, podpisane po faktycznej weryfikacji okoliczności po stronie oferenta.
- [ ] **Załącznik nr 4 – oświadczenie o wiedzy i doświadczeniu**, podpisane przez reprezentanta oferenta.
- [ ] **Przykładowe testy jako załączony ZIP**, uruchamiany lokalnie z instrukcją. Nie zastępować go samym linkiem GitHub lub demo. Nazwa rekomendowana: `Registry9_Electrotile_ET-2025-7_Przykladowe_testy_dachowe.zip`.

**Ważne:** Electrotile wymaga dokumentów zgodnych z oryginalnymi wzorami. Nie modyfikuj oświadczeń ani treści wiążącej oferty przez dodawanie jednostronnych ograniczeń zakresu. Jeśli występuje niepewność co do dostępu do kodu lub odpowiedzialności za naprawy, zgłoś pytanie przez BK2021 zgodnie z zasadami postępowania.

## B. Zalecany materiał dodatkowy

- [ ] `Registry9_ET-2025-7_Informacja_techniczna.pdf` – do 5 stron: cel, zakres, dowody, 14-dniowy przebieg, granice; **bez ceny**.
- [ ] `Registry9_ET-2025-7_DEMO.pdf` albo jedna strona instrukcji pokazu (opcjonalnie; może być częścią notatki).
- [ ] W formularzu lub w opisie załącznika: adres laboratorium `https://bipv-studio-production.up.railway.app/testy` i dwie drogi pomocnicze `/` i `/produkcja`.
- [ ] Repozytorium **prywatne** – albo indywidualnie udzielić dostępu oceniającym, albo nie polegać na repo jako sposobie dostarczenia dowodów. Nie publikować całego kodu bez świadomej decyzji o licencji, danych i własności.

## C. Kontrola integralności technicznej

- [ ] ZIP rozpakowuje się bez błędów CRC. `SHA256SUMS.txt` pokrywa pliki, oprócz indeksu sum.
- [ ] `00_START_TUTAJ.md` oraz `README.md` otwierają się po polsku i wyjaśniają Python 3.12 / uv / pierwszą instalację zależności.
- [ ] Niezależnie wykonać `uv sync --frozen --dev`, `uv run --frozen pytest -q`, benchmark oraz przypadki ET-3D-01 i ET-PROD-01 na świeżym katalogu.
- [ ] Potwierdzić 217 testów z raportu JUnit dla **próbki**, nie mieszać z liczbami testów całego repo.
- [ ] W notatce PDF podać **właściwe źródło wyników**: CI #45168329114, live #45169946732; prywatne linki GitHub nie są jedynym dowodem.
- [ ] Sprawdzić wszystkie trzy publiczne ścieżki HTTP, mobilną czytelność, pliki pobierane z /testy, kalkulator i eksporty.
- [ ] Zrobić ostateczny przegląd dat, nazw podmiotu, literówek i spójności wersji. Nie twierdzić, że Studio automatycznie rekonstruuje poprawne połacie wyłącznie ze zdjęć satelitarnych.
- [ ] Upewnić się, że dane klienta, tokeny, tajne klucze i informacje o strategii cenowej nie są w publicznych artefaktach.

## D. Cena i ryzyko wykonawcze

- [ ] Wybrać cenę **całkowitą netto**, uwzględniając 14 dni, trzy moduły i prace naprawcze.
- [ ] Ustalić prawidłowy sposób wyliczenia brutto (VAT, status podatkowy i podmiot składający ofertę).
- [ ] Uzyskać lub przynajmniej zgłosić pytanie o dostarczenie gotowego, instalowalnego środowiska, katalogu i danych, zakres poprawek w kodzie innych dostawców oraz zasady odbioru przy zależnościach od wykonawców zewnętrznych.
- [ ] Sprawdzić warunki płatności i ewentualne wymagania podpisu/składania dokumentów w BK2021.
- [ ] Zweryfikować reprezentację firmy: Registry9 Engineering jest marką; pełna nazwa prawna i identyfikatory muszą zgadzać się z dokumentami.

## E. Przed wysłaniem / po wysłaniu

- [ ] Sprawdzić najnowszą treść ogłoszenia, pytania i odpowiedzi w BK2021, ogłoszenie nr 297365; strony agregatorów nie wystarczają.
- [ ] Przejrzeć każdy plik w końcowym zestawie, nazwy, liczbę załączników, podpisy, łączną cenę.
- [ ] Wysłać przez **moduł Oferty** przed końcem terminu, nie przez wiadomość e-mail. Zachować potwierdzenie wysłania, datę, godzinę i dokładny zestaw plików.
- [ ] Zarchiwizować złożoną wersję dokumentów i jej sumy SHA-256. Nie podmieniać zawartości po wysłaniu bez procedury dopuszczonej w postępowaniu.

## F. Co NIE jest potrzebne przed ofertą

Nie trzeba implementować satelitarnej rekonstrukcji produkcyjnej, kompletnej bazy producenta, wydajności kolejki 20 zdjęć ani wyceny i rezerwacji w systemie Electrotile **we własnym demonstratorze**. Oferta dotyczy usługi testowania/napraw ich systemu. Natomiast należy przedstawić rzetelny plan, jak te funkcje zostaną objęte odbiorem po zapewnieniu dostępu.

**Paczka ZIP i załączniki 1/3/4 są wymagane; PDF techniczny i demo są dodatkami wspierającymi wiarygodność, nie osobnym kryterium punktowym.**
