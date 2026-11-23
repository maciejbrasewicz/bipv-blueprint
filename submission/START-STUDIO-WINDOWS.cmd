@echo off
chcp 65001 >NUL
setlocal
cd /d "%~dp0"
echo ============================================================
echo REGISTRY9 ENGINEERING - BIPV STUDIO / ELECTROTILE TEST LAB
echo ============================================================
where uv >NUL 2>NUL
if errorlevel 1 (
  echo.
  echo BRAK NARZEDZIA UV.
  echo Zainstaluj bezplatne uv: winget install --id astral-sh.uv -e
  echo Instrukcja: https://docs.astral.sh/uv/getting-started/installation/
  echo Nastepnie uruchom ponownie ten plik.
  pause
  exit /b 1
)
echo Przygotowanie srodowiska Python 3.12 z pliku uv.lock...
uv sync --python 3.12 --frozen --dev
if errorlevel 1 goto error
echo.
echo Otwieranie Laboratorium w przegladarce...
uv run --python 3.12 --frozen python scripts\run_local_studio.py
if errorlevel 1 goto error
exit /b 0
:error
echo.
echo URUCHOMIENIE NIE POWIODLO SIE - skopiuj komunikat bledu.
pause
exit /b 1
