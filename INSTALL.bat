@echo off
title LOTRO Death Tracker - Installation

REM Wechsle in das Verzeichnis wo die BAT-Datei liegt
cd /d "%~dp0"

REM ── Diagnose-Log sofort anlegen (noch VOR dem Admin-Check!) ──────────────
REM Wenn diese Datei nach dem Ausfuehren NICHT existiert, wird INSTALL.bat von
REM Windows oder einem Antivirenprogramm blockiert (Mark of the Web).
set "INSTALL_LOG=%~dp0install.log"
echo [%DATE% %TIME%] INSTALL.bat gestartet > "%INSTALL_LOG%"
echo [%DATE% %TIME%] Verzeichnis: %~dp0 >> "%INSTALL_LOG%"

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
echo FALLS DAS FENSTER SICH SOFORT SCHLIESST - Loesung:
echo.
echo   Schritt 1: Rechtsklick auf INSTALL.bat
echo              -^> Eigenschaften -^> "Zulassen" anklicken -^> OK
echo.
echo   Schritt 2: Antivirusprogramm temporaer deaktivieren
echo              (z.B. Kaspersky - kann Ausfuehrung still blockieren)
echo.
echo   Schritt 3: Dann erneut als Administrator ausfuehren
echo.
echo   DIAGNOSE: Log-Datei liegt nach der Ausfuehrung hier:
echo   %INSTALL_LOG%
echo   (Existiert die Datei NICHT, ist die BAT selbst blockiert.)
echo.
echo ================================================================
echo.

REM Administrator-Rechte pruefen
REM Zwei Methoden: net session kann auf manchen Systemen falsch-negativ reagieren
REM (z.B. wenn der Windows-"Server"-Dienst deaktiviert ist).
echo [%DATE% %TIME%] Pruefe Admin-Rechte... >> "%INSTALL_LOG%"
net session >nul 2>&1
if %errorLevel% equ 0 goto :admin_ok
echo [%DATE% %TIME%] net session fehlgeschlagen, pruefe mit fsutil... >> "%INSTALL_LOG%"
fsutil dirty query %systemdrive% >nul 2>&1
if %errorLevel% equ 0 goto :admin_ok
echo [%DATE% %TIME%] FEHLER: Kein Admin >> "%INSTALL_LOG%"
echo [FEHLER] Bitte als Administrator ausfuehren!
echo.
echo Rechtsklick auf INSTALL.bat - "Als Administrator ausfuehren"
echo.
pause
exit /b 1
:admin_ok
echo [%DATE% %TIME%] Admin-Check OK >> "%INSTALL_LOG%"

REM ── LOTRO-Running-Check ──────────────────────────────────────────────────────
echo [%DATE% %TIME%] Pruefe ob LOTRO laeuft... >> "%INSTALL_LOG%"
set "LOTRO_RUNNING=0"
tasklist /FI "IMAGENAME eq lotroclient64.exe" /NH 2>nul | findstr /I "lotroclient64" >nul 2>&1
if %errorLevel% equ 0 set "LOTRO_RUNNING=1"
if "%LOTRO_RUNNING%"=="0" (
    tasklist /FI "IMAGENAME eq lotroclient.exe" /NH 2>nul | findstr /I "lotroclient.exe" >nul 2>&1
    if %errorLevel% equ 0 set "LOTRO_RUNNING=1"
)
if "%LOTRO_RUNNING%"=="1" goto :install_lotro_running_dialog
goto :install_node_check

:install_lotro_running_dialog
echo [%DATE% %TIME%] LOTRO laeuft - zeige Dialog >> "%INSTALL_LOG%"
(
echo Dim rc
echo rc = MsgBox^("LOTRO laeuft noch." ^& Chr^(13^) ^& Chr^(10^) ^& "Soll LOTRO jetzt beendet werden?", 36, "LOTRO Death Tracker - Installation"^)
echo WScript.Quit rc
) > "%TEMP%\_lotro_install_dlg.vbs"
cscript //nologo "%TEMP%\_lotro_install_dlg.vbs"
set "DLG_RC=%errorLevel%"
del "%TEMP%\_lotro_install_dlg.vbs" >nul 2>&1
echo [%DATE% %TIME%] LOTRO-Dialog Rueckgabe: %DLG_RC% >> "%INSTALL_LOG%"
if "%DLG_RC%"=="6" goto :install_kill_lotro
echo [%DATE% %TIME%] Installation abgebrochen (LOTRO laeuft) >> "%INSTALL_LOG%"
echo Installation abgebrochen.
pause
exit /b 1

