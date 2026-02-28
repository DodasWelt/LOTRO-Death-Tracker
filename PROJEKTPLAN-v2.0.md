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

---

## Thema 9 — Risikominimierung vor Veröffentlichung

**Ziel:** Alle in `RISIKOANALYSE-v2.0.md` identifizierten Risiken durch bessere Implementierung auf ein Minimum reduzieren — ohne aufwändige manuelle Tests. Release von v2.0/v2.1 erst nach Abschluss dieses Themas.

### Risiko 1 & 3: Auto-Update — Robusteres Download- und Rollback-Design

**Problem:** Dateien werden sequenziell überschrieben. Ein Abbruch nach der zweiten Datei hinterlässt einen inkonsistenten Zustand. Kein Rollback.

**Best Practice: Alles-oder-nichts per Staging-Verzeichnis**

Statt jede Datei direkt zu überschreiben, werden alle Dateien zunächst in ein temporäres Unterverzeichnis (`update-staging/`) geladen. Erst wenn alle Downloads erfolgreich waren, werden die Dateien in einem einzigen synchronen Schritt umbenannt:

```js
// 1. Alle Dateien nach update-staging/ laden (bei Fehler: Verzeichnis löschen, abbrechen)
// 2. Erst wenn alle da sind: Dateien einzeln umbenennen (fs.renameSync ist atomar)
// 3. Staging-Verzeichnis löschen
```

Vorteil: Ein Netzwerkfehler bei Datei 3 lässt die Produktivdateien komplett unangetastet. Das Staging-Verzeichnis wird beim nächsten Start-Check automatisch aufgeräumt (falls ein vorheriger Versuch abgebrochen wurde).

### Risiko 2: Updater-Timing — Verlässliche Prozess-Synchronisation

**Problem:** Der 3-Sekunden-`setTimeout` im Updater ist willkürlich. Wenn Windows die frisch heruntergeladene `install-autostart.js` noch als gesperrt markiert, scheitert `execSync`.

**Best Practice: Readiness-Check statt blindem Warten**

Statt auf eine feste Wartezeit zu vertrauen, prüft `updater.js` aktiv ob die Datei lesbar ist, bevor er sie ausführt:

```js
function waitForFile(filePath, maxWaitMs, cb) {
    const start = Date.now();
    function check() {
        try {
            fs.accessSync(filePath, fs.constants.R_OK);
            cb(null); // Datei ist lesbar
        } catch (e) {
            if (Date.now() - start > maxWaitMs) { cb(e); return; }
            setTimeout(check, 200);
        }
    }
    check();
}
```

Zusätzlich: Die Wartezeit vor `npm install` von 3s auf 1s reduzieren, dafür den `waitForFile`-Check einschalten. Maximal 10 Sekunden warten, dann Fehler loggen.

### Risiko 2 (zusätzlich): Download-URL validieren bevor Update gestartet wird

**Problem:** Die Raw-URL-Konstruktion `https://raw.githubusercontent.com/.../v{version}/Client/` ist ungetestet. Wenn der Tag falsch ist, schlägt der Download still fehl.

**Best Practice: URL-Vorab-Validierung**

Vor dem eigentlichen Download einen HEAD-Request (oder GET auf `version.json`) gegen die konstruierte Base-URL senden. Nur wenn dieser Request 200 zurückgibt, wird das Update fortgesetzt:

```js
// HEAD-Request auf: base + 'version.json.template'
// Bei Fehler: Log + Update komplett überspringen (nicht abbrechen)
```

Das macht die URL-Konstruktion testbar und verhindert dass ein falscher Tag einen Halb-Update auslöst.

### Risiko 4: DB-Migration — Trennnung von Schema-Migration und Datenmigration

**Problem:** Die `INSERT INTO wp_lotro_characters ... SELECT FROM wp_lotro_deaths`-Datenmigration läuft bei jedem `db_version`-Wechsel, auch bei zukünftigen Minor-Releases die keine Datenmigration brauchen.

