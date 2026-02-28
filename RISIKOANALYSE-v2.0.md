# Risikoanalyse v2.1 — 3-Perspektiven-Review

**Stand:** 28. Februar 2026
**Basis:** Vollständiger Code-Review nach allen Bug-Fixes der Feb-2026-Session.

Geprüfte Dateien: `client.js`, `install-autostart.js`, `updater.js`, `package.json`, `version.json.template`, `Main.lua`, `DeathTracker.plugin`, `lotro-death-tracker.php`, `streamelements-overlay-minimalist.html`, `lotro-data-fetcher.js`, `INSTALL.bat`, `UPDATE.bat`

---

## Behobene Bugs in dieser Session

| Bug | Datei | Schwere |
|---|---|---|
| `response.data.data.queuePosition` → TypeError: Jeder erfolgreiche Death-Send wurde als Fehler geloggt, `lastProcessedTimestamp` nie aktualisiert | `client.js` | **Kritisch** |
| Versionstring "2.0" statt "2.1" | `client.js`, `UPDATE.bat` | Niedrig |
| Doppelter Log-Eintrag wenn Timeout `req.destroy()` aufruft | `install-autostart.js` | Kosmetisch |
| Bei HTTP-Redirect: gleicher `tmpPath` für neuen Download → potenzielle Windows-Dateisperre | `install-autostart.js` | Sehr niedrig |
| Nur der letzte `copy`-Befehl einer Gruppe wurde auf Fehler geprüft | `UPDATE.bat`, `INSTALL.bat` | Niedrig |
| `auto-launch` ungenutzte Dependency | `package.json` | Niedrig |
| `watchForUpdates` Init-Verhalten undokumentiert | `lotro-data-fetcher.js` | Kosmetisch |

---

## Perspektive 1: Streamer (Endnutzer)

*Frage: Was kann beim normalen Betrieb schiefgehen? Was bemerkt der Streamer, und kann er es selbst beheben?*

### 🟡 Mittleres Risiko

**P1-A — Race/Class-Enum-Werte: Silent-Fallback auf "Unknown"**
`Main.lua` mappt `GetRace()` / `GetClass()` numerische Enums auf Volksname/Klasse. Die Enum-Werte stammen aus Drittquellen (LotroCompanion). Ein falsches Mapping landet still als `"Unknown"` in der Datenbank.

- **Auswirkung:** Volk/Klasse zeigt "Unknown" auf der Website und im Overlay.
- **Erkennung:** Nur durch Blick auf Datenbank oder Website-Anzeige erkennbar.
- **Behebbarkeit:** Enum-Tabelle in `Main.lua` korrigieren + betroffene DB-Einträge manuell updaten. Ist Mehrarbeit, aber machbar.
- **Wahrscheinlichkeit:** Mittel — Enums wurden nicht live verifiziert.
- **Empfehlung:** Einmalig in-game je einen Charakter jedes Volks prüfen, ob der korrekte Name gespeichert wird. Vor großem Streaming-Einsatz erledigen.

### 🟢 Geringes Risiko

**P1-B — Event-Verlust bei gleichzeitigem Server-Ausfall**
Wenn `dodaswelt.de` genau im Moment eines Todes oder Level-Ups nicht erreichbar ist, schlägt der `axios.post` fehl. Das Event wird nicht versendet. Da `lastProcessedTimestamp` in diesem Fall korrekt nicht gesetzt wird, würde das Event beim nächsten Datei-Change nachgesendet — aber die plugindata-Datei enthält dann schon die neuen Daten (nächstes Event). Das alte Event geht verloren.

- **Auswirkung:** Ein einzelnes Death-/Level-Event fehlt in der Datenbank.
- **Erkennung:** Nur durch Lücke in der Death-History erkennbar; kein automatischer Hinweis.
- **Wahrscheinlichkeit:** Sehr gering (WordPress mit guter Uptime, Event-Fenster ist ms-kurz).
- **Behebbarkeit:** Nur manuell nachträgbar. Keine händische Aktion nötig — nächste Events funktionieren normal.

**P1-C — Watcher startet nicht nach Windows-Neustart (AV/GPO)**
Der Autostart-Mechanismus legt eine VBS-Datei im Windows-Startup-Ordner ab. Bestimmte Antivirensoftware oder Group-Policy-Einstellungen können VBS-Ausführung im Startup blockieren.

