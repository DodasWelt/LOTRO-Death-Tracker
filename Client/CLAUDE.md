# Client — Implementierungsdetails

Ergänzt das Root-`CLAUDE.md`. Gilt für alle Arbeiten in `Client/`, `INSTALL.bat/sh`, `UPDATE.bat/sh`, `UNINSTALL.bat/sh`, `REINSTALL.bat/sh`.

---

## Autostart-System

`install-autostart.js` generiert **vier** Dateien dynamisch (NICHT versioniert, zur Laufzeit erstellt):
- `lotro-watcher.js` — Prüft alle 5s ob `lotroclient64.exe`/`lotroclient.exe` läuft, startet/stoppt `client.js`. Enthält `checkAndApplyUpdate()`: einmaliger GitHub-API-Aufruf beim Start, bei neuerer Version Download + Spawn von `updater.js` + Selbstbeendigung. **Watchdog:** prüft via `status-server.pid` ob Status-Server lebt; falls nicht, neu spawnen (max. 1× pro Minute).
- `lotro-status-server.js` — Lokaler HTTP-Server auf Port 7890. Eigener Prozess, unabhängig vom Watcher.
- `start-lotro-watcher.vbs` — Startet Watcher unsichtbar (kein Konsolenfenster).
- `start-lotro-status-server.vbs` — Startet Status-Server unsichtbar.

**Beide** VBS-Dateien werden in Autostart kopiert:
- `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\LOTRO-Death-Tracker.vbs` → Watcher
- `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\LOTRO-Death-Tracker-Status.vbs` → Status-Server

**Linux:** Zwei XDG Desktop-Dateien:
- `~/.config/autostart/lotro-death-tracker.desktop` → Watcher
- `~/.config/autostart/lotro-death-tracker-status.desktop` → Status-Server

---

## OBS Browser-Dock Status-Seite (ab v2.7)

`lotro-status-server.js` läuft als **separater Prozess** auf Port 7890.

**Architektur:**
- Eigener `node`-Prozess mit eigenem `status-server.pid` Singleton-Lock
- Singleton-Lock prüft via `spawnSync('tasklist'/'ps')` ob PID zu `node`-Prozess gehört (Schutz vor staler PID nach OS-Shutdown)
- Liest `watcher.pid` und `client.pid` via `process.kill(pid, 0)` — kein IPC nötig
- `client.js` schreibt beim Start `client.pid`, löscht sie beim Beenden

**Endpoints:**
- `GET /` — HTML-Statusseite (Watcher/Client/Plugin-Dots, Restart-Button)
- `GET /status` — JSON `{ watcher, client, plugin, lastCheck }`
- `POST /restart` — schreibt temp Script, spawnt detached, beendet sich nach 200ms

**Restart-Flow:**
1. POST /restart → 200 OK
2. Temp-Script schreiben (`_lotro_restart.vbs` / `_lotro_restart.sh`)
3. Script spawnen (detached), Status-Server beendet sich nach 200ms
4. Script wartet 2s, killt alle `node.exe`, bereinigt StreamDeck-Node-Ordner, startet `install-autostart.js install`
5. `install-autostart.js install` startet neuen Watcher + neuen Status-Server

**OBS Dock einrichten:** OBS → Docks → Benutzerdefinierte Browser-Docks → URL: `http://localhost:7890`

**Plugin-Erkennung:** `isPluginActive()` prüft ob `Plugins/DodasWelt/DeathTracker.plugin` existiert (gecacht, kein Registry-Query alle 5s). Nicht `DeathTracker_Sync.plugindata` prüfen — die existiert erst nach dem ersten Tod/Level-Up.

---

## Linux-Kompatibilität (ab v2.4+)

LOTRO läuft auf Linux via Steam+Proton (AppID 212500) oder Lutris. Alle Node.js-Dateien unterstützen beide Plattformen über `process.platform === 'linux'` Branches.

**LOTRO-Pfad-Suchreihenfolge (Linux):**

| Priorität | Pfad | Launcher |
|---|---|---|
| 1 | `~/.steam/steam/steamapps/compatdata/212500/pfx/drive_c/users/steamuser/My Documents/LOTRO` | Steam (native) |
| 2 | `~/.var/app/com.valvesoftware.Steam/.../compatdata/212500/...` | Steam (Flatpak) |
| 3 | Steam Library VDF-Scan: `libraryfolders.vdf` — findet nicht-standard Library-Ordner | Steam (custom path) |
| 4 | `~/.config/lutris/games/*.yml` → `wine_prefix:` oder `prefix:` | Lutris |
| 5 | `LOTRO_PATH` Env-Var | Manuell |

**Plattformspezifische Ersetzungen:**

