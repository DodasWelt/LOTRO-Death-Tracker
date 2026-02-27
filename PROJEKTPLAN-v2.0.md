# Projektplan: LOTRO Death Tracker v2.0

**Stand:** 27. Februar 2026
**Status:** Planung abgeschlossen — noch keine Implementierung gestartet

---

## Thema 1 — Auto-Update-System

**Ziel:** Der Watcher prüft beim Start, ob neue Versionen von Client, Plugin und Watcher selbst verfügbar sind, und aktualisiert diese automatisch.

### Infrastruktur-Optionen

| Kriterium | (A) Endpunkt auf dodaswelt.de | (B) GitHub Releases |
|---|---|---|
| Einrichtungsaufwand | Mittel (PHP-Endpoint + Datei-Upload-Workflow) | Gering (GitHub-Repository + Release erstellen) |
| Hosting-Kosten | Belegt Webspace auf dodaswelt.de | Kostenlos |
| Download-Geschwindigkeit | Abhängig vom Hoster | GitHub CDN, sehr zuverlässig |
| Versionsverwaltung | Manuell (Datei ersetzen + JSON aktualisieren) | Git-Tags, automatische Changelogs |
| Transparenz für Nutzer | Keine | Öffentlich einsehbare Releases |
| Abhängigkeit | Eigene Infrastruktur | Externer Dienst (GitHub) |
| Selbst-Update des Watchers | Gleich aufwändig in beiden Fällen | Gleich aufwändig in beiden Fällen |

**Empfehlung: (B) GitHub Releases**
GitHub Releases ist für diesen Anwendungsfall etabliert, kostenlos, hat ein stabiles API zum Abfragen der neuesten Version (`api.github.com/repos/[user]/[repo]/releases/latest`) und bietet automatische Changelogs. Der Watcher kann direkt die Download-URLs aus der GitHub-API lesen, ohne dass ein eigener Endpoint gepflegt werden muss. Einziges Risiko: GitHub-Abhängigkeit — bei einem Ausfall sind keine Updates möglich, aber das System läuft weiter.

### Versionierungsstrategie

- Neue Datei `C:\LOTRO-Death-Tracker\version.json` speichert die installierte Version:
  ```json
  { "version": "2.0.0", "installedAt": "2026-02-27T10:00:00Z" }
  ```
- Remote-Version: GitHub-API `releases/latest` liefert `tag_name` (z. B. `v2.0.1`)
- Vergleich via semver (`major.minor.patch`) — Update nur wenn Remote > Lokal

### Update-Ablauf

```
Watcher startet
  → fetch GitHub API: releases/latest
  → version.json lesen → vergleichen
  → Kein Update: normal weiter
  → Update verfügbar:
       → Dateien einzeln in temporäre Pfade laden (.tmp)
       → Prüfsumme vergleichen (optional, SHA256 aus Release-Assets)
       → .tmp → Original ersetzen (atomares Rename)
       → version.json aktualisieren
       → Watcher-Neustart: spawn neuen Prozess, aktueller beendet sich
```

**Selbst-Update des Watchers:** Da `lotro-watcher.js` sich nicht selbst ersetzen kann während es läuft, spawnt es vor dem Ersetzen einen temporären `updater.js`-Prozess, der wartet bis der Watcher sich beendet hat, dann die Dateien tauscht und den Watcher neu startet.

**Randfälle:**
- Kein Internet → Update-Prüfung still überspringen, Watcher läuft normal weiter, Fehler ins `watcher.log`
- Download fehlgeschlagen → `.tmp`-Datei löschen, Original bleibt unangetastet (kein Rollback nötig)
- Unterbrochener Download → wie oben, `.tmp` wird nie zu `.js` umbenannt
- Update schlägt fehl → Version bleibt unverändert, nächster Start versucht es erneut

### Betroffene Komponenten