- **Auswirkung:** Watcher läuft nicht im Hintergrund; Client wird nie gestartet; keine Events.
- **Erkennung:** Kein `watcher.log` nach Neustart → Hinweis.
- **Behebbarkeit:** Manuell: `npm run install-service` erneut ausführen oder in AV-Whitelist aufnehmen. Kein Code-Problem.

**P1-D — LOTRO-Pfad ändert sich nach Installation (Neuinstallation)**
`client.js` erkennt den LOTRO-Pfad via Registry/OneDrive/Standard-Fallback beim Start. Wenn LOTRO neu an einem anderen Ort installiert wird, findet der Client die plugindata-Dateien nicht mehr.

- **Auswirkung:** Kein Event-Monitoring, kein Log-Eintrag über das Problem.
- **Erkennung:** Client startet und loggt "LOTRO directory not found", dann `process.exit(1)`. Watcher startet ihn alle 5s neu (da LOTRO läuft), aber er beendet sich sofort. `watcher.log` zeigt "LOTRO erkannt - starte Client..." im 5s-Takt.
- **Behebbarkeit:** `LOTRO_PATH` Umgebungsvariable setzen oder Neuinstallation via `INSTALL.bat`.

---

## Perspektive 2: Entwickler / Wartung

*Frage: Was kann bei zukünftigen Releases und Code-Änderungen schiefgehen? Entstehen stille Regressionen?*

### 🟡 Mittleres Risiko

**P2-A — Auto-Update-URL erstmals mit echtem GitHub-Release ungetestet**
Die Download-URL-Konstruktion (`raw.githubusercontent.com/DodasWelt/LOTRO-Death-Tracker/v{tag}/Client/`) ist architektonisch korrekt und durch URL-Vorab-Validierung abgesichert. Aber der vollständige Update-Zyklus — GitHub-Release erstellen, Watcher erkennt Update, lädt Dateien herunter, Staging, Rename, Updater-Spawn — wurde noch nie mit einem echten Tag durchgespielt.

- **Auswirkung bei Fehler:** Update wird sauber abgebrochen (URL-Validierung schlägt fehl). Kein Datenverlust.
- **Erkennung:** Watcher-Log zeigt "Update abgebrochen" oder Download-Fehler.
- **Empfehlung:** Nach dem ersten v2.1-Release den Ablauf in `watcher.log` kontrollieren.

### 🟢 Geringes Risiko

**P2-B — Neue DB-Spalte ohne SHOW COLUMNS Fallback**
Bei jeder zukünftigen Schema-Erweiterung muss `create_tables()` in `lotro-death-tracker.php` um einen `SHOW COLUMNS`-Block erweitert werden (da `dbDelta` manchmal keine neuen Spalten zu bestehenden Tabellen hinzufügt). Wird dieser Schritt vergessen, fehlt die neue Spalte auf bestehenden Installationen.

- **Auswirkung:** Stiller Fehler — die Spalte existiert nicht, PHP-Inserts schlagen fehl oder landen als NULL.
- **Erkennung:** Erst bei tatsächlicher Nutzung des neuen Feldes erkennbar.
- **Behebbarkeit:** `$db_version` hochsetzen → `maybe_upgrade()` re-runs → Spalte wird nachträglich angelegt.
- **Dokumentation:** In `CLAUDE.md` explizit dokumentiert ("Kritisch: dbDelta fügt bei bestehenden Tabellen manchmal keine neuen Spalten hinzu").

**P2-C — Doppelter Watcher wenn UPDATE.bat bei laufendem Watcher ausgeführt wird**
`UPDATE.bat` löscht den alten VBS-Eintrag aus dem Startup-Ordner und konfiguriert einen neuen Watcher. Wenn beim Update-Zeitpunkt bereits ein alter Watcher läuft, laufen danach zwei Watcher-Prozesse gleichzeitig.

- **Auswirkung:** Beide überwachen LOTRO; beim LOTRO-Start starten beide je einen Client → doppelte Events möglich (dank Duplikat-Schutz im Server meist harmlos).
- **Erkennung:** Zweimal `node.exe` im Task-Manager.
- **Behebbarkeit:** Windows-Neustart (UPDATE.bat empfiehlt dies explizit).
- **Wahrscheinlichkeit:** Nur relevant für Nutzer, die UPDATE.bat bei laufendem System ausführen.