:install_kill_lotro
taskkill /F /IM lotroclient64.exe >nul 2>&1
taskkill /F /IM lotroclient.exe >nul 2>&1
echo [%DATE% %TIME%] LOTRO beendet >> "%INSTALL_LOG%"

:install_node_check

REM --- Node.js-Pfad ermitteln (auch im Admin-Kontext zuverlaessig) ---
REM npm wird immer direkt aus dem Verzeichnis von node.exe abgeleitet,
REM nicht aus PATH - verhindert Konflikt mit lokalem npm in node_modules\.bin
set "NODE_CMD="
set "NPM_CMD="
echo [%DATE% %TIME%] Suche Node.js... >> "%INSTALL_LOG%"
echo [SCHRITT 1/5] Ueberpruefe Node.js Installation...
echo ----------------------------------------------------------------
where node >nul 2>&1
if %errorLevel% equ 0 (
    for /f "delims=" %%i in ('where node 2^>nul') do (
        set "NODE_CMD=%%i"
        set "NPM_CMD=%%~dpi\npm.cmd"
        goto :node_found_in_path
    )
)
goto :node_not_in_path

:node_found_in_path
if not exist "%NPM_CMD%" set "NPM_CMD=npm"
echo [%DATE% %TIME%] Node.js im PATH: %NODE_CMD% >> "%INSTALL_LOG%"
echo [%DATE% %TIME%] npm: %NPM_CMD% >> "%INSTALL_LOG%"
goto :node_ready

:node_not_in_path
echo   - Node.js nicht im Admin-PATH, suche Installationspfade...
if exist "%PROGRAMFILES%\nodejs\node.exe" (
    set "NODE_CMD=%PROGRAMFILES%\nodejs\node.exe"
    set "NPM_CMD=%PROGRAMFILES%\nodejs\npm.cmd"
    echo   - Gefunden: %PROGRAMFILES%\nodejs
    echo [%DATE% %TIME%] Node.js gefunden: %PROGRAMFILES%\nodejs >> "%INSTALL_LOG%"
    goto :node_ready
)
if exist "%USERPROFILE%\AppData\Local\Programs\node\node.exe" (
    set "NODE_CMD=%USERPROFILE%\AppData\Local\Programs\node\node.exe"
    set "NPM_CMD=%USERPROFILE%\AppData\Local\Programs\node\npm.cmd"
    echo   - Gefunden: %USERPROFILE%\AppData\Local\Programs\node
    echo [%DATE% %TIME%] Node.js gefunden: %USERPROFILE%\AppData\Local\Programs\node >> "%INSTALL_LOG%"
    goto :node_ready
)

REM Node.js nicht gefunden - Installer im Browser oeffnen
echo [%DATE% %TIME%] FEHLER: Node.js nicht gefunden - oeffne Download-Link >> "%INSTALL_LOG%"
echo.
echo [FEHLER] Node.js ist nicht installiert oder wurde nicht erkannt!
echo.
echo Der Node.js-Installer wird jetzt im Browser geoeffnet...
start "" "https://nodejs.org/dist/v24.14.0/node-v24.14.0-x64.msi"
echo.
echo ================================================================
echo.
echo WICHTIG - Bitte folgende Schritte ausfuehren:
echo.
echo   1. Installiere Node.js (den soeben geoeffneten Installer)
echo      Alle Optionen koennen auf Standard belassen werden.
echo.
echo   2. Starte den PC danach UNBEDINGT neu!
echo      (Pflicht - ohne Neustart wird Node.js nicht erkannt)
echo.
echo   3. Fuehre INSTALL.bat nach dem Neustart erneut aus.
echo.
echo ================================================================
echo.
pause
exit /b 1

