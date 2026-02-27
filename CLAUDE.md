# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LOTRO Death Tracker — automatisches Death & Level-Up Tracking für Lord of the Rings Online Stream-Overlays. Verteilt als `LOTRO-Death-Tracker-v5.zip` an Streamer.

**Autor:** DodasWelt / Herrin Inge | **Website:** https://www.dodaswelt.de

> **Hinweis:** `LOTRO-Death-Tracker-COMPLETE-SUMMARY.md` enthält veraltete Code-Snippets (ältere Architektur: JSON-Datei, Class-basierter Fetcher, Polling-Loop). Die maßgeblichen Quellen sind die tatsächlichen Dateien im ZIP und in diesem Repository.

### Dateien in diesem Repository

| Datei | Zweck | Wo deployed |
|---|---|---|
| `LOTRO-Death-Tracker-v5.zip` | Distributions-Paket für Streamer | An Streamer weitergeben |
| `lotro-death-tracker.php` | WordPress REST API Plugin | `dodaswelt.de` WP-Plugin-Verzeichnis |
| `streamelements-overlay-minimalist.html` | Stream-Overlay (HTML/CSS/JS) | StreamElements Custom Widget |
| `lotro-data-fetcher.js` | JS-Bibliothek für Website-Integration | `herrin-inge.de` eingebunden |

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
- `Client/install-autostart.js` — Erstellt `lotro-watcher.js` + `start-lotro-watcher.vbs` dynamisch und kopiert VBS in Windows Startup-Ordner
- `Client/package.json`
- Installationspfad: `C:\LOTRO-Death-Tracker\`
- Logs: `C:\LOTRO-Death-Tracker\client.log`, `C:\LOTRO-Death-Tracker\watcher.log`

**Installer**:
- `INSTALL.bat` — Kopiert Plugin + Client, führt `npm install` und `node install-autostart.js install` aus

### Autostart-System

`install-autostart.js` generiert zwei Dateien dynamisch (werden NICHT versioniert, sondern zur Laufzeit erstellt):
- `lotro-watcher.js` — Prüft alle 5 Sekunden ob `lotroclient64.exe`/`lotroclient.exe` läuft, startet/stoppt `client.js` entsprechend
- `start-lotro-watcher.vbs` — Startet den Watcher unsichtbar (kein Konsolenfenster)

Die VBS-Datei wird nach `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\LOTRO-Death-Tracker.vbs` kopiert.

### PluginData Format

Das Plugin speichert via `Turbine.DataScope.Character` eine **Lua-Tabelle** (nicht JSON). `client.js` parst dies mit `parseLuaTable()`:
```
{
  ["lastUpdate"] = 1234567890.0,
  ["eventType"] = "death",
  ["content"] = "{\"characterName\":\"Dodaman\",\"eventType\":\"death\",...}",
  ["version"] = "2.0.0",
}
```
Das `content`-Feld ist ein escaped JSON-String. Der Client unescaped mit `.replace(/\\"/g, '"')` vor `JSON.parse()`.

### Duplikat-Schutz

Client: `syncData.lastUpdate > lastProcessedTimestamp` — überspringt bereits verarbeitete Events.
Plugin: `isPlayerDead`-Flag (Todeszustand) + `lastDeathWasLogged`-Flag (verhindert Doppel-Log) — wird erst bei Revive (Morale > 0) zurückgesetzt.

### Timestamps

LOTRO liefert Spielzeit via `Turbine.Engine.GetGameTime()`. Das Plugin schreibt `"TIMESTAMP"` als Platzhalter für date/time-Felder. `client.js` ersetzt diese mit echter Systemzeit im de-DE-Locale-Format.

---

## Kritische Implementierungsdetails

1. **`windowsHide: true`** — ALLE `exec()` und `spawn()` Aufrufe im Watcher MÜSSEN diese Option haben, sonst öffnet Windows alle 5 Sekunden ein CMD-Fenster.

2. **Package-Name konsistenz** — `.plugin`-Datei muss `<Package>DodasWelt.DeathTracker.Main</Package>` enthalten (entspricht `Main.lua` Dateiname).

3. **`cd /d "%~dp0"`** — Muss als erste aktive Zeile in `INSTALL.bat` stehen, sonst scheitert der Installer bei Ausführung aus einem anderen Verzeichnis.

4. **`copy` statt `xcopy`** — Wildcards mit `xcopy /I` sind unzuverlässig; immer einzelne Dateien per `copy` kopieren.

5. **chokidar `ignoreInitial: true`** — Der Client verarbeitet beim Start KEINE bestehenden Dateien, nur neue Änderungen.

6. **PHP-Version-Diskrepanz** — Plugin-Header sagt `Version: 2.0.0`, aber `$db_version = '2.0.3'`. Die DB-Version ist maßgeblich für Migrationen; bei Schema-Änderungen nur `$db_version` erhöhen.

7. **`POST /death/next` erwartet `id`** — Das Overlay sendet `{ id: deathId }`. Der Server markiert nur den Eintrag als gezeigt, dessen ID übereinstimmt. Ohne ID-Angabe fällt er auf den ältesten unverarbeiteten Eintrag zurück (Rückwärtskompatibilität).

8. **CORS nur auf eigene Routen** — `add_cors_headers()` prüft `$_SERVER['REQUEST_URI']` auf `/wp-json/lotro-deaths/` und kehrt sonst sofort zurück. Nicht auf alle WP-Seiten ausweiten.

---

## API Endpoints (dodaswelt.de)

```
POST   /wp-json/lotro-deaths/v1/death             # Event senden (death ODER levelup)
GET    /wp-json/lotro-deaths/v1/death/current     # Ältester unverarbeiteter Death
POST   /wp-json/lotro-deaths/v1/death/next        # Aktuellen als gezeigt markieren, nächsten holen
GET    /wp-json/lotro-deaths/v1/queue             # Queue-Status
GET    /wp-json/lotro-deaths/v1/history           # History (?limit=N, ?character=Name)
GET    /wp-json/lotro-deaths/v1/characters        # Alle Characters mit Level + Todes-Statistiken
GET    /wp-json/lotro-deaths/v1/health            # System-Status
GET    /wp-json/lotro-deaths/v1/streamers         # Alle Streamer mit LOTRO-Stats (für herrin-inge.de)
POST   /wp-json/lotro-deaths/v1/streamers/mapping # Mapping hinzufügen/aktualisieren [Admin-Auth]
DELETE /wp-json/lotro-deaths/v1/streamers/mapping # Mapping löschen [Admin-Auth]
```

**Response-Format `/death/current` und `/death/next`:**
```json
{ "success": true, "data": { "id": 1, "characterName": "...", "level": 10, "deathCount": 5, "date": "...", "time": "...", "datetime": "...", "region": "..." }, "queueLength": 2 }
```

**levelup-Events** werden vom PHP nicht in die Queue eingetragen – nur der `current_level` in `wp_lotro_characters` wird aktualisiert.

---

## Datenbankstruktur (WordPress)

- `wp_lotro_deaths` – Death-Queue: Spalten `id, character_name, level, event_type, death_count, death_date, death_time, death_datetime, region, timestamp, received_at, processed, shown_at`
- `wp_lotro_characters` – Charakter-Statistiken: `character_name, current_level, total_deaths, last_seen`
- `wp_lotro_streamer_mapping` – Zuordnung: `twitch_username, character_name, display_name, race, character_class` (UNIQUE auf `twitch_username` und `character_name`)

DB-Migration läuft automatisch via `maybe_upgrade()` (`plugins_loaded`-Hook), gesteuert über WP-Option `lotro_death_tracker_db_version` (aktuell `2.0.3`).

**Kritisch:** `dbDelta` fügt bei bestehenden Tabellen manchmal keine neuen Spalten hinzu. Deshalb enthält `create_tables()` nach `dbDelta` einen expliziten `SHOW COLUMNS`-Check mit `ALTER TABLE` als Fallback. Bei jeder neuen Spalte zur Deaths-Tabelle **muss** dieser Block erweitert werden. Die DB-Version in `$db_version` muss bei jeder Schema-Änderung erhöht werden, damit `maybe_upgrade()` die Migration erneut ausführt.

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

## Distribution

Das Distributions-ZIP enthält `LOTRO-Death-Tracker-FINAL/` mit:
- `INSTALL.bat`, `ANLEITUNG.md`
- `node-v24.13.1-x64.msi` (31 MB, Node.js Installer für Endnutzer)
- `Client/` und `LOTRO-Plugin/`

StreamElements Overlay URL (für Streamer): `https://streamelements.com/overlay/699101f20ad2498d64a6c71e/OK0Fv1s0HutgMqmZixPH` (1920×1080)

---

## Versionierungsstrategie (ab v2.0)

- **Schema:** `MAJOR.MINOR` (z. B. `2.0`, `2.1`, `2.2`)
- Jedes neue Feature = neue Minor-Version. Kein Patch-Level für End-Nutzer.
- `version.json` auf dem Client (lokal), Plugin-Header-Version im PHP und `$db_version` folgen alle demselben Tag.
- GitHub Releases sind die maßgebliche Quelle für aktuelle Versionen (Tag-Format: `v2.0`, `v2.1` usw.).
- `$db_version` muss bei jeder DB-Schemaänderung auf die aktuelle Minor-Version gesetzt werden.

## WordPress Plugin Auto-Update

Ab v2.0 wird das WP-Plugin über den normalen WordPress-Update-Mechanismus aktualisiert. Technisch: `pre_set_site_transient_update_plugins`-Filter fragt die GitHub Releases API ab und stellt Update-Informationen bereit, wenn Remote-Version > installierte Version. Kein manuelles Reinstallieren nötig.
