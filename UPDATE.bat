@echo off
title LOTRO Death Tracker - Update auf v2.0

REM Wechsle in das Verzeichnis wo die BAT-Datei liegt
cd /d "%~dp0"

REM ── Diagnose-Log sofort anlegen (noch VOR dem Admin-Check!) ──────────────
REM Wenn diese Datei nach dem Ausfuehren NICHT existiert, wird UPDATE.bat von
REM Windows oder einem Antivirenprogramm blockiert (Mark of the Web).
set "UPDATE_LOG=%~dp0update.log"
echo [%DATE% %TIME%] UPDATE.bat gestartet > "%UPDATE_LOG%"
echo [%DATE% %TIME%] Verzeichnis: %~dp0 >> "%UPDATE_LOG%"

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
echo FALLS DAS FENSTER SICH SOFORT SCHLIESST - Loesung:
echo.
echo   Schritt 1: Rechtsklick auf UPDATE.bat
echo              -^> Eigenschaften -^> "Zulassen" anklicken -^> OK
echo.
echo   Schritt 2: Antivirusprogramm temporaer deaktivieren
echo              (z.B. Kaspersky - kann Ausfuehrung still blockieren)
echo.
echo   Schritt 3: Dann erneut als Administrator ausfuehren
echo.
echo   DIAGNOSE: Log-Datei liegt nach der Ausfuehrung hier:
echo   %UPDATE_LOG%
echo   (Existiert die Datei NICHT, ist die BAT selbst blockiert.)
echo.
echo ================================================================
echo.

REM Administrator-Rechte pruefen
REM Zwei Methoden: net session kann auf manchen Systemen falsch-negativ reagieren
REM (z.B. wenn der Windows-"Server"-Dienst deaktiviert ist).
echo [%DATE% %TIME%] Pruefe Admin-Rechte... >> "%UPDATE_LOG%"
net session >nul 2>&1
if %errorLevel% equ 0 goto :admin_ok
echo [%DATE% %TIME%] net session fehlgeschlagen, pruefe mit fsutil... >> "%UPDATE_LOG%"
fsutil dirty query %systemdrive% >nul 2>&1
if %errorLevel% equ 0 goto :admin_ok
echo [%DATE% %TIME%] FEHLER: Kein Admin >> "%UPDATE_LOG%"
echo [FEHLER] Bitte als Administrator ausfuehren!
echo.
echo Rechtsklick auf UPDATE.bat - "Als Administrator ausfuehren"
echo.
pause
exit /b 1
:admin_ok
echo [%DATE% %TIME%] Admin-Check OK >> "%UPDATE_LOG%"

REM Pruefe ob eine bestehende Installation vorhanden ist
set "CLIENT_PATH=C:\LOTRO-Death-Tracker"
echo [%DATE% %TIME%] Pruefe Installation: %CLIENT_PATH% >> "%UPDATE_LOG%"
if not exist "%CLIENT_PATH%\" (
    echo [%DATE% %TIME%] FEHLER: Kein C:\LOTRO-Death-Tracker >> "%UPDATE_LOG%"
    echo [FEHLER] Keine bestehende Installation gefunden.
    echo Erwartet: %CLIENT_PATH%
    echo.
    echo Bitte fuehre stattdessen INSTALL.bat aus.
    echo.
    pause
    exit /b 1
)
echo [%DATE% %TIME%] Installation gefunden OK >> "%UPDATE_LOG%"
echo OK - Bestehende Installation gefunden: %CLIENT_PATH%
echo.
echo   Log wird gespeichert als: %UPDATE_LOG%
echo.

echo [SCHRITT 1/5] Stoppe Watcher und Client...
echo ----------------------------------------------------------------
echo [%DATE% %TIME%] Schritt 1: Stoppe Watcher >> "%UPDATE_LOG%"
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
echo [%DATE% %TIME%] Schritt 1 OK >> "%UPDATE_LOG%"
echo.

