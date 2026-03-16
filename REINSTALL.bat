@echo off
REM LOTRO Death Tracker - Saubere Neuinstallation via GitHub
REM Version: 3.0
title LOTRO Death Tracker - Neuinstallation

REM ── Runner-Check (CLAUDE.md Hinweis 23) ─────────────────────────────────────
REM Wenn --runner Argument, direkt zu runner_start springen
if "%~1"=="--runner" goto :runner_start

REM ════════════════════════════════════════════════════════════════════════════
REM NORMAL-FLOW: Checks, Download, Staging
REM ════════════════════════════════════════════════════════════════════════════
cd /d "%~dp0"

REM ─── Konfiguration ───────────────────────────────────────────────────────────
REM USE_PRERELEASE=1 -> neuester Pre-Release (fuer Tests)
REM USE_PRERELEASE=0 -> stabiler Release (Standard, Produktion)
set "USE_PRERELEASE=0"

set "REINSTALL_LOG=%TEMP%\LOTRO-DT-reinstall.log"
echo [%DATE% %TIME%] REINSTALL.bat gestartet > "%REINSTALL_LOG%"
echo [%DATE% %TIME%] USE_PRERELEASE=%USE_PRERELEASE% >> "%REINSTALL_LOG%"

REM ── Ausfuehrungsort pruefen ───────────────────────────────────────────────────
set "_SCRIPT_DIR=%~dp0"
set "RUN_FROM_INSTALL_DIR=0"
if /i "%_SCRIPT_DIR%"=="C:\LOTRO-Death-Tracker\" set "RUN_FROM_INSTALL_DIR=1"
echo [%DATE% %TIME%] Ausfuehrungsort: %_SCRIPT_DIR% (Installationsverzeichnis: %RUN_FROM_INSTALL_DIR%) >> "%REINSTALL_LOG%"

echo.
echo ================================================================
echo.
echo        LOTRO DEATH TRACKER - SAUBERE NEUINSTALLATION
echo.
echo ================================================================
echo.
echo Diese Aktion laedt die neueste Version von GitHub und
echo installiert den LOTRO Death Tracker komplett neu.
echo.
echo ================================================================
echo.

REM ── Admin-Check ──────────────────────────────────────────────────────────────
echo [%DATE% %TIME%] Pruefe Admin-Rechte... >> "%REINSTALL_LOG%"
net session >nul 2>&1
if %errorLevel% equ 0 goto :admin_ok
fsutil dirty query %systemdrive% >nul 2>&1
if %errorLevel% equ 0 goto :admin_ok
echo [%DATE% %TIME%] FEHLER: Kein Admin >> "%REINSTALL_LOG%"
echo [FEHLER] Bitte als Administrator ausfuehren!
echo.
echo Rechtsklick auf REINSTALL.bat - "Als Administrator ausfuehren"
echo.
pause
exit /b 1
:admin_ok
echo [%DATE% %TIME%] Admin-Check OK >> "%REINSTALL_LOG%"

REM ── LOTRO-Running-Check ──────────────────────────────────────────────────────
echo [%DATE% %TIME%] Pruefe ob LOTRO laeuft... >> "%REINSTALL_LOG%"
set "LOTRO_RUNNING=0"
tasklist /FI "IMAGENAME eq lotroclient64.exe" /NH 2>nul | findstr /I "lotroclient64" >nul 2>&1
if %errorLevel% equ 0 set "LOTRO_RUNNING=1"
if "%LOTRO_RUNNING%"=="0" (
    tasklist /FI "IMAGENAME eq lotroclient.exe" /NH 2>nul | findstr /I "lotroclient.exe" >nul 2>&1
    if %errorLevel% equ 0 set "LOTRO_RUNNING=1"
)
if "%LOTRO_RUNNING%"=="1" goto :lotro_running_dialog
goto :node_check