| Windows | Linux |
|---|---|
| `tasklist /FI "IMAGENAME eq lotroclient*.exe"` | `pgrep -f lotroclient` + `pgrep -f "proton.*212500"` |
| VBScript-Dialoge (wscript.exe) | zenity → kdialog → notify-send + Log |
| Startup-Ordner + 2× VBS | 2× XDG `~/.config/autostart/lotro-death-tracker*.desktop` |
| `npm.cmd` | `npm` |
| PowerShell `Invoke-WebRequest` | `curl -fsSL` |
| `ps` via tasklist (PID-Check) | `ps -p <pid> -o comm=` |

**Installationspfad Linux:** `~/.local/share/lotro-death-tracker/` (XDG Data Home)

**Linux-Commands:**
```bash
bash INSTALL.sh
bash UPDATE.sh
cd ~/.local/share/lotro-death-tracker
npm run install-service / uninstall-service / status / test-service
LOTRO_PATH="/path/to/LOTRO" node client.js
tail -f ~/.local/share/lotro-death-tracker/watcher.log
```

> **KRITISCH:** `getLOTROPath()` ist **viermal** implementiert: `client.js`, Watcher-Template in `install-autostart.js` (`getLotroPath()`), Status-Server-Template in `install-autostart.js` (`getLotroPathCached()`), IIFE in `updater.js`. Bei Änderungen **alle vier Stellen synchron halten!**

---

## Auto-Update-System (ab v2.0)

**Watcher-Update-Ablauf:**
```
Watcher startet
  → checkAndApplyUpdate(): GET api.github.com/repos/DodasWelt/LOTRO-Death-Tracker/releases/latest
  → version.json lesen → vergleichen
  → Update verfügbar:
       → HEAD-Request auf version.json.template (URL-Vorab-Validierung; Fehler → Abbruch)
       → update-staging/ anlegen
       → Alle 4 Dateien laden (.tmp → rename intern)
       → Erst wenn ALLE Downloads OK: atomares renameSync in Produktion
       → update-staging/ löschen
       → updater.js als detached Prozess spawnen (windowsHide: true)
       → Client beenden → Watcher beendet sich
         ↓
  updater.js:
       → isLotroRunning() via tasklist
       → Falls LOTRO läuft: VBScript-Dialog-Kette (windowsHide: false für wscript.exe!)
       → wartet 1s → waitForFile auf install-autostart.js (max 10s)
       → npm install → node install-autostart.js install → version.json aktualisieren
       → getLOTROPath() → Main.lua + DeathTracker.plugin von GitHub laden
       → Abschluss-Dialog (Erfolg oder nummerierte Fehlerliste + Log-Pfad)
       → updater.js löscht sich selbst
```

**Randfälle:** Kein Internet → still überspringen. URL-Validierung fehlgeschlagen → Abbruch. Download-Fehler → staging/ bereinigt, Produktionsdateien unangetastet. Altes update-staging/ beim nächsten Start automatisch aufgeräumt.

---

## Kritische Implementierungsdetails

1. **`windowsHide: true`** — ALLE `exec()` und `spawn()` im Watcher MÜSSEN diese Option haben, sonst öffnet Windows alle 5s ein CMD-Fenster.

2. **Package-Name Konsistenz** — `.plugin`-Datei muss `<Package>DodasWelt.DeathTracker.Main</Package>` enthalten.

3. **`cd /d "%~dp0"`** — Erste aktive Zeile in `INSTALL.bat` und `UPDATE.bat`, sonst scheitern Skripte bei Ausführung aus anderem Verzeichnis.

4. **`copy` statt `xcopy`** — Wildcards mit `xcopy /I` sind unzuverlässig; einzelne Dateien per `copy` kopieren.

5. **chokidar `ignoreInitial: true`** — Client verarbeitet beim Start KEINE bestehenden Dateien, nur neue Änderungen.

6. **Watcher-Template-Escaping** — `createWatcherScript()` ist ein Backtick-Template. Keine verschachtelten Template-Literals im generierten Watcher-Code (String-Konkatenation stattdessen).

7. **`client.js` Auto-Restart** — `CONFIG.autoRestart = true` → Client startet nach uncaught Exception nach 5s neu. chokidar `awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }` verhindert Teillesungen.

8. **`UPDATE.bat` beendet ALLE `node.exe`** — `taskkill /F /IM node.exe /T` trifft jeden Node.js-Prozess auf dem PC. Läuft VOR dem Kopieren der Dateien (Datei-Handles frei), `timeout /t 2` danach.