**Best Practice: Eigene Versions-Option für Datenmigration**

Separate WP-Option `lotro_death_tracker_data_migration` führen, die nur einmalig gesetzt wird:

```php
$data_migrated = get_option('lotro_death_tracker_data_migration', '0');
if ($data_migrated !== '1') {
    // INSERT INTO ... SELECT ... (einmalige Datenmigration)
    update_option('lotro_death_tracker_data_migration', '1');
}
```

So läuft die Datenmigration genau einmal und nie wieder, unabhängig von `$db_version`.

### Risiko 7: UPDATE.bat — Expliziter Fallback wenn LOTRO-Pfad nicht gefunden

**Problem:** Wenn alle drei Pfad-Checks fehlschlagen, läuft die Batch mit leerem `LOTRO_PATH` in `:update_lotro_found`. Die manuelle Eingabe-Aufforderung enthält keinen klaren Hinweis was zu tun ist.

**Best Practice: Expliziter Fallback-Block**

Zwischen dem letzten Pfad-Check und dem Label `:update_lotro_found` einen expliziten Fallback einfügen, der den Nutzer mit einem konkreten Beispiel um Eingabe bittet — und bei leerer Eingabe explizit abbricht statt mit ungültigem Pfad weiterzumachen.

### Betroffene Komponenten

| Komponente | Änderung | Priorität |
|---|---|---|
| `install-autostart.js` | Staging-Verzeichnis für Downloads, URL-Vorab-Validierung | **Hoch** |
| `updater.js` | `waitForFile`-Check statt blindem Timeout | **Hoch** |
| `lotro-death-tracker.php` | Datenmigration in separate Option auslagern | **Mittel** |
| `UPDATE.bat` | Expliziter Fallback mit Abbruch statt leerer Eingabe | **Klein** |

**Aufwand: Mittel** — Die Staging-Logik in `install-autostart.js` ist der aufwändigste Teil. Updater und PHP-Änderung sind überschaubar.

**Offene Entscheidungen:**
- Soll das Staging-Verzeichnis `update-staging/` oder `.update-tmp/` heißen?
- Soll bei einem fehlgeschlagenen Update der Nutzer eine Benachrichtigung erhalten (z.B. Eintrag in `watcher.log` + Systembenachrichtigung via PowerShell `msg`)?

---

---

## Thema 10 — Test-Umgebung (Staging)

**Ziel:** Vor dem Verteilen eines Updates (v1.5 → v2.1 oder zukünftige Releases) einen vollständigen End-to-End-Test ohne Produktionsdaten ermöglichen. Testdaten landen in separaten Datenbanktabellen und werden nach Testabschluss explizit gelöscht.

### Architektur

```
Client im Test-Modus
  SERVER_URL=.../v1/test/death node client.js
       │
       ▼
WordPress API /test/death (neue Test-Endpunkte)
       │  schreibt in wp_lotro_deaths_test
       │  schreibt in wp_lotro_characters_test
       ▼
Test-Overlay (streamelements-overlay-test.html)
       │  liest von /test/death/current
       │  schreibt /test/death/next (als gezeigt markieren)
       │  kein Streamer-Filter, kein Sound
       ▼
Nach Test: DELETE /test/clear → Testtabellen geleert
```

Produktionsdaten in `wp_lotro_deaths` und `wp_lotro_characters` bleiben **vollständig unangetastet**.

### Neue API-Endpunkte (Test-Modus)

| Endpoint | Methode | Auth | Funktion |
|---|---|---|---|
| `/test/death` | POST | — | Tod/Level-Event in Testtabelle eintragen |
| `/test/death/current` | GET | — | Ältester unverarbeiteter Test-Eintrag |
| `/test/death/next` | POST | — | Test-Eintrag als gezeigt markieren, nächsten holen |
| `/test/queue` | GET | — | Test-Queue-Status |
| `/test/health` | GET | — | Test-API Status + Tabellen-Zähler |
| `/test/clear` | DELETE | Admin | Beide Testtabellen leeren (`TRUNCATE`) |

