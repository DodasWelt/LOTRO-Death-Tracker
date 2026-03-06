# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LOTRO Death Tracker — automatisches Death & Level-Up Tracking für Lord of the Rings Online Stream-Overlays. Ab v2.0 über GitHub Releases verteilt.

**Autor:** DodasWelt / Herrin Inge | **Website:** https://www.dodaswelt.de | **GitHub:** https://github.com/DodasWelt/LOTRO-Death-Tracker

> **Hinweis:** `LOTRO-Death-Tracker-COMPLETE-SUMMARY.md` enthält veraltete Code-Snippets (ältere Architektur). Die maßgeblichen Quellen sind die tatsächlichen Dateien im Repository.
> **Schlüsseldokumente:** `PROJEKTPLAN-v2.0.md` — Feature-Planung mit Aufwand/Status aller Themen. `RISIKOANALYSE-v2.0.md` — v2.1-Analyse + v1.5→v2.1-Verteilungsrisiken. `RISIKOANALYSE-v2.3.md` — v2.3-Analyse + Auto-Update v2.0→v2.3-Risiken.

### Repository-Struktur

| Pfad | Zweck | Wo deployed |
|---|---|---|
| `Client/` | Node.js Client (Watcher, Installer, Updater) | `C:\LOTRO-Death-Tracker\` auf Streamer-PC |
| `LOTRO-Plugin/` | Lua Plugin für LOTRO | `Documents\...\Plugins\DodasWelt\` |
| `WordPress/lotro-death-tracker.php` | WordPress REST API Plugin | `dodaswelt.de` WP-Plugin-Verzeichnis |
| `Overlay/streamelements-overlay-minimalist.html` | Stream-Overlay (Prod) | StreamElements Custom Widget |
| `Overlay/streamelements-overlay-test.html` | Test-Overlay (lokal öffenbar) | Lokaler Browser / OBS (nur für Tests) |
| `Website/lotro-data-fetcher.js` | JS-Bibliothek für Website-Integration | `herrin-inge.de` via jsDelivr CDN |
| `INSTALL.bat` | Erstinstallation für Streamer | Im Distributions-ZIP |
| `UPDATE.bat` | Upgrade v1.5 → v2.3 für bestehende Nutzer | Im Distributions-ZIP |

---

## Development Commands

```bash
# Dependencies installieren (im Client-Verzeichnis)
cd C:\LOTRO-Death-Tracker
npm install

# Client manuell starten (zum Testen)
npm start
# oder: node client.js

# Env-Overrides für Tests:
# SERVER_URL=https://... LOTRO_PATH=C:\... node client.js

# Autostart verwalten
npm run install-service    # In Windows Startup-Ordner installieren
npm run uninstall-service  # Aus Startup-Ordner entfernen
npm run status             # Installationsstatus prüfen
npm run test-service       # Watcher sichtbar im Vordergrund testen

# Logs live verfolgen (PowerShell)
Get-Content C:\LOTRO-Death-Tracker\client.log -Wait -Tail 20
Get-Content C:\LOTRO-Death-Tracker\watcher.log -Wait -Tail 20

# API manuell testen (PowerShell)
Invoke-RestMethod -Uri "https://www.dodaswelt.de/wp-json/lotro-deaths/v1/health" -Method GET