:lotro_running_dialog
echo [%DATE% %TIME%] LOTRO laeuft - zeige Dialog >> "%REINSTALL_LOG%"
(
echo Dim rc
echo rc = MsgBox^("LOTRO laeuft noch." ^& Chr^(13^) ^& Chr^(10^) ^& "Soll LOTRO jetzt beendet werden?", 36, "LOTRO Death Tracker - Neuinstallation"^)
echo WScript.Quit rc
) > "%TEMP%\_lotro_reinstall_dlg.vbs"
cscript //nologo "%TEMP%\_lotro_reinstall_dlg.vbs"
set "DLG_RC=%errorLevel%"
del "%TEMP%\_lotro_reinstall_dlg.vbs" >nul 2>&1
echo [%DATE% %TIME%] LOTRO-Dialog Rueckgabe: %DLG_RC% >> "%REINSTALL_LOG%"
if "%DLG_RC%"=="6" goto :kill_lotro
echo [%DATE% %TIME%] Neuinstallation abgebrochen (LOTRO laeuft) >> "%REINSTALL_LOG%"
echo Neuinstallation abgebrochen.
pause
exit /b 1

:kill_lotro
taskkill /F /IM lotroclient64.exe >nul 2>&1
taskkill /F /IM lotroclient.exe >nul 2>&1
echo [%DATE% %TIME%] LOTRO beendet >> "%REINSTALL_LOG%"
timeout /t 2 /nobreak >nul

REM ── Node.js-Pfad ermitteln ───────────────────────────────────────────────────
:node_check
set "NODE_CMD="
set "NPM_CMD="
echo [%DATE% %TIME%] Suche Node.js... >> "%REINSTALL_LOG%"
where node >nul 2>&1
if %errorLevel% equ 0 (
    for /f "delims=" %%i in ('where node 2^>nul') do (
        set "NODE_CMD=%%i"
        set "NPM_CMD=%%~dpi\npm.cmd"
        goto :node_found
    )
)
if exist "%PROGRAMFILES%\nodejs\node.exe" (
    set "NODE_CMD=%PROGRAMFILES%\nodejs\node.exe"
    set "NPM_CMD=%PROGRAMFILES%\nodejs\npm.cmd"
    goto :node_found
)
if exist "%USERPROFILE%\AppData\Local\Programs\node\node.exe" (
    set "NODE_CMD=%USERPROFILE%\AppData\Local\Programs\node\node.exe"
    set "NPM_CMD=%USERPROFILE%\AppData\Local\Programs\node\npm.cmd"
    goto :node_found
)
echo [%DATE% %TIME%] FEHLER: Node.js nicht gefunden >> "%REINSTALL_LOG%"
echo [FEHLER] Node.js nicht gefunden! Bitte installieren: https://nodejs.org/
echo.
pause
exit /b 1
:node_found
if not exist "%NPM_CMD%" set "NPM_CMD=npm"
echo [%DATE% %TIME%] Node.js: %NODE_CMD% >> "%REINSTALL_LOG%"
echo   OK - Node.js gefunden
echo.

REM ── Schritt 1: GitHub API - neueste Version ermitteln ────────────────────────
echo [SCHRITT 1/3] Ermittle neueste Version von GitHub...
echo ----------------------------------------------------------------
echo [%DATE% %TIME%] Schritt 1: GitHub API-Abfrage >> "%REINSTALL_LOG%"

REM PS1-Dateien in %SystemRoot%\Temp (kein Leerzeichen im Pfad, auch bei Leerzeichen im Benutzernamen)
set "_GH_PS=%SystemRoot%\Temp\_lotro_gh_url.ps1"
set "_GH_TAG_PS=%SystemRoot%\Temp\_lotro_gh_tag.ps1"

if "%USE_PRERELEASE%"=="1" goto :write_prerelease_ps1