echo [SCHRITT 2/5] Aktualisiere Client-Dateien...
echo ----------------------------------------------------------------
echo [%DATE% %TIME%] Schritt 2: Kopiere Client-Dateien >> "%UPDATE_LOG%"
copy /Y "Client\client.js"             "%CLIENT_PATH%\client.js" >nul
if %errorLevel% neq 0 (
    echo [%DATE% %TIME%] FEHLER beim Kopieren: client.js >> "%UPDATE_LOG%"
    echo [FEHLER] client.js konnte nicht kopiert werden!
    echo Quelle: %~dp0Client\client.js
    echo Ziel:   %CLIENT_PATH%\client.js
    pause
    exit /b 1
)
copy /Y "Client\install-autostart.js"  "%CLIENT_PATH%\install-autostart.js" >nul
if %errorLevel% neq 0 (
    echo [%DATE% %TIME%] FEHLER beim Kopieren: install-autostart.js >> "%UPDATE_LOG%"
    echo [FEHLER] install-autostart.js konnte nicht kopiert werden!
    pause
    exit /b 1
)
copy /Y "Client\package.json"          "%CLIENT_PATH%\package.json" >nul
if %errorLevel% neq 0 (
    echo [%DATE% %TIME%] FEHLER beim Kopieren: package.json >> "%UPDATE_LOG%"
    echo [FEHLER] package.json konnte nicht kopiert werden!
    pause
    exit /b 1
)
copy /Y "Client\version.json.template" "%CLIENT_PATH%\version.json" >nul
if %errorLevel% neq 0 (
    echo [%DATE% %TIME%] FEHLER beim Kopieren: version.json.template >> "%UPDATE_LOG%"
    echo [FEHLER] version.json konnte nicht kopiert werden!
    pause
    exit /b 1
)
echo OK - Client-Dateien aktualisiert
echo [%DATE% %TIME%] Schritt 2 OK >> "%UPDATE_LOG%"
echo.

REM --- Node.js-Pfad ermitteln (auch im Admin-Kontext zuverlaessig) ---
set "NODE_CMD=node"
set "NPM_CMD=npm"
echo [%DATE% %TIME%] Suche Node.js... >> "%UPDATE_LOG%"
where node >nul 2>&1
if %errorLevel% equ 0 (
    echo [%DATE% %TIME%] Node.js im PATH gefunden >> "%UPDATE_LOG%"
    goto :node_ready
)

echo   - Node.js nicht im Admin-PATH, suche Installationspfade...
if exist "%PROGRAMFILES%\nodejs\node.exe" (
    set "NODE_CMD=%PROGRAMFILES%\nodejs\node.exe"
    set "NPM_CMD=%PROGRAMFILES%\nodejs\npm.cmd"
    echo   - Gefunden: %PROGRAMFILES%\nodejs
    echo [%DATE% %TIME%] Node.js gefunden: %PROGRAMFILES%\nodejs >> "%UPDATE_LOG%"
    goto :node_ready
)
if exist "%USERPROFILE%\AppData\Local\Programs\node\node.exe" (
    set "NODE_CMD=%USERPROFILE%\AppData\Local\Programs\node\node.exe"
    set "NPM_CMD=%USERPROFILE%\AppData\Local\Programs\node\npm.cmd"
    echo   - Gefunden: %USERPROFILE%\AppData\Local\Programs\node
    echo [%DATE% %TIME%] Node.js gefunden: %USERPROFILE%\AppData\Local\Programs\node >> "%UPDATE_LOG%"
    goto :node_ready
)

echo [%DATE% %TIME%] FEHLER: Node.js nicht gefunden >> "%UPDATE_LOG%"
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
echo [%DATE% %TIME%] Schritt 3: npm install (NODE_CMD=%NODE_CMD%) >> "%UPDATE_LOG%"
cd /d "%CLIENT_PATH%"
echo   - Installiere Pakete (kann 1-2 Minuten dauern)...
call "%NPM_CMD%" install --no-audit --no-fund >> "%UPDATE_LOG%" 2>&1
if %errorLevel% equ 0 (
    echo OK - Pakete aktualisiert
    echo [%DATE% %TIME%] Schritt 3 OK >> "%UPDATE_LOG%"
) else (
    echo [WARNUNG] npm install fehlgeschlagen - bestehende Pakete werden verwendet.
    echo [WARNUNG] Das Update wird trotzdem fortgesetzt.
    echo [WARNUNG] Falls Probleme auftreten: npm install manuell in %CLIENT_PATH% ausfuehren.
    echo [%DATE% %TIME%] WARNUNG: npm install fehlgeschlagen - siehe Log fuer Details >> "%UPDATE_LOG%"
)
echo.

echo [SCHRITT 4/5] Aktualisiere LOTRO Plugin...
echo ----------------------------------------------------------------
echo [%DATE% %TIME%] Schritt 4: Plugin-Update >> "%UPDATE_LOG%"
cd /d "%~dp0"

