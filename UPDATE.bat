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
echo WICHTIGE HINWEISE (bitte lesen, falls das Fenster sofort schliesst):
echo.
echo   1. Als Administrator ausfuehren!
echo      Rechtsklick auf UPDATE.bat - "Als Administrator ausfuehren"
echo.
echo   2. ZIP-Datei und BAT entsperren!
echo      Windows blockiert heruntergeladene Dateien ohne Fehlermeldung.
echo      Loesung: Rechtsklick auf die ZIP-Datei - Eigenschaften -
echo      Haken bei "Zulassen" setzen - OK - dann erst entpacken.
echo.
echo   3. Antivirenprogramm-Ausnahme setzen!
echo      AV-Programme (z.B. Kaspersky) koennen die Ausfuehrung
echo      still blockieren. Bitte fuer folgende Dateien eine Ausnahme
echo      einrichten oder temporaer deaktivieren:
echo        C:\LOTRO-Death-Tracker\
echo        [Ordner dieser UPDATE.bat]
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
REM Log-Datei liegt immer neben der UPDATE.bat (kein %TEMP%-Pfad-Problem im Admin-Kontext)
set "UPDATE_LOG=%~dp0update.log"
echo   Log wird gespeichert als: %UPDATE_LOG%
echo.

echo [SCHRITT 1/5] Stoppe Watcher und Client...
echo ----------------------------------------------------------------
set "STARTUP_VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\LOTRO-Death-Tracker.vbs"
if exist "%STARTUP_VBS%" (
    del /F /Q "%STARTUP_VBS%" >nul 2>&1
    echo OK - Alter Autostart-Eintrag entfernt
) else (
    echo INFO - Kein alter Autostart-Eintrag gefunden (OK)
)

REM Alle laufenden Node.js-Prozesse beenden (Watcher + Client).
REM Hinweis: Betrifft ALLE node.exe-Prozesse auf diesem PC.
REM taskkill ist hier noetig, damit Datei-Handles freigegeben werden,
REM bevor neue Dateien kopiert werden (verhindert "Datei wird verwendet"-Fehler).
echo   - Beende laufende Node.js-Prozesse...
taskkill /F /IM node.exe /T >nul 2>&1
REM Kurz warten bis Datei-Handles freigegeben sind
timeout /t 2 /nobreak >nul
echo OK - Node.js-Prozesse beendet (oder keiner lief)
echo.

echo [SCHRITT 2/5] Aktualisiere Client-Dateien...
echo ----------------------------------------------------------------
copy /Y "Client\client.js"             "%CLIENT_PATH%\client.js" >nul
if %errorLevel% neq 0 ( echo [FEHLER] client.js konnte nicht kopiert werden! & pause & exit /b 1 )
copy /Y "Client\install-autostart.js"  "%CLIENT_PATH%\install-autostart.js" >nul
if %errorLevel% neq 0 ( echo [FEHLER] install-autostart.js konnte nicht kopiert werden! & pause & exit /b 1 )
copy /Y "Client\package.json"          "%CLIENT_PATH%\package.json" >nul
if %errorLevel% neq 0 ( echo [FEHLER] package.json konnte nicht kopiert werden! & pause & exit /b 1 )
copy /Y "Client\version.json.template" "%CLIENT_PATH%\version.json" >nul
if %errorLevel% neq 0 ( echo [FEHLER] version.json konnte nicht kopiert werden! & pause & exit /b 1 )
echo OK - Client-Dateien aktualisiert
echo.

REM --- Node.js-Pfad ermitteln (auch im Admin-Kontext zuverlaessig) ---
set "NODE_CMD=node"
set "NPM_CMD=npm"
where node >nul 2>&1
if %errorLevel% equ 0 goto :node_ready

echo   - Node.js nicht im Admin-PATH, suche Installationspfade...
if exist "%PROGRAMFILES%\nodejs\node.exe" (
    set "NODE_CMD=%PROGRAMFILES%\nodejs\node.exe"
    set "NPM_CMD=%PROGRAMFILES%\nodejs\npm.cmd"
    echo   - Gefunden: %PROGRAMFILES%\nodejs
    goto :node_ready
)
if exist "%USERPROFILE%\AppData\Local\Programs\node\node.exe" (
    set "NODE_CMD=%USERPROFILE%\AppData\Local\Programs\node\node.exe"
    set "NPM_CMD=%USERPROFILE%\AppData\Local\Programs\node\npm.cmd"
    echo   - Gefunden: %USERPROFILE%\AppData\Local\Programs\node
    goto :node_ready
)

echo.
echo [FEHLER] Node.js wurde nicht gefunden.
echo Die Client-Dateien wurden bereits kopiert (Schritt 2 erfolgreich).
echo.
echo Bitte abschliessen in normalem PowerShell (kein Admin):
echo   cd C:\LOTRO-Death-Tracker
echo   node install-autostart.js install
echo.
pause
exit /b 1

:node_ready
echo.