REM Stabiler Release via releases/latest
REM Einzelne echo-Zeilen (kein compound block - ^| innerhalb ( ) wird als Pipe interpretiert)
echo $r=Invoke-RestMethod 'https://api.github.com/repos/DodasWelt/LOTRO-Death-Tracker/releases/latest' -UseBasicParsing > "%_GH_PS%"
echo $a=$r.assets^|?{$_.name -like 'LOTRO-Death-Tracker-v*.zip'}^|Select-Object -First 1 >> "%_GH_PS%"
echo if^($a^){$a.browser_download_url}else{'ERROR_NO_ASSET'} >> "%_GH_PS%"
echo try{^(Invoke-RestMethod 'https://api.github.com/repos/DodasWelt/LOTRO-Death-Tracker/releases/latest' -UseBasicParsing^).tag_name}catch{'unbekannt'} > "%_GH_TAG_PS%"
goto :run_gh_ps1

:write_prerelease_ps1
echo [%DATE% %TIME%] Schritt 1: Schreibe Pre-Release PS1... >> "%REINSTALL_LOG%"
REM Einzelne echo-Zeilen (kein compound block - robuster gegen CMD-Parser-Quirks)
echo $r=Invoke-RestMethod 'https://api.github.com/repos/DodasWelt/LOTRO-Death-Tracker/releases' -UseBasicParsing > "%_GH_PS%"
echo $p=$r^|?{$_.prerelease}^|Select-Object -First 1 >> "%_GH_PS%"
echo if^($p -eq $null^){$p=$r^|Select-Object -First 1} >> "%_GH_PS%"
echo $a=$p.assets^|?{$_.name -like 'LOTRO-Death-Tracker-v*.zip'}^|Select-Object -First 1 >> "%_GH_PS%"
echo if^($a^){$a.browser_download_url}else{'ERROR_NO_ASSET'} >> "%_GH_PS%"
echo $r=Invoke-RestMethod 'https://api.github.com/repos/DodasWelt/LOTRO-Death-Tracker/releases' -UseBasicParsing > "%_GH_TAG_PS%"
echo $p=$r^|?{$_.prerelease}^|Select-Object -First 1 >> "%_GH_TAG_PS%"
echo if^($p -eq $null^){$p=$r^|Select-Object -First 1} >> "%_GH_TAG_PS%"
echo if^($p^){$p.tag_name}else{'unbekannt'} >> "%_GH_TAG_PS%"

:run_gh_ps1
echo [%DATE% %TIME%] Schritt 1: PS1 erstellt (USE_PRERELEASE=%USE_PRERELEASE%) >> "%REINSTALL_LOG%"

set "ZIP_URL="
for /f "delims=" %%u in ('powershell -NoProfile -ExecutionPolicy Bypass -File %_GH_PS% 2^>nul') do set "ZIP_URL=%%u"
del "%_GH_PS%" >nul 2>&1

set "RELEASE_TAG=unbekannt"
for /f "delims=" %%t in ('powershell -NoProfile -ExecutionPolicy Bypass -File %_GH_TAG_PS% 2^>nul') do set "RELEASE_TAG=%%t"
del "%_GH_TAG_PS%" >nul 2>&1

if not defined ZIP_URL goto :github_error
if "%ZIP_URL%"=="" goto :github_error
if "%ZIP_URL%"=="ERROR_NO_ASSET" goto :github_error
if "%ZIP_URL:~0,5%"=="ERROR" goto :github_error

echo [%DATE% %TIME%] Schritt 1: Tag=%RELEASE_TAG% ZIP=%ZIP_URL% >> "%REINSTALL_LOG%"
echo   Neueste Version: %RELEASE_TAG%
echo.
goto :download