:node_ready
echo OK - Node.js gefunden
echo.

echo [SCHRITT 2/5] Suche LOTRO Installation...
echo ----------------------------------------------------------------

REM LOTRO-Pfad ermitteln (Registry -> OneDrive -> Standard -> Manuelle Eingabe)
set "LOTRO_PATH="
set "DOCS_PATH="
echo [%DATE% %TIME%] Schritt 2: Suche LOTRO-Pfad via Registry... >> "%INSTALL_LOG%"
FOR /F "tokens=2*" %%A IN (
  'REG QUERY "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders" /v Personal 2^>nul'
) DO SET "DOCS_PATH=%%B"

IF DEFINED DOCS_PATH (
  echo [%DATE% %TIME%] Schritt 2: DOCS_PATH=%DOCS_PATH% >> "%INSTALL_LOG%"
  IF EXIST "%DOCS_PATH%\The Lord of the Rings Online" (
    SET "LOTRO_PATH=%DOCS_PATH%\The Lord of the Rings Online"
    GOTO :lotro_found
  )
)
IF EXIST "%USERPROFILE%\OneDrive\Documents\The Lord of the Rings Online" (
  SET "LOTRO_PATH=%USERPROFILE%\OneDrive\Documents\The Lord of the Rings Online"
  GOTO :lotro_found
)
IF EXIST "%USERPROFILE%\Documents\The Lord of the Rings Online" (
  SET "LOTRO_PATH=%USERPROFILE%\Documents\The Lord of the Rings Online"
  GOTO :lotro_found
)

REM Nicht gefunden - manuelle Eingabe (bei Erstinstallation akzeptabel)
echo.
echo [WARNUNG] Das Verzeichnis "The Lord of the Rings Online" wurde nicht gefunden.
echo Bitte gib den vollstaendigen Pfad manuell ein, z.B.:
echo   C:\Users\Dein_Name\Documents\The Lord of the Rings Online
echo (Oder Enter druecken - der Ordner wird beim ersten LOTRO-Start automatisch erstellt)
echo.
SET /P "LOTRO_PATH=Pfad (oder Enter fuer Standard): "
IF "%LOTRO_PATH%"=="" (
  SET "LOTRO_PATH=%USERPROFILE%\Documents\The Lord of the Rings Online"
  echo INFO - Verwende Standard-Pfad.
)

:lotro_found
echo [%DATE% %TIME%] Schritt 2: LOTRO-Pfad: %LOTRO_PATH% >> "%INSTALL_LOG%"
echo OK - LOTRO-Pfad: %LOTRO_PATH%
echo.

echo [SCHRITT 3/5] Installiere LOTRO Plugin...
echo ----------------------------------------------------------------
echo [%DATE% %TIME%] Schritt 3: Installiere Plugin >> "%INSTALL_LOG%"

set "PLUGINS_PATH=%LOTRO_PATH%\Plugins"
if not exist "%PLUGINS_PATH%" (
    echo [INFO] Plugins-Ordner nicht gefunden: %PLUGINS_PATH%
    echo Erstelle Ordner...
    mkdir "%PLUGINS_PATH%"
)
if not exist "%PLUGINS_PATH%\DodasWelt" mkdir "%PLUGINS_PATH%\DodasWelt"

echo   - Kopiere DeathTracker.plugin...
if not exist "LOTRO-Plugin\DodasWelt\DeathTracker.plugin" (
    echo [%DATE% %TIME%] FEHLER: DeathTracker.plugin nicht gefunden >> "%INSTALL_LOG%"
    echo [FEHLER] DeathTracker.plugin nicht gefunden!
    echo Aktuelles Verzeichnis: %CD%
    pause
    exit /b 1
)
copy /Y "LOTRO-Plugin\DodasWelt\DeathTracker.plugin" "%PLUGINS_PATH%\DodasWelt\" >nul
if %errorLevel% neq 0 (
    echo [%DATE% %TIME%] FEHLER: DeathTracker.plugin konnte nicht kopiert werden >> "%INSTALL_LOG%"
    echo [FEHLER] DeathTracker.plugin konnte nicht kopiert werden!
    pause
    exit /b 1
)