| Komponente | Änderung |
|---|---|
| `install-autostart.js` | `lotro-watcher.js` bekommt Update-Check-Logik + `updater.js`-Generierung |
| `version.json` | Neue Datei, wird bei Installation erstellt |
| `INSTALL.bat` | Schreibt initiale `version.json` nach `C:\LOTRO-Death-Tracker\` |
| GitHub | Neues Repository + Release-Workflow einrichten |

**Aufwand: Groß** — Neustart-Logik für Selbst-Update ist komplex; GitHub-Setup und atomares Ersetzen sind sicher umsetzbar, aber der Gesamt-Workflow erfordert sorgfältiges Testen.

**Offene Entscheidungen:**
- GitHub-Repository anlegen — wer hat Schreibrechte für Releases?
- Sollen Releases öffentlich oder privat sein?

---

## Thema 2 — LOTRO-Pfad-Erkennung bei der Installation

**Ziel:** `INSTALL.bat` findet den korrekten LOTRO-Pfad automatisch, statt `%USERPROFILE%\Documents\` hartzukodieren.

### Erkennungslogik (Prüfreihenfolge)

```batch
REM Schritt 1: Registry-Abfrage (zuverlässigste Quelle — enthält den echten Dokumente-Pfad)
FOR /F "tokens=2*" %%A IN (
  'REG QUERY "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders" /v Personal 2^>nul'
) DO SET "DOCS_PATH=%%B"

REM Schritt 2: Prüfen ob LOTRO dort liegt
IF DEFINED DOCS_PATH (
  IF EXIST "%DOCS_PATH%\The Lord of the Rings Online" (
    SET "LOTRO_PATH=%DOCS_PATH%\The Lord of the Rings Online"
    GOTO :found
  )
)

REM Schritt 3: OneDrive-Variante
IF EXIST "%USERPROFILE%\OneDrive\Documents\The Lord of the Rings Online" (
  SET "LOTRO_PATH=%USERPROFILE%\OneDrive\Documents\The Lord of the Rings Online"
  GOTO :found
)

REM Schritt 4: Standard-Pfad als Fallback
IF EXIST "%USERPROFILE%\Documents\The Lord of the Rings Online" (
  SET "LOTRO_PATH=%USERPROFILE%\Documents\The Lord of the Rings Online"
  GOTO :found
)

REM Schritt 5: Nicht gefunden → manuelle Eingabe
ECHO.
ECHO [FEHLER] Das Verzeichnis "The Lord of the Rings Online" wurde nicht gefunden.
ECHO Bitte gib den vollständigen Pfad manuell ein, z.B.:
ECHO   C:\Users\Dein_Name\Documents\The Lord of the Rings Online
ECHO.
SET /P "LOTRO_PATH=Pfad: "
IF NOT EXIST "%LOTRO_PATH%" (
  ECHO [FEHLER] Pfad existiert nicht. Installation abgebrochen.
  PAUSE & EXIT /B 1
)

:found
ECHO [OK] LOTRO gefunden: %LOTRO_PATH%
SET "PLUGINS_PATH=%LOTRO_PATH%\Plugins"
```

### Plugins-Ordner automatisch anlegen

```batch
IF NOT EXIST "%PLUGINS_PATH%" (
  ECHO [INFO] Ordner "Plugins" nicht vorhanden - wird erstellt...
  MKDIR "%PLUGINS_PATH%"
)
```

### Betroffene Komponenten

| Komponente | Änderung |
|---|---|
| `INSTALL.bat` | Komplette Pfad-Erkennungslogik ersetzen |
| `client.js` | `getLOTROPath()` analog erweitern: Registry via `reg query` in Node.js (mit `windowsHide: true`) |

**Hinweis für `client.js`:** Node.js kann Registry-Abfragen via `child_process.execSync('reg query ...')` ausführen. Ergebnis parsen und als `LOTRO_PATH` verwenden, bevor auf Standard-Pfad zurückgefallen wird.

**Aufwand: Mittel** — Batch-Logik ist geradlinig; der Registry-Aufruf ist der komplexeste Teil, aber gut dokumentiert.

**Offene Entscheidungen:**
- Soll `client.js` ebenfalls die Registry-Abfrage bekommen (für den Fall, dass der Pfad nach Installation geändert wird)?

---

## Thema 3 — Race und Class im Lua-Plugin

**Ziel:** Das Plugin liest beim Event-Logging Volk und Klasse des Charakters aus und sendet sie mit. Die Daten werden im Backend gespeichert und über `lotro-data-fetcher.js` zugänglich gemacht.

### Lua-API-Nutzung

LOTRO's `Turbine.Gameplay.LocalPlayer` bietet:
```lua
local race  = self.player:GetRace()   -- Rückgabe: numerischer Enum
local class = self.player:GetClass()  -- Rückgabe: numerischer Enum
```

Die Enums müssen in lesbare Strings übersetzt werden. Mapping-Tabellen direkt in `Main.lua`:

```lua
DeathTracker.RaceNames = {
    [1]  = "Mensch",   [2]  = "Hobbit",  [3]  = "Zwerg",
    [4]  = "Elf",      [5]  = "Beorn",   [6]  = "Rohirrim",
    [40] = "Stoormann"
}