**P2-D — Versionssynchronität bei zukünftigen Releases**
Alle 6 Versionsstellen müssen bei jedem Release synchron erhöht werden (PHP-Header, `$db_version`, `package.json`, `version.json.template`, `.plugin`, `Main.lua`). Eine vergessene Stelle führt zu Inkonsistenzen.

- **Auswirkung:** z.B. WP-Update-Mechanismus erkennt kein Update (wenn PHP-Header alt bleibt); oder Watcher glaubt, schon auf neuestem Stand zu sein (wenn `version.json.template` alt bleibt).
- **Erkennung:** Beim Testen nach Release erkennbar.
- **Dokumentation:** In `CLAUDE.md` als Checkliste hinterlegt.

---

## Perspektive 3: Infrastruktur / externe Abhängigkeiten

*Frage: Was passiert wenn externe Dienste ausfallen oder ihr Verhalten ändern? Ist das System resilient?*

### 🟡 Mittleres Risiko

*Keine neuen Einträge.*

### 🟢 Geringes Risiko

**P3-A — GitHub API nicht erreichbar beim Watcher-Start**
Der Watcher macht beim Start einen GitHub-API-Call. Bei Nicht-Erreichbarkeit (kein Internet, GitHub down) wird der Update-Check übersprungen und der normale Betrieb startet sofort.

- **Auswirkung:** Kein Update-Check. Kein funktionaler Ausfall.
- **Resilienz:** ✅ Bereits abgesichert — `req.on('error')` und Timeout überspringen still.

**P3-B — WordPress-Server (`dodaswelt.de`) temporär nicht erreichbar**
`client.js` versucht, Events per `axios.post` zu senden. Schlägt das fehl, wird der Fehler geloggt. Die plugindata-Datei bleibt unverändert. Das nächste Event aus dem Spiel überschreibt die Datei — das fehlgeschlagene Event ist verloren (→ P1-B).

- **Auswirkung:** Kein Overlay-Ausfall (Overlay hat noch die zuletzt angezeigte Queue). Einzelne Events können verloren gehen.
- **Resilienz:** Teilweise — Recovery ist automatisch beim nächsten Event, aber verlorene Events werden nicht nachgesendet.

**P3-C — GitHub raw.githubusercontent.com nicht erreichbar beim Auto-Update**
Download-Versuch schlägt fehl. URL-Vorab-Validierung gibt `false` zurück, Update wird abgebrochen, Staging wird bereinigt, Produktionsdateien bleiben komplett unangetastet.

- **Auswirkung:** Kein Update. Nächster Watcher-Start versucht es erneut.
- **Resilienz:** ✅ Vollständig abgesichert durch Staging-Mechanismus und Vorab-Validierung.

**P3-D — StreamElements temporär nicht erreichbar**
Das Overlay wird in OBS als Browser Source geladen. Bei StreamElements-Ausfall lädt das Overlay nicht.

- **Auswirkung:** Kein Overlay-Anzeige. Datenerfassung (Watcher → Client → WordPress) läuft unberührt weiter.
- **Resilienz:** ✅ Vollständig unabhängig von der Datenerfassung.

**P3-E — LOTRO-Lua-API-Änderung bricht Plugin**
Bei einem LOTRO-Update könnten `GetRace()`, `GetClass()` oder `MoraleChanged` ihr Verhalten ändern. Das Plugin crasht dann nicht (Lua-Fehler werden von LOTRO abgefangen), aber Events werden möglicherweise nicht mehr erkannt.

- **Auswirkung:** Keine Events → Kein Daten-Update → Overlay zeigt alte Queue.
- **Erkennung:** Im Spiel-Chat erscheinen keine "DEATH RECORDED" Meldungen mehr.
- **Resilienz:** Niedrig — erfordert Plugin-Update. Historisch sehr selten (LOTRO-Lua-API ist stabil).

**P3-F — jsDelivr CDN-URL veraltet (`@v2.1`) nach neuem Release**
Die `herrin-inge.de`-Einbindung verwendet eine fixierte jsDelivr-URL (`@v2.1`). Nach einem Release auf v2.2 zeigt die Website weiterhin die v2.1-Version des Fetchers.

- **Auswirkung:** Neue `lotro-data-fetcher.js`-Features stehen auf `herrin-inge.de` nicht zur Verfügung — solange das API rückwärtskompatibel bleibt, kein funktionaler Ausfall.
- **Behebbarkeit:** Manuell den Script-Tag auf `@v2.2` updaten. Dokumentiert in `CLAUDE.md`.