REM LOTRO-Pfad ermitteln (Registry → OneDrive → Standard)
REM Kein interaktiver Prompt - bei nicht gefundenem Pfad wird uebersprungen.
set "LOTRO_PATH="
set "DOCS_PATH="
echo [%DATE% %TIME%] Schritt 4: Suche LOTRO-Pfad via Registry... >> "%UPDATE_LOG%"
FOR /F "tokens=2*" %%A IN (
  'REG QUERY "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders" /v Personal 2^>nul'
) DO SET "DOCS_PATH=%%B"

IF DEFINED DOCS_PATH (
  echo [%DATE% %TIME%] Schritt 4: DOCS_PATH=%DOCS_PATH% >> "%UPDATE_LOG%"
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

REM Kein Pfad gefunden - Plugin-Update ueberspringen (kein interaktiver Prompt)
echo [%DATE% %TIME%] Schritt 4: LOTRO-Pfad nicht gefunden - uebersprungen >> "%UPDATE_LOG%"
ECHO [WARNUNG] LOTRO-Verzeichnis nicht automatisch gefunden.
ECHO [WARNUNG] Plugin-Update wird uebersprungen.
ECHO [INFO] Plugin manuell kopieren nach:
ECHO   Dokumente\The Lord of the Rings Online\Plugins\DodasWelt\
ECHO   Quelle: %~dp0LOTRO-Plugin\DodasWelt\
GOTO :plugin_skipped

:update_lotro_found
echo [%DATE% %TIME%] Schritt 4: LOTRO-Pfad gefunden: %LOTRO_PATH% >> "%UPDATE_LOG%"
set "PLUGINS_PATH=%LOTRO_PATH%\Plugins"

if not exist "%PLUGINS_PATH%\DodasWelt" (
    echo [%DATE% %TIME%] Schritt 4: DodasWelt-Ordner nicht gefunden - uebersprungen >> "%UPDATE_LOG%"
    echo [WARNUNG] Plugin-Ordner nicht gefunden: %PLUGINS_PATH%\DodasWelt
    echo [WARNUNG] Plugin-Update wird uebersprungen.
    echo [INFO] Plugin manuell kopieren:
    echo   Quelle: %~dp0LOTRO-Plugin\DodasWelt\
    echo   Ziel:   %PLUGINS_PATH%\DodasWelt\
    goto :plugin_skipped
)

echo [%DATE% %TIME%] Schritt 4: Kopiere Plugin-Dateien... >> "%UPDATE_LOG%"
copy /Y "LOTRO-Plugin\DodasWelt\DeathTracker.plugin" "%PLUGINS_PATH%\DodasWelt\" >nul
if %errorLevel% neq 0 (
    echo [%DATE% %TIME%] WARNUNG: DeathTracker.plugin konnte nicht kopiert werden >> "%UPDATE_LOG%"
    echo [WARNUNG] DeathTracker.plugin konnte nicht kopiert werden.
    echo [WARNUNG] Manuell kopieren aus: %~dp0LOTRO-Plugin\DodasWelt\
    goto :autostart
)
if not exist "%PLUGINS_PATH%\DodasWelt\DeathTracker" mkdir "%PLUGINS_PATH%\DodasWelt\DeathTracker"
copy /Y "LOTRO-Plugin\DodasWelt\DeathTracker\Main.lua" "%PLUGINS_PATH%\DodasWelt\DeathTracker\" >nul
if %errorLevel% neq 0 (
    echo [%DATE% %TIME%] WARNUNG: Main.lua konnte nicht kopiert werden >> "%UPDATE_LOG%"
    echo [WARNUNG] Main.lua konnte nicht kopiert werden.
    echo [WARNUNG] Manuell kopieren aus: %~dp0LOTRO-Plugin\DodasWelt\DeathTracker\
    goto :autostart
)
echo OK - Plugin aktualisiert in: %PLUGINS_PATH%\DodasWelt
echo [%DATE% %TIME%] Schritt 4 OK - Plugin aktualisiert >> "%UPDATE_LOG%"
goto :autostart

:plugin_skipped
echo INFO - Plugin-Update uebersprungen.
echo [%DATE% %TIME%] Schritt 4 uebersprungen >> "%UPDATE_LOG%"

:autostart
echo.

echo [SCHRITT 5/5] Konfiguriere Autostart und starte Watcher...
echo ----------------------------------------------------------------
echo [%DATE% %TIME%] Schritt 5: install-autostart.js >> "%UPDATE_LOG%"
cd /d "%CLIENT_PATH%"
REM >> statt > damit frueheres Log erhalten bleibt
call "%NODE_CMD%" install-autostart.js install >> "%UPDATE_LOG%" 2>&1
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
echo [%DATE% %TIME%] Schritt 5 OK - Watcher laeuft >> "%UPDATE_LOG%"
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