DeathTracker.ClassNames = {
    [1]  = "Wächter",       [2]  = "Burgmann",    [3]  = "Loremaster",
    [4]  = "Jäger",         [5]  = "Hauptmann",   [6]  = "Waffenmeister",
    [7]  = "Runenbewahrer", [9]  = "Schurke",     [10] = "Beorninger",
    [11] = "Ritter"
}
```

**Randfall beim Start:** Beim Plugin-Start ist der Spieler möglicherweise noch nicht vollständig geladen. Lösung: Race/Class beim ersten Event abrufen; falls `nil`, Platzhalter `"Unknown"` verwenden und beim nächsten Event erneut versuchen.

### Datenfluss

`eventRecord` in `LogEvent()` wird um zwei Felder erweitert:
```lua
race  = DeathTracker.RaceNames[self.player:GetRace()]   or "Unknown",
class = DeathTracker.ClassNames[self.player:GetClass()] or "Unknown",
```
Diese Felder landen im `content`-JSON-String → `client.js` leitet sie unverändert an die WordPress-API weiter (**kein Client-Code-Change nötig**).

### Backend-Anpassung (WordPress Plugin)

**`wp_lotro_deaths`:** Zwei neue Spalten — `race VARCHAR(100)` und `character_class VARCHAR(100)`.

**`wp_lotro_characters`:** Ebenfalls `race` und `character_class` — damit der `/characters`-Endpoint die Werte liefert.

**Migration:**
- `$db_version` von `2.0.3` auf `2.0.4` erhöhen
- In `create_tables()`: Neue Spalten in beide `CREATE TABLE`-Statements aufnehmen
- Im `SHOW COLUMNS`-Fallback-Block: Vier neue `ALTER TABLE`-Checks ergänzen (je 2 pro Tabelle)
- In `api_submit_event()`: `race` und `character_class` aus `$params` lesen, sanitizen (`sanitize_text_field`), in INSERT aufnehmen
- In `upsert_character()`: `race` und `character_class` in UPSERT aufnehmen
- In `format_death()` und `api_get_characters()`: Neue Felder in Response-Array aufnehmen

### lotro-data-fetcher.js

`getLatestDeath()`, `getAllDeaths()`, `getCurrentCharacter()`, `getAllCharacters()` geben die neuen Felder automatisch zurück, sobald die API sie liefert — **kein funktionaler Code-Change nötig**, da die Funktionen die API-Antwort direkt durchreichen. Nur JSDoc-Kommentare um `race` und `characterClass` ergänzen.

### Betroffene Komponenten

| Komponente | Änderung | Aufwand |
|---|---|---|
| `Main.lua` | Race/Class-Enums + Auslesen in `LogEvent()` | Klein |
| `lotro-death-tracker.php` | 2 neue Spalten in 2 Tabellen, Migration, API-Handler anpassen | Mittel |
| `lotro-data-fetcher.js` | Nur JSDoc-Updates | Minimal |
| `client.js` | Keine Änderung nötig | — |

**Aufwand: Mittel** — Die Lua-Enum-Tabelle muss vollständig und korrekt sein (erfordert Recherche/Validierung der aktuellen LOTRO-Enum-Werte). Der PHP-Teil folgt dem etablierten Migrations-Muster.

**Offene Entscheidungen:**
- Vollständige Enum-Tabelle für alle LOTRO-Völker und -Klassen vor Implementierung validieren (LOTRO Lua API Docs: https://lunarwtr.github.io/lotro-api-docs/)
- Sollen Race/Class auch im StreamElements-Overlay angezeigt werden?

---

---

## Thema 4 — GitHub Repository Setup

**Ziel:** Das Projekt in ein öffentliches GitHub-Repository umwandeln. GitHub dient als Single Source of Truth für alle Releases, Updates und die Versionsverwaltung.

### Aufgaben

1. **Repository anlegen** — `DodasWelt/LOTRO-Death-Tracker` (öffentlich empfohlen, damit Auto-Update ohne Token auskommt)
2. **Struktur im Repo:**
   ```
   /Client/            ← Node.js Client-Dateien
   /LOTRO-Plugin/      ← Lua Plugin
   /WordPress/         ← lotro-death-tracker.php
   /Overlay/           ← streamelements-overlay-minimalist.html
   /Website/           ← lotro-data-fetcher.js
   INSTALL.bat
   ANLEITUNG.md
   version.json        ← Aktuelle Release-Version (Referenz)
   ```
3. **Release-Workflow:** Git-Tag `v2.0` → GitHub Release → ZIP-Asset anhängen
4. **Release-Asset-Benennung:** `LOTRO-Death-Tracker-v2.0.zip` (enthält wie bisher `LOTRO-Death-Tracker-FINAL/`)

### Betroffene Komponenten

| Komponente | Änderung |
|---|---|
| Alle Quelldateien | In Repository einpflegen |
| `INSTALL.bat` | Schreibt `version.json` mit aktuellem Tag |
| GitHub Actions (optional) | ZIP automatisch bei Release bauen |

**Aufwand: Klein** — Repository anlegen und Dateien einchecken. GitHub Actions ist optional und kann später ergänzt werden.

**Offene Entscheidungen:**
- Öffentlich oder privat? (Empfehlung: öffentlich — kein Token nötig für Update-Checks)
- GitHub-Account: unter DodasWelt oder persönlichem Account?

---

## Thema 5 — WordPress Plugin Auto-Update via WP Update-Mechanismus

**Ziel:** Das Plugin erscheint in der normalen WordPress-Plugin-Übersicht mit einem Update-Hinweis, sobald eine neue Version auf GitHub verfügbar ist. Update per Klick — kein manuelles Reinstallieren.

### Technische Umsetzung

WordPress nutzt Transients (`update_plugins`) um Plugin-Update-Informationen zu cachen. Über den `pre_set_site_transient_update_plugins`-Filter kann das Plugin sich selbst in diese Liste eintragen:

```php
add_filter('pre_set_site_transient_update_plugins', array($this, 'check_for_update'));