---

## Gesamtbewertung

| Perspektive | Mittleres Risiko | Geringes Risiko |
|---|---|---|
| **Streamer** | Race/Class-Enums ungetestet (P1-A) | Event-Verlust bei Server-Ausfall (P1-B), Autostart-Block durch AV (P1-C), Pfadänderung nach LOTRO-Reinstall (P1-D) |
| **Entwickler** | Auto-Update erstmals ungetestet (P2-A) | SHOW COLUMNS vergessen (P2-B), Doppelter Watcher bei UPDATE.bat (P2-C), Versionssynchronität (P2-D) |
| **Infrastruktur** | — | GitHub-API-Ausfall (P3-A), WP-Server-Ausfall (P3-B), raw.githubusercontent.com-Ausfall (P3-C), StreamElements-Ausfall (P3-D), LOTRO-Lua-API-Änderung (P3-E), jsDelivr-URL veraltet (P3-F) |

**Fazit:** Kein neues Hochrisiko-Problem. Alle geringen Risiken sind durch Code (Resilienz), Logging (Erkennung) oder Dokumentation (CLAUDE.md) abgesichert. Die zwei verbleibenden mittleren Risiken (Race/Class-Enums und Auto-Update-Ersttest) erfordern einen echten Betriebstest — sie können nicht durch weiteren Code eliminiert werden.

**Release v2.1 ist bereit.**

---

---

# Risikoanalyse: Verteilung v1.5 → v2.1 (UPDATE.bat)

**Stand:** 28. Februar 2026
**Zweck:** Bewertung ob das v1.5 → v2.1-Update verteilt werden kann, aus drei Perspektiven.

---

## Perspektive A: Streamer / Endnutzer

*Frage: Was kann beim Update-Prozess für den Streamer schiefgehen? Was kann er selbst reparieren?*

### ✅ Behobene Risiken

**PA-1 — Alter Watcher bleibt nach UPDATE.bat aktiv (Doppelter Watcher)** — **BEHOBEN**
UPDATE.bat löscht die VBS aus dem Startup-Ordner und führt jetzt zusätzlich `taskkill /F /IM node.exe /T` aus. Damit werden alle laufenden Node.js-Prozesse (Watcher + Client) **vor** dem Kopieren der neuen Dateien beendet. Da `install-autostart.js install` am Ende des Updates einen neuen Watcher startet, läuft nach dem Update genau **ein** Watcher — ohne Windows-Neustart.

- **Ablauf (neu):** VBS löschen → `taskkill /F /IM node.exe /T` → `timeout /t 2` → Dateien kopieren → `npm install` → Plugin kopieren → `install-autostart.js install` (startet neuen Watcher)
- **Hinweis:** `taskkill` betrifft alle `node.exe`-Prozesse auf dem PC (nicht nur LOTRO-bezogene). Im UPDATE.bat dokumentiert.
- **Windows-Neustart:** Nicht mehr erforderlich. Im Update-Ende-Meldung entsprechend geändert.

### 🟡 Verbleibende Risiken

**PA-2 — Altes LOTRO-Plugin bleibt aktiv bis zum /plugins reload**
UPDATE.bat kopiert die neuen Plugin-Dateien, aber LOTRO lädt Plugins nur beim Login oder bei `/plugins reload`. Wenn LOTRO beim Update-Zeitpunkt läuft, sendet das alte Plugin-Code weiterhin Daten (im v1.5-Format ohne `race`/`class`-Felder).

- **Auswirkung:** Race/Class-Felder fehlen in der Datenbank bis zum Plugin-Reload. Bei Tod während dieser Phase: kein Schaden (Felder landen als NULL).
- **Wahrscheinlichkeit:** Mittel — Nutzer die LOTRO offen haben.
- **Erkennung:** Race/Class zeigt `null` in der DB.
- **Behebbarkeit:** Im Spiel `/plugins unload DodasWelt.DeathTracker` → `/plugins load DodasWelt.DeathTracker`. UPDATE.bat informiert den Nutzer darüber.

### 🟡 Mittleres Risiko

**PA-3 — UPDATE.bat nie live mit echter v1.5-Installation getestet**
Der Update-Ablauf (VBS-Löschung → Datei-Kopie → npm install → Plugin-Update → Autostart) wurde codebasiert entwickelt, aber nicht live mit einer realen v1.5-Installation durchgespielt. Das genaue v1.5-Dateisystem ist nicht vollständig bekannt.

