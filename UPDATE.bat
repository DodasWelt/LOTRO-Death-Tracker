@echo off
title LOTRO Death Tracker - Update auf v2.0

REM Wechsle in das Verzeichnis wo die BAT-Datei liegt
cd /d "%~dp0"

echo.
echo ================================================================
echo.
echo         LOTRO DEATH TRACKER - UPDATE AUF VERSION 2.0
echo.
echo ================================================================
echo.
echo Dieses Programm aktualisiert deine bestehende Installation:
echo   - LOTRO Plugin (neue Version)
echo   - Node.js Client (neue Version)
echo   - Autostart-Konfiguration
echo.
echo ================================================================
echo.

REM Administrator-Rechte pruefen
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [FEHLER] Bitte als Administrator ausfuehren!
    echo.
    echo Rechtsklick auf UPDATE.bat - "Als Administrator ausfuehren"
    echo.
    pause
    exit /b 1
)

REM Pruefe ob eine bestehende Installation vorhanden ist
set "CLIENT_PATH=C:\LOTRO-Death-Tracker"
if not exist "%CLIENT_PATH%\" (
    echo [FEHLER] Keine bestehende Installation gefunden.
    echo Erwartet: %CLIENT_PATH%
    echo.
    echo Bitte fuehre stattdessen INSTALL.bat aus.
    echo.
    pause
    exit /b 1
)
echo OK - Bestehende Installation gefunden: %CLIENT_PATH%
echo.

echo [SCHRITT 1/5] Stoppe alten Autostart...
echo ----------------------------------------------------------------
set "STARTUP_VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\LOTRO-Death-Tracker.vbs"
if exist "%STARTUP_VBS%" (
    del /F /Q "%STARTUP_VBS%" >nul 2>&1
    echo OK - Alter Autostart-Eintrag entfernt
) else (
    echo INFO - Kein alter Autostart-Eintrag gefunden (OK)
)
echo.

echo [SCHRITT 2/5] Aktualisiere Client-Dateien...
echo ----------------------------------------------------------------
copy /Y "Client\client.js"             "%CLIENT_PATH%\client.js" >nul
copy /Y "Client\install-autostart.js"  "%CLIENT_PATH%\install-autostart.js" >nul
copy /Y "Client\package.json"          "%CLIENT_PATH%\package.json" >nul
copy /Y "Client\version.json.template" "%CLIENT_PATH%\version.json" >nul
if %errorLevel% equ 0 (
    echo OK - Client-Dateien aktualisiert
) else (
    echo [FEHLER] Client-Dateien konnten nicht kopiert werden!
    pause
    exit /b 1
)
echo.

echo [SCHRITT 3/5] Aktualisiere Node.js Pakete...
echo ----------------------------------------------------------------
cd /d "%CLIENT_PATH%"
echo   - Installiere Pakete (kann 1-2 Minuten dauern)...
call npm install --silent --no-progress >nul 2>&1
if %errorLevel% equ 0 (
    echo OK - Pakete aktualisiert
) else (
    echo [FEHLER] npm install fehlgeschlagen!
    pause
    exit /b 1
)
echo.

echo [SCHRITT 4/5] Aktualisiere LOTRO Plugin...
echo ----------------------------------------------------------------
cd /d "%~dp0"

REM LOTRO-Pfad ermitteln (Registry → OneDrive → Standard → Manuell)
set "LOTRO_PATH="
set "DOCS_PATH="
FOR /F "tokens=2*" %%A IN (
  'REG QUERY "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders" /v Personal 2^>nul'
) DO SET "DOCS_PATH=%%B"

IF DEFINED DOCS_PATH (
  IF EXIST "%DOCS_PATH%\The Lord of the Rings Online" (
    SET "LOTRO_PATH=%DOCS_PATH%\The Lord of the Rings Online"
    GOTO :update_lotro_found
  )
)
IF EXIST "%USERPROFILE%\OneDrive\Documents\The Lord of the Rings Online" (
  SET "LOTRO_PATH=%USERPROFILE%\OneDrive\Documents\The Lord of the Rings Online"
  GOTO :update_lotro_found
)
IF EXIST "%USERPROFILE%\Documents\The Lord of the Rings Online" (
  SET "LOTRO_PATH=%USERPROFILE%\Documents\The Lord of the Rings Online"
  GOTO :update_lotro_found
)

:update_lotro_found
set "PLUGINS_PATH=%LOTRO_PATH%\Plugins"

if not exist "%PLUGINS_PATH%\DodasWelt" (
    echo [WARNUNG] Plugin-Ordner nicht gefunden: %PLUGINS_PATH%\DodasWelt
    echo Das Plugin wurde moeglicherweise woanders installiert.
    echo.
    echo Bitte gib den Pfad zum Plugins-Ordner ein (oder Enter zum Ueberspringen):
    echo Beispiel: C:\Users\DeinName\Documents\The Lord of the Rings Online\Plugins
    echo.
    set /P "PLUGINS_PATH=Plugins-Pfad: "
    if "%PLUGINS_PATH%"=="" (
        echo INFO - Plugin-Update uebersprungen.
        goto :plugin_skipped
    )
    if not exist "%PLUGINS_PATH%" (
        echo [WARNUNG] Pfad existiert nicht - Plugin-Update wird uebersprungen.
        goto :plugin_skipped
    )
)

copy /Y "LOTRO-Plugin\DodasWelt\DeathTracker.plugin" "%PLUGINS_PATH%\DodasWelt\" >nul
if not exist "%PLUGINS_PATH%\DodasWelt\DeathTracker" mkdir "%PLUGINS_PATH%\DodasWelt\DeathTracker"
copy /Y "LOTRO-Plugin\DodasWelt\DeathTracker\Main.lua" "%PLUGINS_PATH%\DodasWelt\DeathTracker\" >nul
if %errorLevel% equ 0 (
    echo OK - Plugin aktualisiert in: %PLUGINS_PATH%\DodasWelt
) else (
    echo [WARNUNG] Plugin-Update fehlgeschlagen. Manuell kopieren aus: LOTRO-Plugin\DodasWelt\
)
goto :autostart

:plugin_skipped
echo INFO - Plugin-Update uebersprungen.

:autostart
echo.

echo [SCHRITT 5/5] Konfiguriere Autostart neu...
echo ----------------------------------------------------------------
cd /d "%CLIENT_PATH%"
call node install-autostart.js install >nul 2>&1
if %errorLevel% equ 0 (
    echo OK - Autostart konfiguriert
) else (
    echo [WARNUNG] Autostart-Konfiguration fehlgeschlagen.
    echo   Bitte manuell ausfuehren: node install-autostart.js install
)
echo.

echo ================================================================
echo.
echo                    UPDATE ERFOLGREICH!
echo.
echo                  Installierte Version: 2.0
echo.
echo ================================================================
echo.
echo WICHTIG: Starte Windows neu (oder melde dich ab und wieder an),
echo damit der neue Autostart aktiv wird.
echo.
echo Falls du LOTRO gerade laeuft:
echo   /plugins unload DodasWelt.DeathTracker
echo   /plugins load DodasWelt.DeathTracker
echo.
echo Bei Fragen: Discord bei Doda
echo.
echo ================================================================
echo.
echo Druecke eine beliebige Taste zum Beenden...
pause >nul