:github_error
echo [%DATE% %TIME%] FEHLER: GitHub API nicht erreichbar (ZIP_URL='%ZIP_URL%') >> "%REINSTALL_LOG%"
echo.
echo [FEHLER] Neueste Version konnte nicht von GitHub geladen werden!
echo.
echo Moegliche Ursachen:
echo   - Kein Internetzugang
echo   - GitHub nicht erreichbar
if "%USE_PRERELEASE%"=="0" echo   - Nur Pre-Release vorhanden? USE_PRERELEASE=1 in REINSTALL.bat setzen
if "%USE_PRERELEASE%"=="1" echo   - Pre-Release-Modus aktiv, aber kein Asset gefunden
echo.
echo Diagnose-Log: %REINSTALL_LOG%
echo.
echo Es wurden KEINE Aenderungen am System vorgenommen.
echo.
pause
exit /b 1

REM ── Schritt 2: ZIP herunterladen und entpacken ───────────────────────────────
:download
echo [SCHRITT 2/3] Lade ZIP herunter und entpacke...
echo ----------------------------------------------------------------
echo [%DATE% %TIME%] Schritt 2: Erstelle Staging-Verzeichnis >> "%REINSTALL_LOG%"

for /f "tokens=2 delims==" %%a in ('wmic os get localdatetime /value 2^>nul') do set "DT=%%a"
if defined DT (
    set "STAGING=%TEMP%\LOTRO-DT-reinstall-%DT:~0,14%"
) else (
    set "STAGING=%TEMP%\LOTRO-DT-reinstall"
)
mkdir "%STAGING%" 2>nul
echo [%DATE% %TIME%] Schritt 2: STAGING=%STAGING% >> "%REINSTALL_LOG%"

echo   - Lade ZIP von GitHub...
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri '%ZIP_URL%' -OutFile '%STAGING%\download.zip' -UseBasicParsing; exit 0 } catch { Write-Error $_.Exception.Message; exit 1 }"
set "DL_EC=%errorLevel%"
echo [%DATE% %TIME%] Schritt 2: Download exitCode=%DL_EC% >> "%REINSTALL_LOG%"
if "%DL_EC%" neq "0" (
    echo [FEHLER] Download fehlgeschlagen!
    echo Es wurden KEINE Aenderungen am System vorgenommen.
    rd /s /q "%STAGING%" >nul 2>&1
    pause
    exit /b 1
)

echo   - Entpacke ZIP...
powershell -NoProfile -Command "try { Expand-Archive -Path '%STAGING%\download.zip' -DestinationPath '%STAGING%' -Force; exit 0 } catch { Write-Error $_.Exception.Message; exit 1 }"
set "EX_EC=%errorLevel%"
echo [%DATE% %TIME%] Schritt 2: Extract exitCode=%EX_EC% >> "%REINSTALL_LOG%"
if "%EX_EC%" neq "0" (
    echo [FEHLER] ZIP entpacken fehlgeschlagen!
    echo Es wurden KEINE Aenderungen am System vorgenommen.
    rd /s /q "%STAGING%" >nul 2>&1
    pause
    exit /b 1
)

del "%STAGING%\download.zip" >nul 2>&1
echo [%DATE% %TIME%] Schritt 2: Suche Unterordner in Staging... >> "%REINSTALL_LOG%"

REM Entpackter ZIP-Unterordner (LOTRO-Death-Tracker-vX.Y/)
REM Ohne Quotes um den Wildcard-Teil - STAGING hat keine Leerzeichen
set "STAGING_INNER="
for /d %%d in (%STAGING%\LOTRO-Death-Tracker-*) do set "STAGING_INNER=%%d"
echo [%DATE% %TIME%] Schritt 2: STAGING_INNER-Ergebnis: [%STAGING_INNER%] >> "%REINSTALL_LOG%"
if not defined STAGING_INNER goto :staging_inner_error
echo [%DATE% %TIME%] Schritt 2: STAGING_INNER=%STAGING_INNER% >> "%REINSTALL_LOG%"
echo   - Entpackt nach: %STAGING_INNER%
echo.
goto :copy_runner