# Plugin im Spiel laden
/plugins load DodasWelt.DeathTracker
```

---

## Architecture

### Data Flow

```
LOTRO (Spiel)
  └─ Main.lua (Lua Plugin)
       │  MoraleChanged / LevelChanged Event-Handler
       │  Turbine.PluginData.Save(..., "DeathTracker_Sync", syncData)
       ▼
  PluginData\[Server]\[Character]\DeathTracker_Sync.plugindata
       │  (Lua table format, NICHT JSON)
       ▼
  client.js (Node.js, chokidar file watcher)
       │  parseLuaTable() → extrahiert JSON-String aus "content" Feld
       │  Setzt echte Systemzeit (de-DE Locale) statt "TIMESTAMP"
       │  axios.post(...)
       ▼
  WordPress API (https://www.dodaswelt.de/wp-json/lotro-deaths/v1/)
       ▼
  StreamElements Overlay (pollt /current alle 3 Sekunden)
```

### Komponenten & Dateipfade

**LOTRO Plugin** (Lua):
- `LOTRO-Plugin/DodasWelt/DeathTracker.plugin` — Plugin-Manifest (Package: `DodasWelt.DeathTracker.Main`)
- `LOTRO-Plugin/DodasWelt/DeathTracker/Main.lua` — Haupt-Logik (event-driven via MoraleChanged/LevelChanged)
- Installationspfad: `C:\Users\[USER]\Documents\The Lord of the Rings Online\Plugins\DodasWelt\`

**Node.js Client**:
- `Client/client.js` — File-Watcher & API-Sender
- `Client/install-autostart.js` — Generiert `lotro-watcher.js` + `start-lotro-watcher.vbs` dynamisch, kopiert VBS in Startup-Ordner
- `Client/updater.js` — Wird vom Watcher nach erkanntem Update gespawnt; prüft zunächst ob LOTRO läuft (VBScript-Dialog bei Bedarf), wartet 1s, prüft dann per `waitForFile()` ob `install-autostart.js` lesbar ist (max 10s), führt `npm install` + `install-autostart.js install` aus, schreibt `version.json`, löscht sich selbst
- `Client/version.json.template` — Template für installierte Version (wird bei Installation zu `version.json` kopiert)
- `Client/package.json`
- Installationspfad: `C:\LOTRO-Death-Tracker\`
- Logs: `C:\LOTRO-Death-Tracker\client.log`, `C:\LOTRO-Death-Tracker\watcher.log`

**Installer / Updater**:
- `INSTALL.bat` — Erstinstallation: kopiert Plugin + Client, `npm install`, `install-autostart.js install`
- `UPDATE.bat` — Upgrade von v1.5: stoppt alten Autostart, ersetzt Dateien, `npm install`, Plugin + Autostart neu

### Autostart-System

`install-autostart.js` generiert zwei Dateien dynamisch (NICHT versioniert, zur Laufzeit erstellt):
- `lotro-watcher.js` — Prüft alle 5 Sekunden ob `lotroclient64.exe`/`lotroclient.exe` läuft, startet/stoppt `client.js` entsprechend. Enthält außerdem `checkAndApplyUpdate()`: einmaliger GitHub-API-Aufruf beim Start, bei neuerer Version Download + Spawn von `updater.js` + Selbstbeendigung.
- `start-lotro-watcher.vbs` — Startet den Watcher unsichtbar (kein Konsolenfenster)

Die VBS-Datei wird nach `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\LOTRO-Death-Tracker.vbs` kopiert.

### Auto-Update-System (ab v2.0)

**Watcher-Update-Ablauf:**
```
Watcher startet
  → checkAndApplyUpdate(): GET api.github.com/repos/DodasWelt/LOTRO-Death-Tracker/releases/latest
  → version.json lesen → vergleichen
  → Kein Update: normal weiter (LOTRO-Check-Loop)
  → Update verfügbar:
       → HEAD-Request auf version.json.template zur URL-Vorab-Validierung
       → Bei Fehler: Update abgebrochen, Watcher läuft weiter
       → update-staging/ anlegen
       → Alle 4 Dateien nach update-staging/ laden (downloadRaw, je .tmp → rename intern)
       → Erst wenn ALLE Downloads OK: atomares renameSync in Produktion
       → update-staging/ löschen
       → updater.js als detached Prozess spawnen (windowsHide: true)
       → Client-Prozess beenden (falls läuft)
       → Watcher beendet sich
         ↓
  updater.js:
       → isLotroRunning() via tasklist (spawnSync, windowsHide: true)
       → Falls LOTRO läuft: VBScript-Dialog (windowsHide: false!)
           "Wurde LOTRO bereits beendet?" Ja → weiter | Nein →
           "Soll LOTRO jetzt beendet werden?" Ja → taskkill + weiter | Nein →
           Hinweis-Dialog (OK bestätigen) + process.exit(0)
       → wartet 1s (Watcher-Prozess komplett beendet)
       → waitForFile auf install-autostart.js (max 10s)
       → npm install  (Fehler → errors[])
       → node install-autostart.js install (Fehler → errors[])
       → version.json aktualisieren (Fehler → errors[])
       → getLOTROPath() → Main.lua + DeathTracker.plugin von GitHub laden → in Plugin-Verzeichnis kopieren
           (Fehler → errors[], aber nicht fatal — Client-Update bleibt erfolgreich)
       → Abschluss-Dialog: Erfolg (Info-Icon) ODER Fehlerliste nummeriert + Log-Pfad (Critical-Icon)
       → updater.js löscht sich selbst
```

**Randfälle:** Kein Internet / GitHub nicht erreichbar → still überspringen. URL-Validierung schlägt fehl (Tag existiert nicht) → Update abgebrochen. Download-Fehler → update-staging/ wird bereinigt, Produktionsdateien bleiben komplett unangetastet. Beim nächsten Watcher-Start wird ein altes update-staging/ automatisch aufgeräumt.

### PluginData Format

Das Plugin speichert via `Turbine.DataScope.Character` zwei **Lua-Tabellen** (nicht JSON):

**`DeathTracker_Sync.plugindata`** — wird von `client.js` gelesen:
```
{
  ["lastUpdate"] = 1234567890.0,
  ["eventType"] = "death",
  ["content"] = "{\"characterName\":\"Dodaman\",\"eventType\":\"death\",\"race\":\"Hobbit\",\"characterClass\":\"Schurke\",...}",
  ["version"] = "2.1",
}
```

**`DeathTracker_State.plugindata`** (ab v2.4) — wird vom Watcher gelesen:
```
{
  ["totalDeathsTrackedLocally"] = 42.0,
}
```
Enthält den kumulierten Todes-Zähler über alle Sessions. Wird vom Watcher in `syncLocalDeaths()` genutzt, um fehlende Tode (z. B. Client nicht gestartet) zu erkennen und still nachzutragen. Referenzpfad: `[LotroPath]/PluginData/[Server]/[Charakter]/DeathTracker_State.plugindata`

**`Client/deaths.local.json`** (ab v2.4) — Watcher-seitig:
```json
{
  "characters": {
    "Inge": { "baselineServer": 40, "firstSeenAt": "2026-03-06T11:00:00.000Z" }
  }
}
```
Speichert den DB-Todesstand zum Zeitpunkt der Erst-Erkennung. Formel: `missing = currentPlugin - (currentServer - baselineServer)`.

### Race/Class Enum-Werte (ab v2.1)

`GetRace()` und `GetClass()` liefern numerische Werte. Mapping-Tabellen in `Main.lua`:

| Völker | | Klassen | |
|--------|---|---------|---|
| 23 = Mensch | 117 = Hochelb | 23 = Wächter | 185 = Kundiger |
| 65 = Elb | 120 = Stark-Axt | 24 = Hauptmann | 193 = Runenbewahrer |
| 73 = Zwerg | 125 = Fluss-Hobbit | 31 = Barde | 194 = Hüter |
| 81 = Hobbit | | 40 = Schurke | 214 = Beorninger |
| 114 = Beorninger | | 162 = Jäger | 215 = Schläger |
| | | 172 = Waffenmeister | 216 = Seefahrer |

Quelle: LotroCompanion/lotro-data (lore/races.xml + lore/classes.xml), **noch nicht live in-game verifiziert** (→ RISIKOANALYSE-v2.0.md P1-A). Falsches Mapping landet still als `"Unknown"` in der DB.
Das `content`-Feld ist ein escaped JSON-String. Der Client unescaped mit `.replace(/\\"/g, '"')` vor `JSON.parse()`.

### Duplikat-Schutz

Client: `syncData.lastUpdate > lastProcessedTimestamp` — überspringt bereits verarbeitete Events.
Plugin: `isPlayerDead`-Flag (Todeszustand) + `lastDeathWasLogged`-Flag (verhindert Doppel-Log) — wird erst bei Revive (Morale > 0) zurückgesetzt.

### Timestamps

LOTRO liefert Spielzeit via `Turbine.Engine.GetGameTime()`. Das Plugin schreibt `"TIMESTAMP"` als Platzhalter für date/time-Felder. `client.js` ersetzt diese mit echter Systemzeit im de-DE-Locale-Format.

---

## Kritische Implementierungsdetails

1. **`windowsHide: true`** — ALLE `exec()` und `spawn()` Aufrufe im Watcher MÜSSEN diese Option haben, sonst öffnet Windows alle 5 Sekunden ein CMD-Fenster.

2. **Package-Name Konsistenz** — `.plugin`-Datei muss `<Package>DodasWelt.DeathTracker.Main</Package>` enthalten (entspricht `Main.lua` Dateiname).

3. **`cd /d "%~dp0"`** — Muss als erste aktive Zeile in `INSTALL.bat` und `UPDATE.bat` stehen, sonst scheitern die Skripte bei Ausführung aus einem anderen Verzeichnis.

4. **`copy` statt `xcopy`** — Wildcards mit `xcopy /I` sind unzuverlässig; immer einzelne Dateien per `copy` kopieren.

5. **chokidar `ignoreInitial: true`** — Der Client verarbeitet beim Start KEINE bestehenden Dateien, nur neue Änderungen.

6. **`POST /death/next` erwartet `id`** — Das Overlay sendet `{ id: deathId }`. Der Server markiert nur den Eintrag als gezeigt, dessen ID übereinstimmt. Ohne ID-Angabe fällt er auf den ältesten unverarbeiteten Eintrag zurück (Rückwärtskompatibilität).

7. **CORS nur auf eigene Routen** — `add_cors_headers()` prüft `$_SERVER['REQUEST_URI']` auf `/wp-json/lotro-deaths/` und kehrt sonst sofort zurück. Nicht auf alle WP-Seiten ausweiten.

8. **Watcher-Template-Escaping** — `createWatcherScript()` in `install-autostart.js` ist ein Backtick-Template. Keine verschachtelten Template-Literals im generierten Watcher-Code verwenden (String-Konkatenation stattdessen), da sonst Escape-Hölle entsteht.

9. **WP Plugin ZIP-Struktur** — Das `lotro-death-tracker.zip` Release-Asset muss den Plugin-Ordner direkt enthalten: `lotro-death-tracker/lotro-death-tracker.php`. Nur dann funktioniert der WordPress-Update-Mechanismus korrekt.

10. **`POST /death` hat keinen `data`-Wrapper** — Die GET-Endpoints `/death/current` und `/death/next` antworten mit `{ success, data: {...}, queueLength }`. Der POST-Endpoint `/death` antwortet dagegen direkt mit `{ success, message, queuePosition, deathCount, id }` ohne `data`-Unterobjekt. In `client.js` also `response.data.queuePosition` (nicht `response.data.data.queuePosition`).

11. **`client.js` Auto-Restart** — `CONFIG.autoRestart = true` bewirkt, dass der Client nach einem uncaught Exception nach 5 Sekunden automatisch neu startet. chokidar verwendet `awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }` — Dateiänderungen werden erst verarbeitet, wenn die Datei 500 ms lang nicht mehr beschrieben wird (verhindert Teillesungen).

12. **`UPDATE.bat` beendet ALLE `node.exe`** — `taskkill /F /IM node.exe /T` in Schritt 1 trifft nicht nur Watcher/Client, sondern jeden Node.js-Prozess auf dem PC. Danach startet `install-autostart.js install` den neuen Watcher sofort — Windows-Neustart ist nicht mehr erforderlich. Beim Modifizieren von UPDATE.bat darauf achten: `taskkill` läuft VOR dem Kopieren der Dateien (damit Datei-Handles freigegeben sind), `timeout /t 2` gibt Windows Zeit zur Aufräumung.

13. **`UPDATE.bat`/`INSTALL.bat` Node.js-Pfad im Admin-Kontext** — `node` ist bei benutzerweiten Installationen (nvm, User-Installer) nicht im Admin-PATH. Beide BAT-Dateien erkennen Node.js aktiv: erst `where node`, dann Fallback auf `%PROGRAMFILES%\nodejs\node.exe` und `%USERPROFILE%\AppData\Local\Programs\node\node.exe`. Gefundener Pfad wird in `%NODE_CMD%`/`%NPM_CMD%` gespeichert; alle nachfolgenden Aufrufe nutzen diese Variablen. Nicht gefunden → `INSTALL.bat` öffnet Browser mit Node.js-Installer-URL + Neustart-Hinweis; `UPDATE.bat` zeigt manuelle Anleitung + `pause`.

14. **`UPDATE.bat`/`INSTALL.bat` Logdatei bei `%~dp0`** — Das Log landet unter `%~dp0update.log` bzw. `%~dp0install.log` (= Verzeichnis der BAT-Datei), **nicht** in `%TEMP%`. Grund: `%TEMP%` zeigt im Admin-Kontext auf `C:\Windows\Temp`, nicht auf den Nutzer-Temp-Ordner. Die Logdatei wird weder bei Erfolg noch bei Fehler gelöscht. Schritt 3 (`npm install`) entfernt zuvor ein ggf. vorhandenes defektes `node_modules\npm`-Verzeichnis (Ursache für `MODULE_NOT_FOUND`-Fehler mit lokalem npm), bevor der globale `NPM_CMD` aufgerufen wird. Am Ende erscheint ein VBScript-Popup (`cscript //nologo`) zur Bestätigung — dieses blockt das Skript und ist sichtbar, auch wenn das CMD-Fenster sich danach schließt.

15. **`vbsDialog()` in `updater.js` — `windowsHide: false` ist absichtlich** — Der Updater wird zwar mit `windowsHide: true` gespawnt (läuft unsichtbar), aber `wscript.exe` für VBScript-MsgBox-Dialoge MUSS mit `windowsHide: false` aufgerufen werden. VBScript-Dialoge erscheinen trotzdem sichtbar, auch wenn der Elternprozess versteckt ist. Die temporäre VBS-Datei (`_upd_dlg.vbs`) wird mit `'latin1'`-Encoding geschrieben, damit deutsche Umlaute (Windows-1252) korrekt dargestellt werden. Rückgabewerte: 6=Ja (vbYes), 7=Nein (vbNo), 1=OK.

16. **Watcher Singleton-Lock (`watcher.pid`)** — `acquireLock()` wird als **erstes** nach den Log-Startmeldungen aufgerufen (vor `checkAndApplyUpdate()`). Liest PID aus `watcher.pid`; existiert die Datei und lebt der Prozess (`process.kill(pid, 0)` ohne Exception) → prüft via `spawnSync('tasklist', ['/FI', 'PID eq X', ...])` ob der Prozess auch `node.exe` ist (PID-Wiederverwendungs-Schutz) → nur dann `process.exit(0)`. Stale-Lock (ESRCH oder fremder Prozess) → überschreiben. `releaseLock()` löscht die Datei nur wenn `pid === process.pid` (verhindert Race bei schnellem Neustart). Wird in SIGINT, SIGTERM und `process.on('exit', ...)` aufgerufen. **`install-autostart.js install()` löscht `watcher.pid` vor dem Spawn des neuen Watchers** (verhindert Blockierung bei Mehrfachaufruf). Generiert in `createWatcherScript()` — keine Backtick-Template-Literals im Lock-Code verwenden (nur String-Konkatenation).

17. **`goto`-basierte Kontrollstruktur in BAT-Dateien** — Multi-line `if (...) else (...)` Blöcke nach `call`-Befehlen können CMD dazu bringen, das Skript still abzubrechen (kein Fehlercode, kein Output). Deshalb: nach jedem `call` sofort `set "EC=%errorLevel%"` (noch VOR dem nächsten `echo`, da `echo` `%errorLevel%` zurücksetzt), dann `if "%EC%" neq "0" goto :error_label`. Dieses Muster ist in INSTALL.bat und UPDATE.bat konsequent durchgezogen.

18. **`with_test_tables()` in WP-Plugin** — Tauscht `$this->table_deaths` / `$this->table_characters` temporär gegen die `_test`-Varianten für die Dauer eines Callbacks. PHP ist single-threaded pro Request, daher race-condition-frei. `api_test_clear()` nutzt `TRUNCATE` statt `DELETE` — setzt Auto-Increment zurück.

---

## API Endpoints (dodaswelt.de)

```
POST   /wp-json/lotro-deaths/v1/death             # Event senden (death ODER levelup)
GET    /wp-json/lotro-deaths/v1/death/current     # Ältester unverarbeiteter Death
POST   /wp-json/lotro-deaths/v1/death/next        # Aktuellen als gezeigt markieren, nächsten holen
POST   /wp-json/lotro-deaths/v1/death/silent      # Fehlende Tode still nachtragen (processed=1, kein Overlay)
GET    /wp-json/lotro-deaths/v1/queue             # Queue-Status
GET    /wp-json/lotro-deaths/v1/history           # History (?limit=N, ?character=Name)
GET    /wp-json/lotro-deaths/v1/characters        # Alle Characters mit Level + Todes-Statistiken
GET    /wp-json/lotro-deaths/v1/health            # System-Status
GET    /wp-json/lotro-deaths/v1/streamers         # Alle Streamer mit LOTRO-Stats (für herrin-inge.de)
POST   /wp-json/lotro-deaths/v1/streamers/mapping # Mapping hinzufügen/aktualisieren [Admin-Auth]
DELETE /wp-json/lotro-deaths/v1/streamers/mapping # Mapping löschen [Admin-Auth]
```

**Response-Format `POST /death` (kein `data`-Wrapper!):**
```json
{ "success": true, "message": "Death event queued", "queuePosition": 1, "deathCount": 5, "id": 42 }
```

**Response-Format GET `/death/current` und POST `/death/next` (mit `data`-Wrapper):**
```json
{ "success": true, "data": { "id": 1, "characterName": "...", "level": 10, "deathCount": 5, "date": "...", "time": "...", "datetime": "...", "region": "..." }, "queueLength": 2 }
```

**levelup-Events** werden vom PHP nicht in die Queue eingetragen – nur der `current_level` in `wp_lotro_characters` wird aktualisiert.

---

## Datenbankstruktur (WordPress)

- `wp_lotro_deaths` – Death-Queue: Spalten `id, character_name, level, event_type, death_count, death_date, death_time, death_datetime, region, race, character_class, timestamp, received_at, processed, shown_at`
- `wp_lotro_characters` – Charakter-Statistiken: `character_name, current_level, total_deaths, race, character_class, last_seen`
- `wp_lotro_streamer_mapping` – Zuordnung: `twitch_username, character_name, display_name, race, character_class` (UNIQUE auf `twitch_username` und `character_name`)

DB-Migration läuft automatisch via `maybe_upgrade()` (`plugins_loaded`-Hook), gesteuert über WP-Option `lotro_death_tracker_db_version` (aktuell `2.1`).

**Kritisch:** `dbDelta` fügt bei bestehenden Tabellen manchmal keine neuen Spalten hinzu. Deshalb enthält `create_tables()` nach `dbDelta` einen expliziten `SHOW COLUMNS`-Check mit `ALTER TABLE` als Fallback. Bei jeder neuen Spalte **muss** dieser Block erweitert werden. Die DB-Version in `$db_version` muss bei jeder Schema-Änderung erhöht werden, damit `maybe_upgrade()` die Migration erneut ausführt.

**Datenmigration (einmalig):** Das `INSERT INTO wp_lotro_characters … SELECT FROM wp_lotro_deaths` in `create_tables()` läuft nur einmalig, geschützt durch die separate WP-Option `lotro_death_tracker_data_migration` (`'0'` → `'1'`). Diese Option ist unabhängig von `$db_version`, damit zukünftige Schema-Bumps die Migration nicht erneut auslösen.

**Reihenfolge in `api_submit_event`:** Erst `INSERT` in `wp_lotro_deaths`, dann `upsert_character`. Nicht umkehren – sonst wird der Todes-Counter erhöht, auch wenn der Queue-Eintrag fehlschlägt.

---

## Audio-Logik im Overlay

| Situation | Sound |
|---|---|
| Normaler Tod (deathCount nicht durch 5 teilbar) | `Trauerlied_1.mp3` |
| Meilenstein-Tod (5., 10., 15., … = `deathCount % 5 === 0`) | zufällig `Alert_1.mp3` **oder** `Alert_2.mp3` |

Audio-URLs: `https://www.dodaswelt.de/lotro/` + Dateiname. Konfiguriert in `CONFIG.SOUND_URL` und `CONFIG.ALERT_SOUND_URLS` im Overlay.

### Overlay-Anzeige

Das Overlay zeigt pro Death-Event für `DISPLAY_DURATION` (Standard: 10 Sekunden):
- `GEFALLEN` (Titel, animiert)
- Charakter-Name
- `Level N`
- `N Mal gestorben` ← Todes-Zähler aus `death.deathCount`

**Mapping-Filter:** Beim Start (und alle 5 Minuten) holt das Overlay `/streamers` und baut intern ein `Set` der gemappten Charakternamen auf. Deaths von Charakteren, die **nicht** im Set sind, werden per `skipDeath()` still übersprungen (`/death/next` aufrufen, nicht anzeigen) und der nächste Eintrag sofort geprüft. Ist das Set leer (API nicht erreichbar beim Start), wird kein Filter angewendet (fail-open).

Der Filter greift in **beiden** Pfaden: im regulären Polling-Loop (`checkForDeaths`) und im Queue-Vorschub nach einer Anzeige (`advanceQueue`). Nur so ist sichergestellt, dass auch direkt aufeinanderfolgende Tode korrekt gefiltert werden.

### lotro-data-fetcher.js (Website-Integration)

IIFE-Modul-Pattern — wird als `LOTROData` global verfügbar. Öffentliche API:
- `LOTROData.getCurrentCharacter(name?)` → letzter aktiver Charakter (via `/characters`, geordnet nach `last_seen DESC`)
- `LOTROData.getLatestDeath(name?)` → letzter verarbeiteter Tod aus History
- `LOTROData.getAllDeaths(limit?, name?)` → mehrere Einträge aus History
- `LOTROData.getAllCharacters()` → alle Charaktere mit Level + Todes-Statistiken
- `LOTROData.getStats()` → Gesamtstatistiken via `/health`
- `LOTROData.watchForUpdates(callback, interval?)` → ruft Callback bei jedem neuen Tod auf (Standard: 30 s)
- `LOTROData.getAllStreamers()` → alle Streamer mit LOTRO-Stats aus `/streamers` (für `#tode`/`#teilnehmer`)
- `LOTROData.getStreamer(twitchUsername)` → Stats für einen einzelnen Streamer
- `LOTROData.watchStreamers(callback, interval?)` → Callback bei Änderungen (Deaths/Level), Standard: 60 s
- `LOTROData.setApiUrl(url)` → API-URL für andere Umgebungen überschreiben

---

## Distribution & Releases

### GitHub Releases (ab v2.0)

Jeder Release enthält zwei ZIP-Assets:

| Asset | Inhalt | Für wen |
|---|---|---|
| `LOTRO-Death-Tracker-vX.Y.zip` | `Client/`, `LOTRO-Plugin/`, `INSTALL.bat`, `UPDATE.bat`, `ANLEITUNG.md` | Streamer (Erst- und Upgrade-Installation) |
| `lotro-death-tracker.zip` | `lotro-death-tracker/lotro-death-tracker.php` | WordPress Auto-Update-Mechanismus |

**Release erstellen** (wenn der Nutzer es mitteilt):
```bash
# 1. Staging-Verzeichnis mit Top-Level-Ordner anlegen (ZIP muss Ordner enthalten!)
mkdir -p LOTRO-Death-Tracker-vX.Y
cp -r Client LOTRO-Plugin INSTALL.bat UPDATE.bat ANLEITUNG.md LOTRO-Death-Tracker-vX.Y/

# 2. Streamer-ZIP erstellen
python3 -c "
import shutil, os
shutil.make_archive('LOTRO-Death-Tracker-vX.Y', 'zip', '.', 'LOTRO-Death-Tracker-vX.Y')
"

# 3. WP-Plugin-ZIP erstellen (muss Struktur lotro-death-tracker/lotro-death-tracker.php haben)
mkdir -p lotro-death-tracker
cp WordPress/lotro-death-tracker.php lotro-death-tracker/
python3 -c "import shutil; shutil.make_archive('lotro-death-tracker', 'zip', '.', 'lotro-death-tracker')"

# 4. GitHub Release + Tag anlegen
gh release create vX.Y \
  --title "vX.Y – ..." \
  --notes "..." \
  LOTRO-Death-Tracker-vX.Y.zip \
  lotro-death-tracker.zip

# 5. Aufräumen
rm -rf LOTRO-Death-Tracker-vX.Y lotro-death-tracker
```

### LOTRO-Pfad-Erkennung (INSTALL.bat, UPDATE.bat, client.js)

Prüfreihenfolge:
1. Registry: `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders\Personal`
2. OneDrive: `%USERPROFILE%\OneDrive\Documents\The Lord of the Rings Online`
3. Standard: `%USERPROFILE%\Documents\The Lord of the Rings Online`
4. **Nur INSTALL.bat:** Manuelle Eingabe via `SET /P` (Erstinstallation akzeptiert interaktiven Input)
   **UPDATE.bat:** Plugin-Update wird still übersprungen (Warnung + manuelle Kopieranleitung, kein Input-Prompt)

StreamElements Overlay URL (für Streamer): `https://streamelements.com/overlay/699101f20ad2498d64a6c71e/OK0Fv1s0HutgMqmZixPH` (1920×1080)

---

## Versionierungsstrategie (ab v2.0)

- **Schema:** `MAJOR.MINOR` (z. B. `2.0`, `2.1`, `2.2`)
- Jedes neue Feature = neue Minor-Version. Kein Patch-Level für End-Nutzer.
- GitHub Releases sind die maßgebliche Quelle (Tag-Format: `v2.0`, `v2.1` usw.).
- `$db_version` muss bei jeder DB-Schemaänderung auf die aktuelle Minor-Version gesetzt werden.

Bei jedem Release alle Versionsnummern synchron halten (Beispiel für vX.Y):

| Datei/Feld | Pflicht |
|---|---|
| PHP Plugin-Header `Version:` | auf `X.Y` setzen |
| PHP `$db_version` | nur erhöhen bei DB-Schema-Änderung |
| PHP User-Agent in `check_for_update()` | auf `'LOTRO-Death-Tracker-WP/X.Y'` setzen |
| `Client/package.json` `"version"` | auf `"X.Y"` setzen |
| `Client/version.json.template` | auf `{ "version": "X.Y" }` setzen |
| `Client/client.js` Header-Kommentar | auf `Version: X.Y` setzen |
| `LOTRO-Plugin/DeathTracker.plugin` `<Version>` | auf `X.Y` setzen |
| `LOTRO-Plugin/Main.lua` Kommentar + Config | auf `"X.Y"` setzen |
| `INSTALL.bat` Erfolgsmeldung `Installierte Version:` | auf `X.Y` setzen |
| `UPDATE.bat` Erfolgsmeldung `Installierte Version:` | auf `X.Y` setzen |
| `ANLEITUNG.md` Versionsnummer im Titel + Update-Abschnitt | auf `X.Y` setzen |
| Git-Tag | `vX.Y` |

> **Aktueller Stand:** Code-Stand und letzter GitHub-Release sind **v2.4** (released 2026-03-06).

## WordPress Plugin Auto-Update

Ab v2.0 über normalen WordPress-Update-Mechanismus. Technisch:
- `pre_set_site_transient_update_plugins`-Filter → `check_for_update()`: fragt GitHub API ab, cached 12h via WP-Transient (`lotro_death_tracker_update_info`)
- `plugins_api`-Filter → `plugin_info()`: liefert Details für WP-Update-Popup
- Sucht nach Release-Asset `lotro-death-tracker*.zip` (muss Struktur `lotro-death-tracker/lotro-death-tracker.php` haben)

## lotro-data-fetcher.js — CDN-Einbindung

Einbindung auf `herrin-inge.de` via jsDelivr:
```html
<script src="https://cdn.jsdelivr.net/gh/DodasWelt/LOTRO-Death-Tracker@v2.3/Website/lotro-data-fetcher.js"></script>
```
Bei neuem Release: `@v2.3` → `@v2.4` (usw.) im Script-Tag aktualisieren.

---

## Test-Umgebung (ab v2.2)

### Zweck
End-to-End-Tests ohne Produktionsdaten zu berühren. Testdaten landen in separaten DB-Tabellen (`wp_lotro_deaths_test`, `wp_lotro_characters_test`) und werden nach dem Test explizit geleert.

### Test-Endpunkte

```
POST   /wp-json/lotro-deaths/v1/test/death          # Test-Event senden
GET    /wp-json/lotro-deaths/v1/test/death/current  # Ältester unverarbeiteter Test-Eintrag
POST   /wp-json/lotro-deaths/v1/test/death/next     # Test-Eintrag als gezeigt markieren
GET    /wp-json/lotro-deaths/v1/test/queue          # Test-Queue-Status
GET    /wp-json/lotro-deaths/v1/test/health         # Test-API-Status
DELETE /wp-json/lotro-deaths/v1/test/clear          # Testtabellen leeren [Admin-Auth]
```

### Client im Test-Modus starten

```bash
# Env-Override – schickt Events an Test-Endpunkt
SERVER_URL=https://www.dodaswelt.de/wp-json/lotro-deaths/v1/test/death node client.js
```

### Test-Overlay

`Overlay/streamelements-overlay-test.html` — kann lokal im Browser geöffnet werden (Doppelklick). Enthält:
- Sichtbare TEST-MODE-Badge (rot)
- Keine Sounds
- Kein Streamer-Filter (alle Test-Events werden angezeigt)
- Kürzere Anzeigedauer (6 s statt 10 s)
- Status-Zeile mit Queue-Info

### Nach dem Test aufräumen

```powershell
# Testtabellen leeren (PowerShell, Admin-Credentials erforderlich)
Invoke-RestMethod -Uri "https://www.dodaswelt.de/wp-json/lotro-deaths/v1/test/clear" `
  -Method DELETE `
  -Headers @{ Authorization = "Basic " + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("user:apppassword")) }
```

### Implementierungsdetails

- `with_test_tables(callable $fn)` in `lotro-death-tracker.php`: tauscht `$this->table_deaths`/`$this->table_characters` temporär gegen die `_test`-Varianten und ruft `$fn()` auf. Da PHP single-threaded pro Request ist, ist das Swapping sicher.
- Teste Tabellen werden in `create_tables()` angelegt (gleiche Schema via `str_replace` auf den SQL-Strings). `SHOW COLUMNS`-Fallback läuft für beide Tabellen-Gruppen.
- `api_test_clear()` nutzt `TRUNCATE` (nicht DELETE) → schneller, setzt Auto-Increment zurück.
