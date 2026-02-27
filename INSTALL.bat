@echo off
title LOTRO Death Tracker - Installation

REM Wechsle in das Verzeichnis wo die BAT-Datei liegt
cd /d "%~dp0"

echo.
echo ================================================================
echo.
echo         LOTRO DEATH TRACKER - AUTOMATISCHE INSTALLATION
echo.
echo ================================================================
echo.
echo Dieses Programm installiert automatisch:
echo   - LOTRO Plugin (ins LOTRO-Verzeichnis)
echo   - Node.js Client (fuer Daten-Upload)
echo   - Autostart-Konfiguration
echo.
echo ================================================================
echo.

REM Administrator-Rechte pruefen
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [FEHLER] Bitte als Administrator ausfuehren!
    echo.
    echo Rechtsklick auf diese Datei - "Als Administrator ausfuehren"
    echo.
    pause
    exit /b 1
)

echo [SCHRITT 1/5] Ueberpruefe Node.js Installation...
echo ----------------------------------------------------------------
node --version >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo [FEHLER] Node.js ist nicht installiert!
    echo.
    echo Bitte installiere Node.js von: https://nodejs.org
    echo Waehle die "LTS" Version und starte danach diesen Installer erneut.
    echo.
    pause
    exit /b 1
)
echo OK - Node.js gefunden
echo.

echo [SCHRITT 2/5] Pruefe LOTRO Installation...
echo ----------------------------------------------------------------

REM Pruefe ob Dokumente-Ordner existiert
set "LOTRO_DOCS=C:\Users\%USERNAME%\Documents\The Lord of the Rings Online"

if exist "%LOTRO_DOCS%" (
    echo OK - LOTRO-Ordner gefunden: %LOTRO_DOCS%
) else (
    echo [WARNUNG] LOTRO-Ordner nicht gefunden.
    echo Der Ordner wird beim ersten LOTRO-Start erstellt.
    echo Installation wird trotzdem fortgesetzt...
)
echo.

echo [SCHRITT 3/5] Installiere LOTRO Plugin...
echo ----------------------------------------------------------------

REM Plugin geht in Documents\The Lord of the Rings Online\Plugins
set "PLUGINS_PATH=C:\Users\%USERNAME%\Documents\The Lord of the Rings Online\Plugins"

if not exist "%PLUGINS_PATH%" (
    echo [INFO] Plugins-Ordner nicht gefunden: %PLUGINS_PATH%
    echo Erstelle Ordner...
    mkdir "%PLUGINS_PATH%"
)

REM Erstelle DodasWelt Ordner
if not exist "%PLUGINS_PATH%\DodasWelt" mkdir "%PLUGINS_PATH%\DodasWelt"

REM Kopiere Plugin-Dateien
echo   - Kopiere DeathTracker.plugin...
if exist "LOTRO-Plugin\DodasWelt\DeathTracker.plugin" (
    copy /Y "LOTRO-Plugin\DodasWelt\DeathTracker.plugin" "%PLUGINS_PATH%\DodasWelt\" >nul
) else (
    echo [FEHLER] DeathTracker.plugin nicht gefunden!
    echo Aktuelles Verzeichnis: %CD%
    echo.
    dir LOTRO-Plugin\DodasWelt\
    pause
    exit /b 1
)

echo   - Kopiere Main.lua...
if not exist "%PLUGINS_PATH%\DodasWelt\DeathTracker" mkdir "%PLUGINS_PATH%\DodasWelt\DeathTracker"
if exist "LOTRO-Plugin\DodasWelt\DeathTracker\Main.lua" (
    copy /Y "LOTRO-Plugin\DodasWelt\DeathTracker\Main.lua" "%PLUGINS_PATH%\DodasWelt\DeathTracker\" >nul
) else (
    echo [FEHLER] Main.lua nicht gefunden!
    echo Aktuelles Verzeichnis: %CD%
    pause
    exit /b 1
)

if %errorLevel% equ 0 (
    echo OK - Plugin installiert in: %PLUGINS_PATH%\DodasWelt
    echo   - DeathTracker.plugin
    echo   - DeathTracker\Main.lua
) else (
    echo [FEHLER] Plugin-Installation fehlgeschlagen!
    pause
    exit /b 1
)
echo.

echo [SCHRITT 4/5] Installiere Node.js Client...
echo ----------------------------------------------------------------

REM Erstelle Client-Verzeichnis
set "CLIENT_PATH=C:\LOTRO-Death-Tracker"
if not exist "%CLIENT_PATH%" mkdir "%CLIENT_PATH%"

REM Kopiere Client-Dateien einzeln
copy /Y "Client\client.js" "%CLIENT_PATH%\" >nul
copy /Y "Client\package.json" "%CLIENT_PATH%\" >nul
copy /Y "Client\install-autostart.js" "%CLIENT_PATH%\" >nul
copy /Y "Client\version.json.template" "%CLIENT_PATH%\version.json" >nul

REM Installiere npm dependencies
cd /d "%CLIENT_PATH%"
echo   - Installiere Node.js Pakete (kann 1-2 Minuten dauern)...
call npm install --silent --no-progress >nul 2>&1

if %errorLevel% equ 0 (
    echo OK - Client installiert in: %CLIENT_PATH%
) else (
    echo [FEHLER] npm install fehlgeschlagen!
    pause
    exit /b 1
)
echo.

echo [SCHRITT 5/5] Konfiguriere Autostart...
echo ----------------------------------------------------------------

REM Installiere Autostart
cd /d "%CLIENT_PATH%"
call node install-autostart.js install >nul 2>&1

if %errorLevel% equ 0 (
    echo OK - Autostart konfiguriert
    echo   - Der Client startet automatisch beim Windows-Start
) else (
    echo [WARNUNG] Autostart-Konfiguration fehlgeschlagen
    echo   - Du musst den Client manuell starten
)
echo.

echo ================================================================
echo.
echo                  INSTALLATION ERFOLGREICH!
echo.
echo ================================================================
echo.
echo NAECHSTE SCHRITTE:
echo.
echo 1. Starte LOTRO und lade das Plugin:
echo    - Im Spiel: /plugins load DodasWelt.DeathTracker
echo.
echo 2. Der Client laeuft im Hintergrund und sendet automatisch Daten
echo    - Logs findest du in: %CLIENT_PATH%\client.log
echo.
echo 3. Ueberpruefe ob es funktioniert:
echo    - Stirb im Spiel
echo    - Warte 10 Sekunden
echo    - Pruefe: https://www.dodaswelt.de/wp-json/lotro-deaths/v1/health
echo.
echo ================================================================
echo.
echo Druecke eine beliebige Taste zum Beenden...
pause >nul