echo   - Kopiere Main.lua...
if not exist "%PLUGINS_PATH%\DodasWelt\DeathTracker" mkdir "%PLUGINS_PATH%\DodasWelt\DeathTracker"
if not exist "LOTRO-Plugin\DodasWelt\DeathTracker\Main.lua" (
    echo [%DATE% %TIME%] FEHLER: Main.lua nicht gefunden >> "%INSTALL_LOG%"
    echo [FEHLER] Main.lua nicht gefunden!
    echo Aktuelles Verzeichnis: %CD%
    pause
    exit /b 1
)
copy /Y "LOTRO-Plugin\DodasWelt\DeathTracker\Main.lua" "%PLUGINS_PATH%\DodasWelt\DeathTracker\" >nul
if %errorLevel% neq 0 (
    echo [%DATE% %TIME%] FEHLER: Main.lua konnte nicht kopiert werden >> "%INSTALL_LOG%"
    echo [FEHLER] Main.lua konnte nicht kopiert werden!
    pause
    exit /b 1
)

echo OK - Plugin installiert in: %PLUGINS_PATH%\DodasWelt
echo   - DeathTracker.plugin
echo   - DeathTracker\Main.lua
echo [%DATE% %TIME%] Schritt 3 OK >> "%INSTALL_LOG%"
echo.

echo [SCHRITT 4/5] Installiere Node.js Client...
echo ----------------------------------------------------------------
echo [%DATE% %TIME%] Schritt 4: Installiere Client >> "%INSTALL_LOG%"

set "CLIENT_PATH=C:\LOTRO-Death-Tracker"
if not exist "%CLIENT_PATH%" mkdir "%CLIENT_PATH%"

copy /Y "Client\client.js" "%CLIENT_PATH%\" >nul
if %errorLevel% neq 0 (
    echo [%DATE% %TIME%] FEHLER beim Kopieren: client.js >> "%INSTALL_LOG%"
    echo [FEHLER] client.js konnte nicht kopiert werden!
    pause
    exit /b 1
)
copy /Y "Client\install-autostart.js" "%CLIENT_PATH%\" >nul
if %errorLevel% neq 0 (
    echo [%DATE% %TIME%] FEHLER beim Kopieren: install-autostart.js >> "%INSTALL_LOG%"
    echo [FEHLER] install-autostart.js konnte nicht kopiert werden!
    pause
    exit /b 1
)
copy /Y "Client\package.json" "%CLIENT_PATH%\" >nul
if %errorLevel% neq 0 (
    echo [%DATE% %TIME%] FEHLER beim Kopieren: package.json >> "%INSTALL_LOG%"
    echo [FEHLER] package.json konnte nicht kopiert werden!
    pause
    exit /b 1
)
copy /Y "Client\version.json.template" "%CLIENT_PATH%\version.json" >nul
if %errorLevel% neq 0 (
    echo [%DATE% %TIME%] FEHLER beim Kopieren: version.json >> "%INSTALL_LOG%"
    echo [FEHLER] version.json konnte nicht kopiert werden!
    pause
    exit /b 1
)