:staging_inner_error
echo [%DATE% %TIME%] FEHLER: ZIP-Inhalt nicht erkannt >> "%REINSTALL_LOG%"
for /d %%x in (%STAGING%\*) do echo [%DATE% %TIME%] STAGING-Inhalt: %%x >> "%REINSTALL_LOG%"
echo [FEHLER] ZIP-Inhalt nicht erkannt! (kein LOTRO-Death-Tracker-* Ordner)
rd /s /q "%STAGING%" >nul 2>&1
pause
exit /b 1

REM ── Schritt 3: Runner-Skript starten ─────────────────────────────────────────
:copy_runner
echo [SCHRITT 3/3] Starte Neuinstallation...
echo ----------------------------------------------------------------
echo [%DATE% %TIME%] Schritt 3: Kopiere Runner >> "%REINSTALL_LOG%"

set "RUNNER=%TEMP%\LOTRO-DT-reinstall-runner.bat"
copy /Y "%~f0" "%RUNNER%" >nul
if %errorLevel% neq 0 goto :runner_copy_error
goto :start_runner

:runner_copy_error
echo [%DATE% %TIME%] FEHLER: Runner-Kopie fehlgeschlagen >> "%REINSTALL_LOG%"
echo [FEHLER] Runner-Skript konnte nicht erstellt werden!
rd /s /q "%STAGING%" >nul 2>&1
pause
exit /b 1

:start_runner

set "RUNNER_LOG_PATH=%TEMP%\LOTRO-DT-reinstall-runner.log"
echo [%DATE% %TIME%] Schritt 3: Start Runner: %RUNNER% --runner %STAGING% >> "%REINSTALL_LOG%"
echo [%DATE% %TIME%] Schritt 3: Runner-Log wird erstellt in: %RUNNER_LOG_PATH% >> "%REINSTALL_LOG%"
start "LOTRO Death Tracker - Neuinstallation laeuft..." cmd /c "%RUNNER%" --runner "%STAGING%" "%RUNNER_LOG_PATH%"
echo.
echo ================================================================
echo.
echo   Dieses Fenster schliesst sich jetzt - das ist NORMAL!
echo   Die Neuinstallation laeuft weiter im neuen Fenster oben.
echo   Bitte warte auf das Abschluss-Popup (ca. 1-2 Minuten).
echo.
echo ================================================================
echo.
timeout /t 4 /nobreak >nul
exit /b 0

REM ════════════════════════════════════════════════════════════════════════════
REM RUNNER-BLOCK: Laeuft als Kopie aus %TEMP% - fuehrt destructive Schritte aus
REM Aufruf: REINSTALL-runner.bat --runner <STAGING-Pfad>
REM ════════════════════════════════════════════════════════════════════════════
:runner_start
timeout /t 2 /nobreak >nul

set "STAGING=%~2"
set "RUNNER_LOG=%~3"
if "%RUNNER_LOG%"=="" set "RUNNER_LOG=%TEMP%\LOTRO-DT-reinstall-runner.log"
echo [%DATE% %TIME%] Runner gestartet > "%RUNNER_LOG%"
echo [%DATE% %TIME%] STAGING=%STAGING% >> "%RUNNER_LOG%"
echo [%DATE% %TIME%] RUNNER_LOG=%RUNNER_LOG% >> "%RUNNER_LOG%"

set "STAGING_INNER="
for /d %%d in (%STAGING%\LOTRO-Death-Tracker-*) do set "STAGING_INNER=%%d"
if not defined STAGING_INNER goto :runner_staging_error
echo [%DATE% %TIME%] STAGING_INNER=%STAGING_INNER% >> "%RUNNER_LOG%"
goto :runner_main