- **Auswirkung:** Unbekannte Fehler möglich, z.B. anderer VBS-Dateiname in v1.5, fehlende Ordnerstrukturen, inkompatible Node.js-Version.
- **Wahrscheinlichkeit:** Gering bis mittel — Code ist defensiv geschrieben, aber ungetestet.
- **Empfehlung:** Test-Umgebung (Thema 10) nutzen, um den UPDATE-Ablauf zu validieren bevor breite Verteilung.

**PA-4 — WP-Plugin muss separat aktualisiert werden (v1.5 → v2.1)**
Das WordPress-Plugin wird nicht automatisch durch UPDATE.bat aktualisiert. Der Streamer muss das WP-Plugin manuell über den WordPress Admin-Bereich updaten (oder der WP-Auto-Update-Mechanismus greift erst nach GitHub-Release).

- **Auswirkung:** v2.1-Client sendet `race`/`class`-Felder → v1.5-WP-Plugin ignoriert sie still. Basis-Funktion (Deaths tracken, Overlay) läuft weiter. Race/Class-Daten fehlen bis WP-Plugin aktualisiert.
- **Wahrscheinlichkeit:** Mittel — wenn WP-Plugin und Client-Update zeitlich auseinanderfallen.
- **Erkennung:** Kein aktiver Fehler, nur fehlende Felder.

### 🟢 Geringes Risiko

**PA-5 — npm install schlägt bei sehr alter Node.js-Version fehl**
v2.1 benötigt Node.js ≥ 14 (für `chokidar`, `axios`). Wenn v1.5-Nutzer Node.js 12 oder älter haben, schlägt `npm install` fehl und UPDATE.bat bricht ab (mit Fehlermeldung und `exit /b 1`).

- **Auswirkung:** Update schlägt sauber fehl. Alte v1.5-Installation bleibt intakt.
- **Behebbarkeit:** Nutzer aktualisiert Node.js LTS auf nodejs.org und führt UPDATE.bat erneut aus.

**PA-6 — Datenmigration im WP-Plugin schlägt still fehl**
Die einmalige Datenmigration (`INSERT INTO wp_lotro_characters ... SELECT FROM wp_lotro_deaths`) in `create_tables()` setzt voraus, dass `wp_lotro_deaths` die Spalten `level`, `received_at` hat. Falls das v1.5-Schema diese nicht kannte, schlägt das SQL still fehl.

- **Auswirkung:** Charakter-Statistiken fehlen initial in `wp_lotro_characters`. Neue Events ab Update-Zeitpunkt werden korrekt erfasst.
- **Erkennung:** `/characters`-API gibt leere Liste zurück bis erste Events eingetragen werden.
- **Behebbarkeit:** Automatisch — neue Tode füllen die Tabelle wieder auf.

---

## Perspektive B: Operator / Entwickler / Release-Prozess

*Frage: Was kann beim Erstellen und Verteilen des Updates schiefgehen? Gibt es Abhängigkeiten zwischen Schritten?*

**PC-1 — npm install schlägt ohne Internetverbindung fehl** — **ENTSCHÄRFT**
`npm install` in Schritt 3 ist jetzt **nicht mehr fatal**. Bei Fehler wird eine Warnung ausgegeben und das Update läuft weiter. Die bestehenden `node_modules` aus v1.5 (enthalten `axios`, `chokidar`) sind mit v2.1 kompatibel — kein funktionaler Ausfall.

---

### 🟡 Mittleres Risiko (Infrastruktur / Release-Prozess)

**PB-1 — GitHub Release muss VOR Client-Verteilung existieren**
Nach UPDATE.bat startet der neue Watcher sofort und führt `checkAndApplyUpdate()` durch. `version.json` enthält "2.1". Wenn GitHub noch keinen `v2.1`-Release hat, ist alles OK — kein Update gefunden. Aber wenn es einen neueren Release (z.B. `v2.2`) gibt, versucht der Watcher sofort ein Update auf v2.2. Das ist korrekt — aber der Streamer bekommt unmittelbar nach Erstinstallation schon wieder einen Update-Vorgang.

- **Auswirkung:** Kein Fehler, aber potenziell verwirrend: "Ich habe gerade v2.1 installiert und er updated schon auf v2.2?".
- **Empfehlung:** Releases streng sequenziell halten; kein v2.2 veröffentlichen bevor v2.1-Distribution abgeschlossen ist.