public function check_for_update($transient) {
    if (empty($transient->checked)) return $transient;

    $current_version = '2.0'; // = Plugin-Header Version
    $response = wp_remote_get(
        'https://api.github.com/repos/DodasWelt/LOTRO-Death-Tracker/releases/latest',
        array('headers' => array('User-Agent' => 'LOTRO-Death-Tracker-WP'))
    );

    if (is_wp_error($response)) return $transient;

    $release = json_decode(wp_remote_retrieve_body($response));
    $remote_version = ltrim($release->tag_name, 'v'); // "v2.1" → "2.1"

    if (version_compare($remote_version, $current_version, '>')) {
        $plugin_slug = plugin_basename(__FILE__);
        $transient->response[$plugin_slug] = (object) array(
            'slug'        => 'lotro-death-tracker',
            'plugin'      => $plugin_slug,
            'new_version' => $remote_version,
            'url'         => $release->html_url,
            'package'     => $release->assets[0]->browser_download_url, // ZIP-Asset
        );
    }

    return $transient;
}
```

Zusätzlich `plugins_api`-Filter implementieren, damit die Update-Details-Seite in WordPress korrekte Informationen anzeigt.

### Betroffene Komponenten

| Komponente | Änderung |
|---|---|
| `lotro-death-tracker.php` | `check_for_update()` + `plugins_api`-Filter ergänzen |
| GitHub Release | ZIP-Asset muss direkt das entpackbare Plugin-Verzeichnis enthalten |
| Plugin-Header `Version:` | Muss dem GitHub-Tag entsprechen (z. B. `2.1`) |

**Hinweis:** Das ZIP-Asset für WordPress-Updates muss ein Plugin-kompatibles ZIP sein (enthält Ordner `lotro-death-tracker/` direkt), nicht das End-Nutzer-Distributions-ZIP.

**Aufwand: Mittel** — WP-Filter-API ist gut dokumentiert; ZIP-Asset-Struktur muss sorgfältig aufgebaut werden.

**Offene Entscheidungen:**
- Soll die Update-Prüfung gecacht werden (eigener Transient, um GitHub API-Rate-Limits zu vermeiden)?

---

## Thema 6 — Fetcher-Updates via GitHub

**Ziel:** `lotro-data-fetcher.js` kann einfach über GitHub aktualisiert werden, ohne manuelle Schritte auf `herrin-inge.de`.

### Optionen

| Option | Beschreibung | Aufwand |
|---|---|---|
| **(A) jsDelivr CDN** | `<script src="https://cdn.jsdelivr.net/gh/DodasWelt/LOTRO-Death-Tracker@latest/Website/lotro-data-fetcher.js">` — automatisch aktuell | Minimal |
| **(B) Raw GitHub** | `https://raw.githubusercontent.com/DodasWelt/LOTRO-Death-Tracker/main/Website/lotro-data-fetcher.js` — kein CDN, direkt aus `main` | Minimal |
| **(C) Versionierte URLs** | `@v2.1/Website/lotro-data-fetcher.js` — pinned auf Tag | Klein |