REM --- UNINSTALL.bat + REINSTALL.bat ins Installationsverzeichnis kopieren ---
if exist "%~dp0UNINSTALL.bat" (
    copy /Y "%~dp0UNINSTALL.bat" "%CLIENT_PATH%\UNINSTALL.bat" >nul
    echo   - UNINSTALL.bat kopiert
    echo [%DATE% %TIME%] Schritt 4: UNINSTALL.bat kopiert >> "%INSTALL_LOG%"
) else (
    echo [WARNUNG] UNINSTALL.bat nicht gefunden - wird nicht kopiert
    echo [%DATE% %TIME%] WARNUNG: UNINSTALL.bat nicht gefunden >> "%INSTALL_LOG%"
)
if exist "%~dp0REINSTALL.bat" (
    copy /Y "%~dp0REINSTALL.bat" "%CLIENT_PATH%\REINSTALL.bat" >nul
    echo   - REINSTALL.bat kopiert
    echo [%DATE% %TIME%] Schritt 4: REINSTALL.bat kopiert >> "%INSTALL_LOG%"
) else (
    echo [WARNUNG] REINSTALL.bat nicht gefunden - wird nicht kopiert
    echo [%DATE% %TIME%] WARNUNG: REINSTALL.bat nicht gefunden >> "%INSTALL_LOG%"
)

echo [%DATE% %TIME%] Schritt 4: npm install (NODE_CMD=%NODE_CMD%) >> "%INSTALL_LOG%"
cd /d "%CLIENT_PATH%"
echo   - Installiere Node.js Pakete (kann 1-2 Minuten dauern)...
call "%NPM_CMD%" install --no-audit --no-fund >> "%INSTALL_LOG%" 2>&1
set "NPM_EC=%errorLevel%"
echo [%DATE% %TIME%] Schritt 4: npm exitCode=%NPM_EC% >> "%INSTALL_LOG%"
if "%NPM_EC%" neq "0" goto :npm_error
echo OK - Client installiert in: %CLIENT_PATH%
echo [%DATE% %TIME%] Schritt 4 OK >> "%INSTALL_LOG%"
echo.
goto :schritt5

:npm_error
echo [%DATE% %TIME%] FEHLER: npm install fehlgeschlagen >> "%INSTALL_LOG%"
echo [FEHLER] npm install fehlgeschlagen!
echo Bitte Log pruefen: %INSTALL_LOG%
pause
exit /b 1

:schritt5
echo [SCHRITT 5/5] Konfiguriere Autostart...
echo ----------------------------------------------------------------
echo [%DATE% %TIME%] Schritt 5: install-autostart.js >> "%INSTALL_LOG%"
cd /d "%CLIENT_PATH%"
call "%NODE_CMD%" install-autostart.js install >> "%INSTALL_LOG%" 2>&1
set "INSTALL_EC=%errorLevel%"
echo [%DATE% %TIME%] Schritt 5: install-autostart.js exitCode=%INSTALL_EC% >> "%INSTALL_LOG%"
if "%INSTALL_EC%" neq "0" goto :step5_error
echo [%DATE% %TIME%] Schritt 5 OK >> "%INSTALL_LOG%"
echo OK - Autostart konfiguriert und Watcher gestartet
echo   Log gespeichert als: %INSTALL_LOG%
goto :show_success

:step5_error
echo [%DATE% %TIME%] FEHLER: install-autostart.js Code %INSTALL_EC% >> "%INSTALL_LOG%"
echo.
echo [FEHLER] Watcher konnte nicht gestartet werden! (Code: %INSTALL_EC%)
echo.
echo Bitte Log pruefen: %INSTALL_LOG%
echo.
echo Manuell starten in PowerShell (kein Admin):
echo   cd C:\LOTRO-Death-Tracker
echo   node install-autostart.js install
echo.
pause
exit /b 1

:show_success
echo.
echo ================================================================
echo.
echo                  INSTALLATION ERFOLGREICH!
echo.
echo                  Installierte Version: 3.0
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

REM Zeige Erfolgs-Popup - sichtbar auch wenn das CMD-Fenster sich schliesst
echo MsgBox "LOTRO Death Tracker v3.0 erfolgreich installiert! Watcher laeuft im Hintergrund.", 64, "Installation fertig!" > "%TEMP%\_lotro_install_done.vbs"
cscript //nologo "%TEMP%\_lotro_install_done.vbs"
del "%TEMP%\_lotro_install_done.vbs" >nul 2>&1
echo [%DATE% %TIME%] INSTALLATION abgeschlossen (Popup bestaetigt) >> "%INSTALL_LOG%"