### Test-Ablauf (manuell)

```
1. WordPress-Plugin deployen (enthält neue Test-Endpunkte + Test-Tabellen)

2. Client im Test-Modus starten:
   SERVER_URL=https://www.dodaswelt.de/wp-json/lotro-deaths/v1/test/death node client.js

3. Test-Overlay öffnen (lokal oder in OBS):
   Overlay/streamelements-overlay-test.html

4. Im Spiel sterben → Client sendet an /test/death → Test-Overlay zeigt Event an
   → Prüfen: Race/Class korrekt? Overlay-Timing korrekt? Log sauber?

5. UPDATE.bat-Test (v1.5 → v2.1):
   a. v1.5-Installation simulieren / echte v1.5-Umgebung nutzen
   b. UPDATE.bat ausführen
   c. Prüfen: Client-Version in version.json? Watcher korrekt regeneriert?
   d. Erneut sterben → Daten kommen in Testtabelle an

6. Nach erfolgreichem Test:
   DELETE https://www.dodaswelt.de/wp-json/lotro-deaths/v1/test/clear
   (mit WordPress Admin-Credentials per Basic Auth oder Application Password)

7. Update freigeben
```

### Test-Überwachung

```bash
# Test-Queue prüfen (PowerShell)
Invoke-RestMethod -Uri "https://www.dodaswelt.de/wp-json/lotro-deaths/v1/test/health" -Method GET

# Test-Daten einsehen
Invoke-RestMethod -Uri "https://www.dodaswelt.de/wp-json/lotro-deaths/v1/test/queue" -Method GET

# Testtabellen leeren (Admin-Credentials erforderlich)
Invoke-RestMethod -Uri "https://www.dodaswelt.de/wp-json/lotro-deaths/v1/test/clear" `
  -Method DELETE `
  -Headers @{ Authorization = "Basic " + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("user:pass")) }
```

### Betroffene Komponenten

| Komponente | Änderung |
|---|---|
| `lotro-death-tracker.php` | `$table_deaths_test`, `$table_characters_test`; Test-Tabellen in `create_tables()`; Test-Routen in `register_routes()`; `with_test_tables()`; Test-Wrapper-Methoden; `api_test_clear()` |
| `Overlay/streamelements-overlay-test.html` | Neues Test-Overlay (kein Streamer-Filter, kein Sound, TEST-Badge) |
| `Client/client.js` | Keine Änderung — `SERVER_URL`-Env-Variable schon vorhanden |

**Aufwand: Mittel** — WP-Plugin-Erweiterung war der Hauptaufwand. Test-Overlay ist eine angepasste Kopie des Prod-Overlays.

---

## Gesamtübersicht

| # | Thema | Version | Aufwand | Status |
|---|---|---|---|---|
| 1 | Auto-Update-System (Watcher) | 2.0 | **Groß** | ✅ implementiert |
| 2 | Pfad-Erkennung bei Installation | 2.0 | **Mittel** | ✅ implementiert |
| 3 | Race/Class im Plugin | 2.1 | **Mittel** | ✅ implementiert |
| 4 | GitHub Repository Setup | 2.0 | **Klein** | ✅ implementiert |
| 5 | WP Plugin Auto-Update | 2.0 | **Mittel** | ✅ implementiert |
| 6 | Fetcher-Updates via GitHub | 2.0 | **Minimal** | ✅ implementiert |
| 7 | Updater für v1.5 → v2.0 | 2.0 | **Klein** | ✅ implementiert |
| 8 | Versionierungsstrategie | 2.0 | **Klein** | ✅ implementiert |
| 9 | Risikominimierung vor Release | 2.1 | **Mittel** | ✅ implementiert |
| 10 | Test-Umgebung (Staging) | 2.2 | **Mittel** | ✅ implementiert |

**Release von v2.0/v2.1 ist freigegeben (Thema 9 abgeschlossen).**
**Thema 10 wird mit dem nächsten Release (v2.2) ausgeliefert.**