**Empfehlung: (A) jsDelivr mit versionierter URL** (`@v2.1`) — automatisches CDN, globale Verfügbarkeit, kein Risiko durch unkontrollierte `main`-Änderungen.

### Betroffene Komponenten

| Komponente | Änderung |
|---|---|
| `herrin-inge.de` | Script-Tag auf jsDelivr-URL umstellen |
| `lotro-data-fetcher.js` | Keine Code-Änderung — nur Deployment-Weg ändert sich |

**Aufwand: Minimal** — Nur URL im `<script>`-Tag ändern. Bei jedem Release jsDelivr-URL auf neuen Tag aktualisieren.

---

## Thema 7 — Updater für bestehende v1.5-Nutzer

**Ziel:** Nutzer der alten Version (v1.5 / v5-ZIP) können per Doppelklick auf eine `.bat`-Datei (oder Rechtsklick → "Als Administrator ausführen") auf v2.0 aktualisieren — ohne Deinstallation oder manuelle Schritte.

### Was der Updater tun muss

1. Prüfen ob LOTRO-Death-Tracker bereits installiert ist (`C:\LOTRO-Death-Tracker\` vorhanden?)
2. Autostart-Eintrag aus Startup-Ordner entfernen (alte VBS-Datei löschen)
3. Alten `client.js` + `install-autostart.js` + `package.json` ersetzen (neue Dateien aus dem Update-ZIP)
4. `npm install` ausführen (für neue/geänderte Dependencies)
5. LOTRO-Plugin-Dateien ersetzen (`DodasWelt\` Ordner im Plugins-Verzeichnis)
6. Autostart neu einrichten (`node install-autostart.js install`)
7. `version.json` anlegen/aktualisieren
8. Erfolg melden und Fenster offen lassen (`PAUSE`)

### Datei: `UPDATE.bat`

```batch
@echo off
cd /d "%~dp0"
ECHO ============================================
ECHO  LOTRO Death Tracker - Update auf v2.0
ECHO ============================================
ECHO.

REM Schritt 1: Prüfen ob Installation vorhanden
IF NOT EXIST "C:\LOTRO-Death-Tracker\" (
  ECHO [FEHLER] Keine bestehende Installation gefunden.
  ECHO Bitte fuehre stattdessen INSTALL.bat aus.
  PAUSE & EXIT /B 1
)