:runner_staging_error
echo [%DATE% %TIME%] FEHLER: STAGING_INNER nicht gefunden >> "%RUNNER_LOG%"
echo [FEHLER] Staging-Verzeichnis ungueltig: %STAGING%
echo MsgBox "Neuinstallation fehlgeschlagen: Staging nicht gefunden!", 16, "Fehler" > "%TEMP%\_lotro_reinstall_err.vbs"
cscript //nologo "%TEMP%\_lotro_reinstall_err.vbs"
del "%TEMP%\_lotro_reinstall_err.vbs" >nul 2>&1
del "%~f0" >nul 2>&1
exit /b 1

:runner_main

echo.
echo ================================================================
echo   LOTRO Death Tracker - Neuinstallation (Schritt 2/2)
echo ================================================================
echo.

REM Runner-Schritt 1: Prozesse beenden
echo [1/4] Beende laufende Prozesse...
taskkill /F /IM node.exe /T >nul 2>&1
timeout /t 3 /nobreak >nul
echo [%DATE% %TIME%] Runner 1: node.exe beendet >> "%RUNNER_LOG%"
echo   - node.exe beendet

REM Runner-Schritt 2: Autostart-Eintraege loeschen
echo [2/4] Entferne Autostart-Eintraege...
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if exist "%STARTUP%\LOTRO-Death-Tracker.vbs" (
    del /F /Q "%STARTUP%\LOTRO-Death-Tracker.vbs" >nul 2>&1
)
if exist "%STARTUP%\LOTRO-Death-Tracker-Status.vbs" (
    del /F /Q "%STARTUP%\LOTRO-Death-Tracker-Status.vbs" >nul 2>&1
)
echo [%DATE% %TIME%] Runner 2: Autostart entfernt >> "%RUNNER_LOG%"
echo   - Autostart-Eintraege entfernt

REM Runner-Schritt 3: LOTRO Plugin loeschen
echo [3/4] Entferne LOTRO Plugin...
set "PLUGIN_REMOVED=0"
set "DOCS_PATH_R="
FOR /F "tokens=2*" %%A IN ('REG QUERY "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders" /v Personal 2^>nul') DO SET "DOCS_PATH_R=%%B"
if defined DOCS_PATH_R (
    if exist "%DOCS_PATH_R%\The Lord of the Rings Online\Plugins\DodasWelt" (
        rd /s /q "%DOCS_PATH_R%\The Lord of the Rings Online\Plugins\DodasWelt" >nul 2>&1
        set "PLUGIN_REMOVED=1"
    )
)
if "%PLUGIN_REMOVED%"=="0" (
    if exist "%USERPROFILE%\OneDrive\Documents\The Lord of the Rings Online\Plugins\DodasWelt" (
        rd /s /q "%USERPROFILE%\OneDrive\Documents\The Lord of the Rings Online\Plugins\DodasWelt" >nul 2>&1
        set "PLUGIN_REMOVED=1"
    )
)
if "%PLUGIN_REMOVED%"=="0" (
    if exist "%USERPROFILE%\Documents\The Lord of the Rings Online\Plugins\DodasWelt" (
        rd /s /q "%USERPROFILE%\Documents\The Lord of the Rings Online\Plugins\DodasWelt" >nul 2>&1
        set "PLUGIN_REMOVED=1"
    )
)
echo [%DATE% %TIME%] Runner 3: PLUGIN_REMOVED=%PLUGIN_REMOVED% >> "%RUNNER_LOG%"
echo   - Plugin entfernt (gefunden: %PLUGIN_REMOVED%)

