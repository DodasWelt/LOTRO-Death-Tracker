@echo off
REM LOTRO Death Tracker - Deinstallation
REM Version: 3.0
title LOTRO Death Tracker - Deinstallation

REM ── Self-Copy-Pattern (CLAUDE.md Hinweis 22) ──────────────────────────────
REM UNINSTALL.bat kann in C:\LOTRO-Death-Tracker\ liegen und soll dieses
REM Verzeichnis loeschen. CMD liest Skripte zeilenweise – Loeschen des eigenen
REM Verzeichnisses unterbricht die Ausfuehrung.
REM Loesung: Kopie nach %TEMP%, von dort starten, dann Kopie loescht sich selbst.

set "UNINSTALL_LOG=%TEMP%\LOTRO-DT-uninstall.log"
echo [%DATE% %TIME%] UNINSTALL.bat gestartet von: %~f0 > "%UNINSTALL_LOG%"

echo %~f0 | findstr /I "%TEMP%" >nul 2>&1
if %errorLevel% equ 0 goto :from_temp

REM Noch nicht in %TEMP% – kopiere und starte Kopie
echo [%DATE% %TIME%] Kopiere nach TEMP... >> "%UNINSTALL_LOG%"
set "TEMP_COPY=%TEMP%\LOTRO-DT-uninstall.bat"
copy /Y "%~f0" "%TEMP_COPY%" >nul 2>&1
if %errorLevel% neq 0 (
    echo [%DATE% %TIME%] FEHLER: Kopie fehlgeschlagen >> "%UNINSTALL_LOG%"
    echo [FEHLER] Kopie nach %TEMP% fehlgeschlagen!
    pause
    exit /b 1
)
echo [%DATE% %TIME%] Kopie OK, starte Fenster... >> "%UNINSTALL_LOG%"
start "LOTRO Death Tracker - Deinstallation" cmd /c ""%TEMP_COPY%""
echo [%DATE% %TIME%] start-Befehl ausgefuehrt >> "%UNINSTALL_LOG%"
exit /b 0

REM ─────────────────────────────────────────────────────────────────────────
:from_temp
REM Ab hier laeuft die Kopie aus %TEMP% - kann C:\LOTRO-Death-Tracker\ loeschen
REM ─────────────────────────────────────────────────────────────────────────
set "UNINSTALL_LOG=%TEMP%\LOTRO-DT-uninstall.log"
echo [%DATE% %TIME%] from_temp: Kopie laeuft, zeige Menue >> "%UNINSTALL_LOG%"

echo.
echo ================================================================
echo.
echo           LOTRO DEATH TRACKER - DEINSTALLATION
echo.
echo ================================================================
echo.
echo Diese Aktion entfernt LOTRO Death Tracker vollstaendig:
echo   - Watcher und Client werden beendet
echo   - Autostart-Eintraege werden geloescht
echo   - LOTRO Plugin wird entfernt
echo   - C:\LOTRO-Death-Tracker wird geloescht
echo.
echo ================================================================
echo.
set /P "CONFIRM=Wirklich deinstallieren? [J/N]: "
if /I not "%CONFIRM%"=="J" (
    echo Deinstallation abgebrochen.
    pause
    del "%~f0" >nul 2>&1
    exit /b 0
)
echo [%DATE% %TIME%] Bestaetigt, starte Deinstallation >> "%UNINSTALL_LOG%"
echo.

REM ── Schritt 1: Node.js-Prozesse beenden ──────────────────────────────────
echo [SCHRITT 1/4] Beende laufende Prozesse...
taskkill /F /IM node.exe /T >nul 2>&1
REM Kurze Pause damit Windows Datei-Handles freigibt (Countdown sichtbar)
timeout /t 2 /nobreak
echo   - node.exe-Prozesse beendet
echo [%DATE% %TIME%] Schritt 1 OK >> "%UNINSTALL_LOG%"

REM ── Schritt 2: Autostart-Eintraege loeschen ──────────────────────────────
echo [SCHRITT 2/4] Entferne Autostart-Eintraege...
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if exist "%STARTUP%\LOTRO-Death-Tracker.vbs" (
    del /F /Q "%STARTUP%\LOTRO-Death-Tracker.vbs" >nul 2>&1
    echo   - Watcher-Autostart entfernt
) else (
    echo   - Watcher-Autostart nicht gefunden (OK)
)
if exist "%STARTUP%\LOTRO-Death-Tracker-Status.vbs" (
    del /F /Q "%STARTUP%\LOTRO-Death-Tracker-Status.vbs" >nul 2>&1
    echo   - Status-Server-Autostart entfernt
) else (
    echo   - Status-Server-Autostart nicht gefunden (OK)
)
echo [%DATE% %TIME%] Schritt 2 OK >> "%UNINSTALL_LOG%"