REM Schritt 2: Autostart stoppen und alten Eintrag entfernen
ECHO [1/5] Stoppe alten Autostart...
DEL /F /Q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\LOTRO-Death-Tracker.vbs" 2>nul

REM Schritt 3: Client-Dateien aktualisieren
ECHO [2/5] Aktualisiere Client-Dateien...
copy /Y "Client\client.js"             "C:\LOTRO-Death-Tracker\client.js"
copy /Y "Client\install-autostart.js"  "C:\LOTRO-Death-Tracker\install-autostart.js"
copy /Y "Client\package.json"          "C:\LOTRO-Death-Tracker\package.json"

REM Schritt 4: Dependencies aktualisieren
ECHO [3/5] Installiere Dependencies...
cd /d "C:\LOTRO-Death-Tracker"
npm install --silent

REM Schritt 5: Plugin-Dateien aktualisieren (LOTRO-Pfad wie in INSTALL.bat ermitteln)
ECHO [4/5] Aktualisiere LOTRO Plugin...
REM [Pfad-Erkennungslogik aus Thema 2 hier einsetzen]
copy /Y "%~dp0LOTRO-Plugin\DodasWelt\DeathTracker\Main.lua" "%PLUGINS_PATH%\DodasWelt\DeathTracker\Main.lua"
copy /Y "%~dp0LOTRO-Plugin\DodasWelt\DeathTracker.plugin"   "%PLUGINS_PATH%\DodasWelt\DeathTracker.plugin"

REM Schritt 6: Autostart neu einrichten
ECHO [5/5] Richte Autostart neu ein...
cd /d "C:\LOTRO-Death-Tracker"
node install-autostart.js install