REM Runner-Schritt 4: Installationsverzeichnis loeschen
echo [4/4] Loesche altes Installationsverzeichnis...
if not exist "C:\LOTRO-Death-Tracker\" (
    echo [%DATE% %TIME%] Runner 4: C:\LOTRO-Death-Tracker nicht vorhanden (OK) >> "%RUNNER_LOG%"
    echo   - C:\LOTRO-Death-Tracker nicht gefunden (OK)
    goto :install_bat
)
rd /s /q "C:\LOTRO-Death-Tracker\" >nul 2>&1
timeout /t 1 /nobreak >nul
if exist "C:\LOTRO-Death-Tracker\" (
    echo [%DATE% %TIME%] Runner 4: rd Versuch 1 fehlgeschlagen - nochmal versuchen >> "%RUNNER_LOG%"
    taskkill /F /IM node.exe /T >nul 2>&1
    timeout /t 3 /nobreak >nul
    rd /s /q "C:\LOTRO-Death-Tracker\" >nul 2>&1
    timeout /t 1 /nobreak >nul
)
if exist "C:\LOTRO-Death-Tracker\" (
    echo [%DATE% %TIME%] FEHLER: C:\LOTRO-Death-Tracker konnte nicht geloescht werden >> "%RUNNER_LOG%"
    echo.
    echo [FEHLER] Installationsverzeichnis konnte nicht geloescht werden!
    echo Bitte alle laufenden Programme schliessen und es erneut versuchen.
    echo.
    (
    echo MsgBox "Fehler: C:\LOTRO-Death-Tracker konnte nicht geloescht werden." ^& Chr^(13^) ^& Chr^(10^) ^& "Bitte alle Node.js-Programme schliessen und REINSTALL erneut starten.", 16, "LOTRO Death Tracker - Fehler"
    ) > "%TEMP%\_lotro_reinstall_err.vbs"
    cscript //nologo "%TEMP%\_lotro_reinstall_err.vbs"
    del "%TEMP%\_lotro_reinstall_err.vbs" >nul 2>&1
    del "%~f0" >nul 2>&1
    exit /b 1
)
echo [%DATE% %TIME%] Runner 4: C:\LOTRO-Death-Tracker geloescht >> "%RUNNER_LOG%"
echo   - C:\LOTRO-Death-Tracker geloescht
timeout /t 1 /nobreak >nul
echo.

:install_bat
REM INSTALL.bat aus Staging aufrufen
echo ================================================================
echo   Installiere neue Version...
echo ================================================================
echo.
if not exist "%STAGING_INNER%\INSTALL.bat" (
    echo [%DATE% %TIME%] FEHLER: INSTALL.bat nicht in Staging >> "%RUNNER_LOG%"
    echo [FEHLER] INSTALL.bat nicht im Staging-Verzeichnis gefunden!
    echo Staging fuer Diagnose belassen: %STAGING_INNER%
    echo.
    echo MsgBox "Neuinstallation fehlgeschlagen: INSTALL.bat nicht im Staging!", 16, "Fehler" > "%TEMP%\_lotro_reinstall_err.vbs"
    cscript //nologo "%TEMP%\_lotro_reinstall_err.vbs"
    del "%TEMP%\_lotro_reinstall_err.vbs" >nul 2>&1
    del "%~f0" >nul 2>&1
    exit /b 1
)

call "%STAGING_INNER%\INSTALL.bat"
set "INSTALL_EC=%errorLevel%"
echo [%DATE% %TIME%] Runner: INSTALL.bat exitCode=%INSTALL_EC% >> "%RUNNER_LOG%"

if "%INSTALL_EC%"=="0" (
    rd /s /q "%STAGING%" >nul 2>&1
    echo [%DATE% %TIME%] Runner: Staging geloescht, abgeschlossen >> "%RUNNER_LOG%"
) else (
    echo.
    echo [FEHLER] Installation fehlgeschlagen! (Code: %INSTALL_EC%)
    echo Staging fuer Diagnose belassen: %STAGING%
    echo.
    echo MsgBox "Neuinstallation fehlgeschlagen!", 16, "LOTRO Death Tracker - Fehler" > "%TEMP%\_lotro_reinstall_err.vbs"
    cscript //nologo "%TEMP%\_lotro_reinstall_err.vbs"
    del "%TEMP%\_lotro_reinstall_err.vbs" >nul 2>&1
)

del "%~f0" >nul 2>&1
exit /b %INSTALL_EC%
