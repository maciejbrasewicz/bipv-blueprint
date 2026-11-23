@echo off
chcp 65001 >NUL
setlocal
cd /d "%~dp0"
echo ============================================================
echo REGISTRY9 ELECTROTILE - TESTY LOKALNE
echo ============================================================
where uv >NUL 2>NUL
if errorlevel 1 (
  echo BRAK UV. Instalacja: winget install --id astral-sh.uv -e
  pause
  exit /b 1
)
uv sync --python 3.12 --frozen --dev
if errorlevel 1 goto error
uv run --python 3.12 --frozen python scripts\run_local_checks.py
if errorlevel 1 goto error
echo.
echo PASS. Nowe raporty w katalogu wyniki-lokalne.
pause
exit /b 0
:error
echo.
echo FAIL. Sprawdz logi w katalogu wyniki-lokalne.
pause
exit /b 1