9. **`UPDATE.bat`/`INSTALL.bat` Node.js-Pfad im Admin-Kontext** — `node` ist bei nvm/User-Installer nicht im Admin-PATH. Beide BAT-Dateien: erst `where node`, dann Fallbacks auf `%PROGRAMFILES%\nodejs\node.exe` und `%USERPROFILE%\AppData\Local\Programs\node\node.exe`. Gespeichert in `%NODE_CMD%`/`%NPM_CMD%`.

10. **`UPDATE.bat`/`INSTALL.bat` Logdatei bei `%~dp0`** — Log landet unter `%~dp0update.log` (nicht `%TEMP%`, da im Admin-Kontext `C:\Windows\Temp`). Schritt 3 entfernt ggf. defektes `node_modules\npm` vor `npm install` (verhindert `MODULE_NOT_FOUND`). Am Ende VBScript-Popup zur Bestätigung.

11. **`vbsDialog()` in `updater.js` — `windowsHide: false` absichtlich** — wscript.exe für VBScript-MsgBox MUSS `windowsHide: false`. Temp-VBS mit `'latin1'`-Encoding (Windows-1252, korrekte Umlaute). Rückgabe: 6=Ja (vbYes), 7=Nein (vbNo), 1=OK.

12. **Watcher Singleton-Lock (`watcher.pid`)** — `acquireLock()` als erstes nach Log-Start. PID aus `watcher.pid`; lebt Prozess (`process.kill(pid, 0)`) → prüft via `spawnSync('tasklist')` ob `node.exe` → nur dann `process.exit(0)`. Stale-Lock → überschreiben. `releaseLock()` löscht nur wenn `pid === process.pid`. **`install()` löscht `watcher.pid` vor Spawn des neuen Watchers** (verhindert Blockierung). Keine Backtick-Template-Literals im Lock-Code.

13. **`goto`-basierte Kontrollstruktur in BAT-Dateien** — Nach jedem `call` sofort `set "EC=%errorLevel%"` (VOR `echo`, da `echo` errorLevel zurücksetzt), dann `if "%EC%" neq "0" goto :error_label`.

14. **H3-Fix: Signal-0-Check für clientProcess** — `clientProcess.killed` ist `false` bei externem Kill durch Antivirus. Deshalb zusätzlich `process.kill(pid, 0)` als Liveness-Check: ESRCH = Prozess tot → `clientProcess = null` + Neustart. **Nur im Watcher-Template** (`createWatcherScript()`).

15. **H7-Fix: Staging in `downloadFileSync()` (`updater.js`)** — Plugin-Dateien zuerst als `.tmp` laden, dann atomar umbenennen. Direktes Schreiben in `Main.lua` kann bei Abbruch eine korrupte Datei hinterlassen → LOTRO markiert Plugin als defekt. Windows: PowerShell `Invoke-WebRequest -OutFile tmp` + `Move-Item -Force`. Linux: `curl -fsSL -o tmp` + `renameSync`.

16. **H6-Fix: npm-Pakete-Existenz-Check nach `npm install` (`updater.js`)** — Prüft ob `chokidar` und `axios` in `node_modules/` existieren. Antivirus kann `npm install` mit Exit-Code 0 beenden, Dateien aber danach löschen → stiller `MODULE_NOT_FOUND`-Crash.

17. **UNINSTALL Self-Copy-Pattern** — `UNINSTALL.bat` prüft ob `%~f0` unter `%TEMP%`. Falls nicht: kopiert sich nach `%TEMP%\LOTRO-DT-uninstall.bat`, startet per `start cmd /c`, beendet sich. Kopie führt alle Schritte durch inkl. `rd /s /q "C:\LOTRO-Death-Tracker\"` und `del "%~f0"`. **Linux analog:** `cp "$0" /tmp/...; bash /tmp/... --from-tmp & exit 0`.

18. **REINSTALL Staging-Pattern** — Lädt GitHub-ZIP nach `%TEMP%\LOTRO-DT-reinstall-[timestamp]\`, kopiert sich nach `%TEMP%\LOTRO-DT-reinstall-runner.bat`, startet Runner detached, beendet sich. Runner: Deinstallation + `INSTALL.bat` aus Staging. Staging erst nach Erfolg löschen — bei Fehler für Diagnose erhalten. Kein Internet → Abbruch vor jedem destructiven Schritt.

19. **Status-Server Dual-Autostart (ab v3.0)** — `install-autostart.js` generiert `start-lotro-status-server.vbs` als zweiten Startup-Eintrag (`LOTRO-Death-Tracker-Status.vbs`). Linux: zweite XDG-Desktop-Datei. Watcher-Tick-Loop überwacht Status-Server via PID-Check, spawnt bei Absturz neu (max. 1× pro Minute, Cooldown-Variable). Beim `install()`: alter Status-Server-Autostart löschen + neu schreiben.
