# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Weiterführende Dokumentation

| Bereich | Datei |
|---|---|
| Node.js Client, Installer, Autostart, Auto-Update, Linux | `Client/CLAUDE.md` |
| WordPress REST API, DB-Struktur, Test-Umgebung | `WordPress/CLAUDE.md` |
| Stream-Overlay, lotro-data-fetcher.js | `Overlay/CLAUDE.md` |

---

## Project Overview

LOTRO Death Tracker — automatisches Death & Level-Up Tracking für Lord of the Rings Online Stream-Overlays. Ab v2.0 über GitHub Releases verteilt.

**Autor:** DodasWelt / Herrin Inge | **Website:** https://www.dodaswelt.de | **GitHub:** https://github.com/DodasWelt/LOTRO-Death-Tracker

> **Hinweis:** `LOTRO-Death-Tracker-COMPLETE-SUMMARY.md` enthält veraltete Code-Snippets (ältere Architektur). Die maßgeblichen Quellen sind die tatsächlichen Dateien im Repository.
> **Schlüsseldokumente:** `PROJEKTPLAN-v2.0.md` — Feature-Planung. `RISIKOANALYSE-v2.7.md` — aktuellste Risikoanalyse.

### Repository-Struktur

| Pfad | Zweck | Wo deployed |
|---|---|---|
| `Client/` | Node.js Client (Watcher, Installer, Updater) | `C:\LOTRO-Death-Tracker\` auf Streamer-PC |
| `LOTRO-Plugin/` | Lua Plugin für LOTRO | `Documents\...\Plugins\DodasWelt\` |
| `WordPress/lotro-death-tracker.php` | WordPress REST API Plugin | `dodaswelt.de` WP-Plugin-Verzeichnis |
| `Overlay/streamelements-overlay-minimalist.html` | Stream-Overlay (Prod) | StreamElements Custom Widget |
| `Overlay/streamelements-overlay-test.html` | Test-Overlay (lokal öffenbar) | Lokaler Browser / OBS (nur für Tests) |
| `Website/lotro-data-fetcher.js` | JS-Bibliothek für Website-Integration | `herrin-inge.de` via jsDelivr CDN |
| `INSTALL.bat` / `INSTALL.sh` | Erstinstallation (Windows / Linux) | Im Distributions-ZIP |
| `UPDATE.bat` / `UPDATE.sh` | Upgrade für bestehende Nutzer | Im Distributions-ZIP |
| `UNINSTALL.bat` / `UNINSTALL.sh` | Vollständige Deinstallation | Im Distributions-ZIP + Installationsverzeichnis |
| `REINSTALL.bat` / `REINSTALL.sh` | Saubere Neuinstallation via GitHub | Im Distributions-ZIP + Installationsverzeichnis |

---

## Development Commands

```bash
# Dependencies installieren (im Client-Verzeichnis)
cd C:\LOTRO-Death-Tracker
npm install

# Client manuell starten (zum Testen)
npm start   # oder: node client.js
# Env-Overrides: SERVER_URL=https://... LOTRO_PATH=C:\... node client.js

# Autostart verwalten
npm run install-service    # In Windows Startup-Ordner installieren
npm run uninstall-service  # Aus Startup-Ordner entfernen
npm run status             # Installationsstatus prüfen
npm run test-service       # Watcher sichtbar im Vordergrund testen

# Logs live verfolgen (PowerShell)
Get-Content C:\LOTRO-Death-Tracker\client.log -Wait -Tail 20
Get-Content C:\LOTRO-Death-Tracker\watcher.log -Wait -Tail 20

# API manuell testen
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