ECHO.
ECHO [OK] Update auf v2.0 abgeschlossen!
ECHO Starte Windows neu oder melde dich ab/an, damit der Autostart aktiv wird.
PAUSE
```

### Betroffene Komponenten

| Komponente | Änderung |
|---|---|
| `UPDATE.bat` | Neue Datei im Distributions-ZIP |
| `ANLEITUNG.md` | Abschnitt "Update von v1.5" ergänzen |
| Distributions-ZIP | `UPDATE.bat` aufnehmen |

**Aufwand: Klein** — Batch-Logik ist straightforward; Pfad-Erkennungslogik aus Thema 2 wiederverwenden.

**Randfall:** Nutzer, die v1.5 in einem anderen Verzeichnis als `C:\LOTRO-Death-Tracker\` installiert haben, müssen den Pfad manuell anpassen oder `INSTALL.bat` neu ausführen. Im Installer war dieser Pfad hartkodiert, daher ist `C:\LOTRO-Death-Tracker\` der Standard.

---

## Thema 8 — Versionierungsstrategie & Datenbank-Synchronisation

**Ziel:** Alle Komponenten (Client, Plugin, WP-Plugin, Datenbank) folgen einem gemeinsamen Versionsschema. Neue Features → neue Minor-Version.

### Versionsschema

- Format: `MAJOR.MINOR` (z. B. `2.0`, `2.1`, `2.2`)
- Kein Patch-Level für Endnutzer — Bugfixes werden als neues Minor-Release veröffentlicht
- GitHub-Tags: `v2.0`, `v2.1` usw.

### Versionsdateien und -felder

| Datei/Feld | Wert | Zweck |
|---|---|---|
| `Client/version.json` | `{ "version": "2.0" }` | Lokal installierte Version |
| `Client/package.json` → `"version"` | `"2.0"` | npm-Standard |
| PHP Plugin-Header `Version:` | `2.0` | WordPress zeigt diese Version |
| PHP `$db_version` | `'2.0'` | Steuert DB-Migrationen |
| `LOTRO-Plugin/DeathTracker.plugin` (falls vorhanden) | Version-Tag | Lua-Plugin-Version |

**Regel:** Bei jedem Release wird **ein** Git-Tag gesetzt, und alle Versionsnummern werden auf denselben Wert aktualisiert. `$db_version` wird nur erhöht wenn sich das DB-Schema ändert; sie entspricht aber immer dem nächsten Minor-Release.

### DB-Versionssprung bei Schema-Änderungen

Wenn ein Feature (z. B. Thema 3: Race/Class) eine DB-Migration erfordert:
1. Feature wird in Branch entwickelt
2. `$db_version` auf die geplante Version setzen (z. B. `'2.1'`)
3. Migration in `create_tables()` + `SHOW COLUMNS`-Fallback ergänzen
4. Release `v2.1` erstellt → WP-Plugin erkennt neue Version → `maybe_upgrade()` läuft → DB migriert automatisch

**Wichtig:** `$db_version` NICHT auf `2.0.3` zurücksetzen — der Sprung von `2.0.3` (aktuell) auf `2.0` oder `2.1` (neu) muss in `maybe_upgrade()` korrekt verglichen werden. Entweder `version_compare()` verwenden oder auf ein komplett neues Schema-Format (rein `MAJOR.MINOR`) umstellen und eine einmalige Migration erzwingen.

### Betroffene Komponenten

| Komponente | Änderung |
|---|---|
| `lotro-death-tracker.php` | `$db_version` und Plugin-Header auf neues Format |
| `Client/package.json` | `"version"` aktualisieren |
| `Client/version.json` | Neue Datei, bei Installation erstellt |
| `INSTALL.bat` | Schreibt `version.json` |
| GitHub Releases | Tag-Name = Versionsnummer |

**Aufwand: Klein** — Keine neuen Features, nur Konsolidierung bestehender Versionsnummern.

---

## Gesamtübersicht

| # | Thema | Version | Aufwand | Offene Entscheidungen |
|---|---|---|---|---|
| 1 | Auto-Update-System (Watcher) | 2.0 | **Groß** | GitHub-Repo anlegen (→ Thema 4 zuerst) |
| 2 | Pfad-Erkennung bei Installation | 2.0 | **Mittel** | Registry-Abfrage auch in client.js? |
| 3 | Race/Class im Plugin | 2.1 | **Mittel** | Enum-Tabelle validieren, Overlay-Anzeige? |
| 4 | GitHub Repository Setup | 2.0 | **Klein** | Öffentlich oder privat? Account? |
| 5 | WP Plugin Auto-Update | 2.0 | **Mittel** | Update-Check cachen? |
| 6 | Fetcher-Updates via GitHub | 2.0 | **Minimal** | jsDelivr oder Raw GitHub? |
| 7 | Updater für v1.5 → v2.0 | 2.0 | **Klein** | — |
| 8 | Versionierungsstrategie | 2.0 | **Klein** | Übergang von `2.0.3` → neues Schema |

**Empfohlene Implementierungsreihenfolge:** 4 → 8 → 7 → 2 → 6 → 5 → 1 → 3

- **Thema 4** (GitHub) ist Voraussetzung für alles andere — zuerst das Repository anlegen.
- **Thema 8** (Versionierung) direkt danach — alle Versionsnummern auf Stand bringen.
- **Thema 7** (Updater) ist unabhängig und klein — sofort nach dem Repo-Setup umsetzbar.
- **Thema 2** (Pfad-Erkennung) + **Thema 6** (Fetcher CDN) sind ebenfalls unabhängig und schnell.
- **Thema 5** (WP Auto-Update) benötigt das fertige GitHub-Repo mit korrekten Release-Assets.
- **Thema 1** (Auto-Update Watcher) ist am aufwändigsten — nach allem anderen angehen.
- **Thema 3** (Race/Class) ist ein eigenständiges Feature-Release (`v2.1`) — kann parallel entwickelt werden.