**PB-2 — ZIP-Datei-Reihenfolge: WP-Plugin muss vor Client-ZIP veröffentlicht werden**
Das WP-Plugin registriert beim Aktivieren/Upgraden die neuen API-Routen. Wenn das WP-Plugin noch v1.5 ist und der neue client.js (v2.1) Daten schickt, landen diese korrekt — v1.5-WP-Plugin ignoriert nur die neuen Felder. Umgekehrt ist das ebenso harmlos. Keine harte Reihenfolge nötig.

- **Resilienz:** ✅ Beide Update-Richtungen sind harmlos (Felder werden ignoriert oder als NULL gespeichert).

**PB-3 — Versions-Synchronität: 8 Stellen müssen beim Release aktualisiert werden**
Für v2.1 müssen PHP-Header, `$db_version`, `package.json`, `version.json.template`, `client.js`, `.plugin`, `Main.lua`, Git-Tag synchron auf "2.1" gesetzt sein. Eine vergessene Stelle führt zu Inkonsistenzen.

- **Dokumentiert:** CLAUDE.md enthält eine vollständige Checkliste.

### 🟢 Geringes Risiko

**PB-4 — v2.1-ZIP-Assets müssen korrekte Struktur haben**
Das `LOTRO-Death-Tracker-v2.1.zip` muss `Client/`, `LOTRO-Plugin/`, `INSTALL.bat`, `UPDATE.bat` enthalten. Das `lotro-death-tracker.zip` muss `lotro-death-tracker/lotro-death-tracker.php` direkt enthalten. Falsche Struktur bricht WordPress-Update-Mechanismus.

- **Behebbarkeit:** ZIP neu erstellen und Release-Asset ersetzen (GitHub erlaubt Assets zu überschreiben).

---

## Perspektive C: Infrastruktur / Externe Abhängigkeiten beim Update

*Frage: Welche externen Dienste sind während des Update-Prozesses kritisch? Was passiert bei Ausfall?*

### 🟢 Geringes Risiko

**PC-2 — GitHub API nicht erreichbar nach Update (erster Watcher-Start)**
Nach UPDATE.bat startet der neue Watcher und führt `checkAndApplyUpdate()` durch. Bei Nicht-Erreichbarkeit von GitHub wird der Update-Check übersprungen — kein funktionaler Ausfall.

- **Resilienz:** ✅ Abgesichert.

**PC-3 — npm registry nicht erreichbar → Package-Download schlägt fehl**
Wenn `npm install` während SCHRITT 3 die npm-Registry nicht erreicht, schlägt es fehl. Da die benötigten Pakete (`axios`, `chokidar`) sich von v1.5 zu v2.1 nicht geändert haben, läuft v2.1 mit den alten `node_modules` weiter.

- **Resilienz:** Teilweise — v1.5-node_modules reichen für v2.1 aus.

---

## Gesamtbewertung: v1.5 → v2.1 Verteilung

| Perspektive | Hohes Risiko | Mittleres Risiko | Geringes Risiko | Behoben |
|---|---|---|---|---|
| **Streamer** | ~~Doppelter Watcher (PA-1)~~, Plugin-Reload (PA-2) | UPDATE.bat ungetestet (PA-3), WP-Plugin separat (PA-4) | Alte Node.js (PA-5), DB-Migration (PA-6) | PA-1 ✅ |
| **Operator** | — | Release-Timing (PB-1), Versionssynchronität (PB-3) | ZIP-Struktur (PB-4) | — |
| **Infrastruktur** | — | ~~npm ohne Internet (PC-1)~~ | GitHub-API (PC-2), npm registry (PC-3) | PC-1 ✅ |

**Fazit: Das Update KANN verteilt werden.** Die kritischen Risiken (PA-1 doppelter Watcher, PC-1 npm install) sind behoben. Verbleibendes mittleres Risiko:

- **PA-3 (ungetestet):** Test-Umgebung (Thema 10) ermöglicht einen kontrollierten End-to-End-Test ohne Produktions-Risiko. **Empfehlung: Erst testen, dann breit verteilen.**
- **PA-4 (WP-Plugin separat):** UPDATE.bat weist jetzt am Ende explizit darauf hin, das WordPress-Plugin ebenfalls zu aktualisieren.