**Node.js Client** (`C:\LOTRO-Death-Tracker\`):
- `Client/client.js` — File-Watcher & API-Sender; schreibt `client.pid` beim Start
- `Client/install-autostart.js` — Generiert `lotro-watcher.js`, `lotro-status-server.js` und zwei VBS-Dateien dynamisch
- `Client/updater.js` — Wird nach erkanntem Update gespawnt; führt `npm install` + `install-autostart.js install` aus
- `Client/version.json.template` — Template für `version.json` (wird bei Installation kopiert)
- Logs: `client.log`, `watcher.log`

**Installer / Updater** (Details → `Client/CLAUDE.md`):
- `INSTALL.bat` — Erstinstallation inkl. LOTRO-Running-Check
- `UPDATE.bat` — Upgrade; killt alle `node.exe` vor Datei-Kopieren
- `UNINSTALL.bat` — Volldeinstallation mit Self-Copy-Pattern
- `REINSTALL.bat` — Neuinstallation via GitHub-Download + Staging-Pattern

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
Das `content`-Feld ist ein escaped JSON-String. Der Client unescaped mit `.replace(/\\"/g, '"')` vor `JSON.parse()`.

**`DeathTracker_State.plugindata`** (ab v2.4) — wird vom Watcher gelesen:
```
{ ["totalDeathsTrackedLocally"] = 42.0 }
```
Kumulierter Todes-Zähler über alle Sessions. Referenzpfad: `[LotroPath]/PluginData/[Server]/[Charakter]/DeathTracker_State.plugindata`

**`Client/deaths.local.json`** (ab v2.4):
```json
{ "characters": { "Inge": { "baselineServer": 40, "baselinePlugin": 38, "firstSeenAt": "2026-03-06T11:00:00.000Z" } } }
```

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

Quelle: LotroCompanion/lotro-data — **noch nicht live in-game verifiziert**. Falsches Mapping landet still als `"Unknown"` in der DB.

### Duplikat-Schutz

Client: `syncData.lastUpdate > lastProcessedTimestamp` — überspringt bereits verarbeitete Events.
Plugin: `isPlayerDead`-Flag + `lastDeathWasLogged`-Flag — wird erst bei Revive (Morale > 0) zurückgesetzt.

### Timestamps

LOTRO schreibt `"TIMESTAMP"` als Platzhalter. `client.js` ersetzt mit echter Systemzeit im de-DE-Locale-Format.

---

## syncLocalDeaths — Lokaler Tod-Abgleich (ab v2.4, Formel-Fix in v2.6)

**Formel (korrekt ab v2.6):**
```
missing = (currentPlugin - baselinePlugin) - (currentServer - baselineServer)
```
- `currentPlugin` = `totalDeathsTrackedLocally` aus `DeathTracker_State.plugindata` (kumulativer Lifetime-Counter)
- `baselinePlugin` **PFLICHT** — ohne ihn entstehen Phantomtode (Bug v2.4/v2.5)
- **Migration v2.6**: Alte Einträge ohne `baselinePlugin` → Baseline automatisch neu gesetzt
- **DB-Reset-Schutz**: `currentServer < baselineServer` → Log-Warnung + Baseline-Reset

---

## LOTRO-Pfad-Erkennung

**Windows** (INSTALL.bat, UPDATE.bat, client.js):
1. Registry: `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders\Personal`
2. OneDrive: `%USERPROFILE%\OneDrive\Documents\The Lord of the Rings Online`
3. Standard: `%USERPROFILE%\Documents\The Lord of the Rings Online`
4. **Nur INSTALL.bat:** Manuelle Eingabe via `SET /P`

**Linux** (client.js, install-autostart.js-Templates, updater.js):
1. `LOTRO_PATH` Env-Var (höchste Priorität)
2. Steam native → Steam Flatpak → Steam Library VDF-Scan → Lutris YAML-Scan
3. Fallback: `~/Documents/The Lord of the Rings Online`

> **KRITISCH:** `getLOTROPath()` ist **viermal** implementiert: `client.js`, Watcher-Template in `install-autostart.js`, Status-Server-Template in `install-autostart.js`, IIFE in `updater.js`. Bei Änderungen **alle vier Stellen synchron halten!**

---

## Distribution & Releases

### GitHub Releases (ab v2.0)

| Asset | Inhalt |
|---|---|
| `LOTRO-Death-Tracker-vX.Y.zip` | `Client/`, `LOTRO-Plugin/`, alle BAT/SH-Skripte, `ANLEITUNG.md` |
| `lotro-death-tracker.zip` | `lotro-death-tracker/lotro-death-tracker.php` (für WP-Auto-Update) |

**Versionsprüfung (PFLICHT vor jedem Release):**
```bash
grep -h "\"version\"" Client/package.json Client/version.json.template
grep -h "Version:" Client/client.js WordPress/lotro-death-tracker.php
grep -h "version = " Client/client.js LOTRO-Plugin/DodasWelt/DeathTracker/Main.lua
grep -h "<Version>" LOTRO-Plugin/DodasWelt/DeathTracker.plugin
grep -h "Installierte Version:" INSTALL.bat UPDATE.bat
grep -h "v[0-9]\." INSTALL.bat UPDATE.bat UNINSTALL.bat REINSTALL.bat
grep -m1 "^\*\*Version" ANLEITUNG.md
grep -h "Version:" Website/lotro-data-fetcher.js
grep -h "@v[0-9]\." Website/lotro-data-fetcher.js Overlay/CLAUDE.md
grep -h "'version'" WordPress/lotro-death-tracker.php
grep -h "Version:" INSTALL.sh UPDATE.sh UNINSTALL.sh REINSTALL.sh
```
→ Alle ausgegebenen Versionsnummern müssen `X.Y` sein.

**Code-Review (PFLICHT nach Versionskorrektur):** `/code-review` auf alle geänderten Dateien ausführen.

**Release erstellen:**
```bash
mkdir -p LOTRO-Death-Tracker-vX.Y
cp -r Client LOTRO-Plugin INSTALL.bat UPDATE.bat UNINSTALL.bat REINSTALL.bat INSTALL.sh UPDATE.sh UNINSTALL.sh REINSTALL.sh ANLEITUNG.md LOTRO-Death-Tracker-vX.Y/
python3 -c "import shutil; shutil.make_archive('LOTRO-Death-Tracker-vX.Y', 'zip', '.', 'LOTRO-Death-Tracker-vX.Y')"
mkdir -p lotro-death-tracker
cp WordPress/lotro-death-tracker.php lotro-death-tracker/
python3 -c "import shutil; shutil.make_archive('lotro-death-tracker', 'zip', '.', 'lotro-death-tracker')"
gh release create vX.Y --title "vX.Y – ..." --notes "..." LOTRO-Death-Tracker-vX.Y.zip lotro-death-tracker.zip
gh release edit vX.Y --latest   # PFLICHT!
rm -rf LOTRO-Death-Tracker-vX.Y lotro-death-tracker
```

**Pre-Release → regulärer Release:**
```bash
gh release edit vX.Y --prerelease=false
gh release edit vX.Y --latest
```

---

## Versionierungsstrategie (ab v2.0)

- **Schema:** `MAJOR.MINOR` (z. B. `3.0`, `3.1`) — kein Patch-Level für End-Nutzer.
- `$db_version` nur erhöhen bei DB-Schemaänderung.

Bei jedem Release alle Versionsnummern synchron halten:

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
| `INSTALL.bat` Erfolgsmeldung + Popup-Text | auf `X.Y` / `vX.Y` setzen |
| `UPDATE.bat` Fenstertitel + Header + Erfolgsmeldung + Popup | auf `X.Y` / `vX.Y` setzen |
| `UNINSTALL.bat` Version-Kommentar | auf `X.Y` setzen |
| `REINSTALL.bat` Version-Kommentar | auf `X.Y` setzen |
| `ANLEITUNG.md` Versionsnummer im Titel, TOC + Update-Abschnitt | auf `X.Y` setzen |
| `Website/lotro-data-fetcher.js` Header `Version:` + CDN-URL `@vX.Y` | auf `X.Y` / `vX.Y` setzen |
| `WordPress/lotro-death-tracker.php` Health-Endpoint `'version'` | auf `X.Y` setzen |
| `Overlay/CLAUDE.md` CDN-Einbindungs-Beispiel (`@vX.Y`) | auf `vX.Y` setzen |
| `INSTALL.sh` Version-Kommentar + Erfolgsmeldung | auf `X.Y` setzen |
| `UPDATE.sh` Version-Kommentar + Erfolgsmeldung | auf `X.Y` setzen |
| `UNINSTALL.sh` Version-Kommentar | auf `X.Y` setzen |
| `REINSTALL.sh` Version-Kommentar | auf `X.Y` setzen |
| Git-Tag | `vX.Y` |

> **Aktueller Stand:** Code-Stand ist **v3.0** (in Entwicklung). Letzter GitHub-Release: **v2.7** (released 2026-03-13).