REM ── Schritt 3: LOTRO Plugin loeschen ─────────────────────────────────────
echo [SCHRITT 3/4] Entferne LOTRO Plugin...
set "LOTRO_PLUGIN_REMOVED=0"
set "DOCS_PATH="

REM Pfad via Registry (zuverlaessigste Quelle)
FOR /F "tokens=2*" %%A IN (
    'REG QUERY "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders" /v Personal 2^>nul'
) DO SET "DOCS_PATH=%%B"

if defined DOCS_PATH (
    if exist "%DOCS_PATH%\The Lord of the Rings Online\Plugins\DodasWelt" (
        rd /s /q "%DOCS_PATH%\The Lord of the Rings Online\Plugins\DodasWelt" >nul 2>&1
        echo   - Plugin entfernt: %DOCS_PATH%\The Lord of the Rings Online\Plugins\DodasWelt
        set "LOTRO_PLUGIN_REMOVED=1"
    )
)
if "%LOTRO_PLUGIN_REMOVED%"=="0" (
    if exist "%USERPROFILE%\OneDrive\Documents\The Lord of the Rings Online\Plugins\DodasWelt" (
        rd /s /q "%USERPROFILE%\OneDrive\Documents\The Lord of the Rings Online\Plugins\DodasWelt" >nul 2>&1
        echo   - Plugin entfernt: OneDrive\Documents\...\Plugins\DodasWelt
        set "LOTRO_PLUGIN_REMOVED=1"
    )
)
if "%LOTRO_PLUGIN_REMOVED%"=="0" (
    if exist "%USERPROFILE%\Documents\The Lord of the Rings Online\Plugins\DodasWelt" (
        rd /s /q "%USERPROFILE%\Documents\The Lord of the Rings Online\Plugins\DodasWelt" >nul 2>&1
        echo   - Plugin entfernt: %USERPROFILE%\Documents\...\Plugins\DodasWelt
        set "LOTRO_PLUGIN_REMOVED=1"
    )
)
if "%LOTRO_PLUGIN_REMOVED%"=="0" (
    echo   [WARNUNG] LOTRO Plugin nicht gefunden (evtl. bereits entfernt oder an anderem Pfad)
)
echo [%DATE% %TIME%] Schritt 3 OK (PLUGIN_REMOVED=%LOTRO_PLUGIN_REMOVED%) >> "%UNINSTALL_LOG%"

REM ── Schritt 4: Installationsverzeichnis loeschen ──────────────────────────
echo [SCHRITT 4/4] Loesche Installationsverzeichnis...
echo [%DATE% %TIME%] Schritt 4: pruefe C:\LOTRO-Death-Tracker... >> "%UNINSTALL_LOG%"
if not exist "C:\LOTRO-Death-Tracker\" goto :no_install_dir
rd /s /q "C:\LOTRO-Death-Tracker\" >nul 2>&1
if exist "C:\LOTRO-Death-Tracker\" (
    echo   [WARNUNG] C:\LOTRO-Death-Tracker konnte nicht vollstaendig geloescht werden
    echo   Bitte manuell loeschen (evtl. nach Neustart).
    echo [%DATE% %TIME%] Schritt 4: WARNUNG - rd fehlgeschlagen >> "%UNINSTALL_LOG%"
) else (
    echo   - C:\LOTRO-Death-Tracker geloescht
    echo [%DATE% %TIME%] Schritt 4: C:\LOTRO-Death-Tracker geloescht >> "%UNINSTALL_LOG%"
)
goto :show_done
:no_install_dir
echo   - C:\LOTRO-Death-Tracker nicht gefunden (evtl. bereits entfernt)
echo [%DATE% %TIME%] Schritt 4: nicht vorhanden (OK) >> "%UNINSTALL_LOG%"

:show_done
echo.
echo ================================================================
echo.
echo              DEINSTALLATION ABGESCHLOSSEN
echo.
echo ================================================================
echo.

REM Abschluss-Popup
echo [%DATE% %TIME%] Zeige Abschluss-Popup... >> "%UNINSTALL_LOG%"
echo MsgBox "LOTRO Death Tracker wurde vollstaendig deinstalliert.", 64, "Deinstallation fertig!" > "%TEMP%\_lotro_uninstall_done.vbs"
cscript //nologo "%TEMP%\_lotro_uninstall_done.vbs"
del "%TEMP%\_lotro_uninstall_done.vbs" >nul 2>&1
echo [%DATE% %TIME%] Popup bestaetigt, fertig >> "%UNINSTALL_LOG%"

REM Kopie loescht sich selbst
del "%~f0" >nul 2>&1