echo [SCHRITT 3/5] Aktualisiere Node.js Pakete...
echo ----------------------------------------------------------------
cd /d "%CLIENT_PATH%"
echo   - Installiere Pakete (kann 1-2 Minuten dauern)...
call "%NPM_CMD%" install --silent --no-progress >nul 2>&1
if %errorLevel% equ 0 (
    echo OK - Pakete aktualisiert
) else (
    echo [WARNUNG] npm install fehlgeschlagen - bestehende Pakete werden verwendet.
    echo [WARNUNG] Das Update wird trotzdem fortgesetzt.
    echo [WARNUNG] Falls Probleme auftreten: npm install manuell in %CLIENT_PATH% ausfuehren.
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

REM Kein Pfad automatisch gefunden – manuelle Eingabe anfordern
ECHO [WARNUNG] LOTRO-Verzeichnis wurde nicht automatisch gefunden.
ECHO Bitte gib den Pfad manuell ein, z.B.:
ECHO   C:\Users\DeinName\Documents\The Lord of the Rings Online
ECHO (oder Enter zum Ueberspringen des Plugin-Updates)
ECHO.
SET /P "LOTRO_PATH=LOTRO-Pfad: "
IF "%LOTRO_PATH%"=="" (
    ECHO INFO - Plugin-Update uebersprungen.
    GOTO :plugin_skipped
)
IF NOT EXIST "%LOTRO_PATH%" (
    ECHO [FEHLER] Pfad existiert nicht - Plugin-Update wird uebersprungen.
    GOTO :plugin_skipped
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
if %errorLevel% neq 0 (
    echo [WARNUNG] DeathTracker.plugin konnte nicht kopiert werden.
    echo [WARNUNG] Plugin-Update fehlgeschlagen. Manuell kopieren aus: LOTRO-Plugin\DodasWelt\
    goto :autostart
)
if not exist "%PLUGINS_PATH%\DodasWelt\DeathTracker" mkdir "%PLUGINS_PATH%\DodasWelt\DeathTracker"
copy /Y "LOTRO-Plugin\DodasWelt\DeathTracker\Main.lua" "%PLUGINS_PATH%\DodasWelt\DeathTracker\" >nul
if %errorLevel% neq 0 (
    echo [WARNUNG] Main.lua konnte nicht kopiert werden.
    echo [WARNUNG] Plugin-Update fehlgeschlagen. Manuell kopieren aus: LOTRO-Plugin\DodasWelt\
    goto :autostart
)
echo OK - Plugin aktualisiert in: %PLUGINS_PATH%\DodasWelt
goto :autostart

:plugin_skipped
echo INFO - Plugin-Update uebersprungen.

:autostart
echo.

echo [SCHRITT 5/5] Konfiguriere Autostart und starte Watcher...
echo ----------------------------------------------------------------
cd /d "%CLIENT_PATH%"
call "%NODE_CMD%" install-autostart.js install > "%UPDATE_LOG%" 2>&1
if %errorLevel% neq 0 (
    echo.
    echo [FEHLER] Watcher konnte nicht gestartet werden!
    echo.
    echo Fehler-Details (gespeichert als: %UPDATE_LOG%):
    echo ----------------------------------------------------------------
    type "%UPDATE_LOG%"
    echo ----------------------------------------------------------------
    echo.
    echo Die Update-Dateien wurden kopiert (Schritte 1-4 erfolgreich).
    echo Bitte Watcher manuell starten in PowerShell (kein Admin):
    echo.
    echo   cd C:\LOTRO-Death-Tracker
    echo   node install-autostart.js install
    echo.
    pause
    exit /b 1
)

REM Kurz warten und pruefen ob Watcher tatsaechlich laeuft
echo   - Pruefe ob Watcher laeuft (3 Sekunden)...
timeout /t 3 /nobreak >nul
tasklist /FI "IMAGENAME eq node.exe" /NH 2>nul | find "node.exe" >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo [FEHLER] Watcher laeuft nicht (node.exe nicht gefunden)!
    echo.
    echo Log gespeichert als: %UPDATE_LOG%
    echo.
    echo Fehler-Details:
    echo ----------------------------------------------------------------
    type "%UPDATE_LOG%"
    echo ----------------------------------------------------------------
    echo.
    echo Bitte Watcher manuell starten in PowerShell (kein Admin):
    echo.
    echo   cd C:\LOTRO-Death-Tracker
    echo   node install-autostart.js install
    echo.
    pause
    exit /b 1
)
echo OK - Autostart konfiguriert und Watcher laeuft
echo   Log gespeichert als: %UPDATE_LOG%
echo.

echo ================================================================
echo.
echo                    UPDATE ERFOLGREICH!
echo.
echo                  Installierte Version: 2.0
echo.
echo ================================================================
echo.
echo Der Watcher laeuft bereits im Hintergrund.
echo Ein Neustart von Windows ist NICHT erforderlich.
echo.
echo Falls LOTRO gerade laeuft, Plugin im Spiel neu laden:
echo   /plugins unload DodasWelt.DeathTracker
echo   /plugins load DodasWelt.DeathTracker
echo.
echo Vergiss nicht, auch das WordPress-Plugin ueber den
echo WP-Admin-Bereich auf die neue Version zu aktualisieren!
echo.
echo Bei Fragen: Discord bei Doda
echo.
echo ================================================================
echo.
pause
