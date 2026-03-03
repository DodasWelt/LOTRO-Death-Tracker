# Risikoanalyse v2.3 — 3-Perspektiven-Review

**Stand:** 3. März 2026
**Basis:** Code-Review nach Implementierung von v2.3 (Thema 11: Watcher Singleton-Lock + Versions-Bump v2.1→v2.3).

Geprüfte Dateien: `Client/install-autostart.js` (generierter Watcher-Code), `Client/client.js`, `Client/updater.js`, `Client/package.json`, `Client/version.json.template`, `LOTRO-Plugin/Main.lua`, `LOTRO-Plugin/DeathTracker.plugin`, `WordPress/lotro-death-tracker.php`, `Overlay/streamelements-overlay-minimalist.html`, `Overlay/streamelements-overlay-test.html`, `Website/lotro-data-fetcher.js`, `INSTALL.bat`, `UPDATE.bat`

Vorgänger-Analyse: `RISIKOANALYSE-v2.0.md` (v2.1-Analyse + v1.5→v2.1-Verteilungsrisiken)

---

## Was hat sich in v2.3 geändert?

| Änderung | Dateien | Auswirkung auf Risiko |
|---|---|---|
| Thema 11: Watcher Singleton-Lock (`watcher.pid`) | `install-autostart.js` | **Behebt P2-C** (Doppelter Watcher) |
| Thema 10: Test-Umgebung | `lotro-death-tracker.php`, `streamelements-overlay-test.html` | Neue Angriffsfläche (gering) |
| UPDATE.bat: goto-Struktur, VBScript-Popup, Node.js-Erkennung | `UPDATE.bat` | Geringere Installations-Fehlerrate |
| INSTALL.bat: vollständig überarbeitet | `INSTALL.bat` | Geringere Installations-Fehlerrate |
| Versions-Sprung: v2.1 → v2.3 (v2.2 nie released) | alle Versionsdateien | Erster Auto-Update aus v2.0 → v2.3 |

## Nachträgliche Fixes (nach Risikoanalyse, vor v2.3-Release)

| Fix | Dateien | Behebt |
|---|---|---|
| `acquireLock()`: `spawnSync('tasklist')` prüft ob PID zu `node.exe` gehört | `install-autostart.js` (Watcher-Template) | **P1-E** ↓ auf 🟢 Gering |
| `install()`: `watcher.pid` wird vor Spawn des neuen Watchers gelöscht | `install-autostart.js` | **P2-E** ↓ auf 🟢 Gering |
| `updater.js`: `process.execPath` statt `'node'`; `npm.cmd` aus node-Verzeichnis abgeleitet | `updater.js` | **P2-A** ↓ Mitigationen verstärkt |
| `updater.js`: Verifikation ob `lotro-watcher.js` nach Install vorhanden ist | `updater.js` | **P2-A** stille Fehler sichtbar |
| Troubleshooting-Abschnitt für PID-Lock in Anleitung | `ANLEITUNG.md` | **P1-E** Selbstheilung dokumentiert |

---

## Gelöste Risiken aus v2.1-Analyse

**P2-C (Doppelter Watcher bei UPDATE.bat) — BEHOBEN**
Der Singleton-Lock erkennt beim Start einen bereits laufenden Watcher und beendet sich sofort (`process.exit(0)`). Selbst wenn UPDATE.bat einen neuen Watcher startet während der alte noch im Speicher ist (selten, Timing-abhängig), gewinnt der erste — der zweite beendet sich ohne Client zu starten.

---

## Perspektive 1: Streamer (Endnutzer)

*Frage: Was kann beim normalen Betrieb schiefgehen? Was bemerkt der Streamer, und kann er es selbst beheben?*

### 🟡 Mittleres Risiko

**P1-A — Race/Class-Enum-Werte: Silent-Fallback auf "Unknown"** *(unverändert aus v2.1)*
`Main.lua` mappt `GetRace()` / `GetClass()` auf Volksname/Klasse. Enum-Werte aus Drittquellen (LotroCompanion), nicht live verifiziert. Falsches Mapping landet still als `"Unknown"`.

- **Auswirkung:** Volk/Klasse zeigt "Unknown" auf der Website.
- **Wahrscheinlichkeit:** Mittel — Enums wurden nicht in-game verifiziert.
- **Empfehlung:** Einmalig in-game je einen Charakter jedes Volks prüfen.

**~~P1-E — Singleton-Lock: Watcher startet nach hartem Crash nicht (PID-Wiederverwendung)~~ — BEHOBEN**
`acquireLock()` prüft jetzt via `spawnSync('tasklist')` ob die gespeicherte PID tatsächlich zu einem `node.exe`-Prozess gehört. Gehört sie einem fremden Prozess, wird der Lock als Stale behandelt und überschrieben. Nur wenn `node.exe` mit dieser PID läuft, beendet sich der neue Watcher.

- **Restrisiko:** Verschwindend gering — erfordert, dass ein anderer `node.exe`-Prozess zufällig genau die PID des alten Watchers erbt. In der Praxis nicht relevant.
- **Selbstheilung dokumentiert:** ANLEITUNG.md enthält nun einen Troubleshooting-Abschnitt: `watcher.pid` löschen → `npm run install-service`.
- **Bewertung:** 🟢 Gering (vorher: 🟡 Mittel)

### 🟢 Geringes Risiko

**P1-B — Event-Verlust bei Server-Ausfall** *(unverändert aus v2.1)*
Bei Ausfall von `dodaswelt.de` genau im Moment eines Todes geht das Event verloren (plugindata wird vom nächsten Event überschrieben).

- **Wahrscheinlichkeit:** Sehr gering.
- **Resilienz:** Keine automatische Nachsendung vorgesehen.

**P1-C — Watcher startet nicht nach Windows-Neustart (AV/GPO)** *(unverändert aus v2.1)*
VBS-Startup-Datei kann durch Antivirensoftware oder Group Policies blockiert werden.

- **Behebbarkeit:** `npm run install-service` erneut ausführen oder AV-Whitelist.

**P1-D — LOTRO-Pfad ändert sich nach Installation** *(unverändert aus v2.1)*
Bei LOTRO-Neuinstallation an anderem Ort findet der Client die plugindata-Dateien nicht mehr. Client beendet sich mit `process.exit(1)`, Watcher startet ihn alle 5s neu.

- **Behebbarkeit:** `LOTRO_PATH`-Umgebungsvariable setzen oder `INSTALL.bat` neu ausführen.

**P1-F — Singleton-Lock: Race Condition bei gleichzeitigem Start (zwei Watcher in Millisekunden-Abstand)**
Wenn zwei Watcher-Prozesse exakt gleichzeitig starten (beide lesen `watcher.pid` als abwesend bevor einer geschrieben hat), schreiben beide ihre PID in die Datei und starten beide. Der Lock schützt nicht vor diesem theoretischen Timing.

- **Auswirkung:** Doppelter Watcher wie vor v2.3. Doppelte Events möglich.
- **Wahrscheinlichkeit:** Extrem gering — erfordert zwei voneinander unabhängige Starter im Millisekunden-Fenster (z.B. VBS-Autostart trifft auf manuellen Start in gleicher Sekunde). In der Praxis nicht relevant.
- **Resilienz:** Duplikat-Schutz in `client.js` (`lastProcessedTimestamp`) und Duplikat-Schutz im Lua-Plugin (`lastDeathWasLogged`) fangen die meisten doppelten Events ab.

---

## Perspektive 2: Entwickler / Wartung

*Frage: Was kann bei zukünftigen Releases und Code-Änderungen schiefgehen?*

### 🟡 Mittleres Risiko

**P2-A — Auto-Update erstmals mit echtem GitHub-Release ungetestet** *(aktualisiert, Mitigationen verstärkt)*
Der vollständige Update-Zyklus wurde noch nicht mit einem echten `v2.3`-Release gegen eine reale `v2.0`-Installation durchgespielt.

Neue Code-Mitigationen seit Risikoanalyse:
- `updater.js` verwendet `process.execPath` statt `'node'` → kein PATH-Problem auch in nicht-Standard-Umgebungen
- `npm.cmd` wird aus dem Verzeichnis von `node.exe` abgeleitet (analog zu UPDATE.bat) → kein Admin-PATH-Problem
- Nach `install-autostart.js install` wird geprüft ob `lotro-watcher.js` tatsächlich erstellt wurde → stille Fehler werden sichtbar

- **Auswirkung bei Fehler:** URL-Validierung, Staging-Mechanismus und jetzt Verifikationscheck verhindern inkonsistente Zustände. Watcher läuft im schlimmsten Fall auf v2.0 weiter.
- **Bewertung:** 🟡 Mittel (unverändert — Code-Verbesserungen reduzieren Wahrscheinlichkeit, aber ein echter Test bleibt empfohlen)
- **Empfehlung:** Nach v2.3-Release `watcher.log` auf einer v2.0-Installation beobachten.

**~~P2-E — `watcher.pid` muss bei neuen Watcher-Typen oder Installation mitgedacht werden~~ — BEHOBEN**
`install-autostart.js install()` löscht jetzt `watcher.pid` **vor** dem Spawn des neuen Watchers. Damit ist sichergestellt, dass kein Stale-Lock aus einem früheren Lauf den neuen Watcher blockiert — auch wenn `install-autostart.js install` ohne vorheriges `taskkill` aufgerufen wird.

- **Verbleibende Empfehlung:** `UPDATE.bat` und `INSTALL.bat` führen `taskkill /F /IM node.exe /T` weiterhin VOR `install-autostart.js install` aus (wichtig damit Datei-Handles freigegeben sind). Dieses Muster muss bei zukünftigen BAT-Änderungen beibehalten werden.
- **Bewertung:** 🟢 Gering (vorher: 🟡 Mittel)

### 🟢 Geringes Risiko

**P2-B — Neue DB-Spalte ohne SHOW COLUMNS Fallback** *(unverändert aus v2.1)*
Kein Schema-Change in v2.3. Relevant für zukünftige Releases.

**P2-D — Versionssynchronität: 7 Stellen bei jedem Release** *(aktualisiert)*
Für v2.3: PHP-Header, `package.json`, `version.json.template`, `client.js`, `.plugin`, `Main.lua`, Git-Tag. `$db_version` bleibt bei `'2.1'` (kein Schema-Change).

- **Dokumentiert:** CLAUDE.md enthält vollständige Checkliste.

**P2-F — Singleton-Lock: Beschädigte `watcher.pid` (nicht-numerischer Inhalt)**
Wenn `watcher.pid` unvollständig (leere Datei, partial write bei Disk-Full) oder korrumpiert ist, gibt `parseInt(content, 10)` `NaN` zurück. `if (existingPid && existingPid !== process.pid)` — `NaN` ist falsy → der Block wird übersprungen. Der Watcher schreibt seine eigene PID über den alten Inhalt und startet normal.

- **Auswirkung:** Keine. Das ungültige Lock-File wird transparent überschrieben.
- **Resilienz:** ✅ Bereits korrekt abgesichert durch `parseInt`-Semantik.

---

## Perspektive 3: Infrastruktur / Externe Abhängigkeiten

*Frage: Was passiert wenn externe Dienste ausfallen oder ihr Verhalten ändern?*

### 🟡 Mittleres Risiko

*Keine neuen Einträge.*

### 🟢 Geringes Risiko

**P3-A bis P3-E** *(unverändert aus v2.1-Analyse)*
GitHub-API-Ausfall, WordPress-Server-Ausfall, raw.githubusercontent.com-Ausfall, StreamElements-Ausfall, LOTRO-Lua-API-Änderung — alle weiterhin gültig und unverändert bewertet.

**P3-F — jsDelivr CDN-URL veraltet (`@v2.1`) nach v2.3-Release** *(aktualisiert)*
Die `herrin-inge.de`-Einbindung verwendet `@v2.1`. Nach v2.3-Release muss das Script-Tag manuell auf `@v2.3` aktualisiert werden. Solange `lotro-data-fetcher.js` rückwärtskompatibel bleibt, kein funktionaler Ausfall.

- **Behebbarkeit:** Manuell den Script-Tag auf `@v2.3` updaten. Dokumentiert in `CLAUDE.md`.

**P3-G — Test-Tabellen: Vergessene Bereinigung nach End-to-End-Test**
`wp_lotro_deaths_test` und `wp_lotro_characters_test` akkumulieren Daten, wenn `DELETE /test/clear` nach einem Test nicht aufgerufen wird. Keine Produktionsdaten betroffen. Keine automatische TTL oder Bereinigung vorgesehen.

- **Auswirkung:** Test-Tabellen wachsen unbegrenzt. Kein Einfluss auf Produktion.
- **Wahrscheinlichkeit:** Gering — Test-Umgebung wird bewusst genutzt.
- **Behebbarkeit:** `DELETE /test/clear` aufrufen (erfordert Admin-Credentials).

**P3-H — Test-API-Credentials: Basic Auth für `/test/clear`**
Der `DELETE /test/clear`-Endpoint ist durch WordPress Basic Auth (Application Password) geschützt. Credentials werden im PowerShell-Befehl im Klartext übergeben. Bei Command-History-Leak könnten Credentials sichtbar sein.

- **Auswirkung:** Im schlimmsten Fall: Testtabellen können geleert werden. Produktionsdaten sind nicht betroffen. Kein Schreibzugriff auf Produktions-Endpunkte über diese Credentials.
- **Resilienz:** Teilweise — Credentials sollten Application Passwords sein (nur für diesen Endpoint) und nicht das WP-Admin-Passwort.

---

## Gesamtbewertung v2.3

| Perspektive | Mittleres Risiko | Geringes Risiko | Behoben |
|---|---|---|---|
| **Streamer** | Race/Class-Enums (P1-A) | Event-Verlust (P1-B), AV-Block (P1-C), Pfadänderung (P1-D), ~~PID-Reuse (P1-E)~~ ✅, Lock Race Condition (P1-F) | Doppelter Watcher (P2-C) ✅, PID-Reuse (P1-E) ✅ |
| **Entwickler** | Auto-Update erstmals ungetestet (P2-A, verstärkte Mitigationen) | DB-Spalte ohne Fallback (P2-B), Versionssynchronität (P2-D), Beschädigte PID-Datei (P2-F), ~~Lock + BAT-Reihenfolge (P2-E)~~ ✅ | P2-E ✅ |
| **Infrastruktur** | — | GitHub/WP/SE-Ausfälle (P3-A–E), jsDelivr veraltet (P3-F), Test-Cleanup vergessen (P3-G), Test-Credentials (P3-H) | — |

**Fazit nach nachträglichen Fixes:** P1-E (PID-Wiederverwendung) und P2-E (Mehrfachinstallation ohne taskkill) sind vollständig behoben. P2-A (ungetesteter Auto-Update) bleibt das einzige mittlere Risiko — der Code ist jetzt robuster (PATH-unabhängige Node/npm-Pfade, Post-Install-Verifikation), aber ein echter Test-Durchlauf bleibt die abschließende Bestätigung.

**Release v2.3 ist bereit.** Einzige Empfehlung vor breiter Verteilung: P1-A (Race/Class-Enums) und P2-A (Auto-Update-Ablauf) einmalig in Echtbetrieb verifizieren.

---

---

# Risikoanalyse: Verteilung v2.0 → v2.3 (Auto-Update)

**Stand:** 3. März 2026
**Zweck:** Bewertung des ersten echten Auto-Updates aus v2.0 → v2.3.

---

## Was passiert beim Auto-Update v2.0 → v2.3?

```
v2.0-Watcher startet
  → checkAndApplyUpdate(): findet v2.3-Release auf GitHub
  → compareVersions('2.3', '2.0') > 0 → Update erforderlich
  → HEAD-Validierung auf raw.githubusercontent.com/.../v2.3/Client/version.json.template
  → update-staging/ anlegen
  → Downloads: client.js, install-autostart.js, package.json, updater.js
  → Atomares Rename in Produktion
  → updater.js spawnen (detached)
  → Watcher beendet sich
    ↓
  updater.js (v2.3):
  → isLotroRunning(): VBScript-Dialog falls LOTRO läuft
  → waitForFile(install-autostart.js, 10s)
  → npm install (--no-audit --no-fund)
  → node install-autostart.js install
    → generiert lotro-watcher.js (v2.3, MIT Singleton-Lock)
    → generiert start-lotro-watcher.vbs
    → kopiert VBS in Startup-Ordner
    → startet neuen Watcher (MIT Singleton-Lock)
    → process.exit(0)
  → version.json: { "version": "2.3" }
  → VBScript-Popup: "Update auf v2.3 erfolgreich!"
  → updater.js löscht sich selbst
```

### Besonderheit: v2.1 und v2.2 wurden nie released

Die Versionsnummern v2.1 und v2.2 existieren nicht als GitHub-Tags. Der Sprung ist direkt v2.0 → v2.3. `compareVersions` arbeitet numerisch und hat damit kein Problem.

---

## Risiken beim Auto-Update v2.0 → v2.3

### 🟡 Mittleres Risiko

**AU-1 — Erstmaliger Auto-Update-Durchlauf ungetestet**
Der komplette Update-Ablauf (GitHub-API → Download → Staging → Rename → Updater → npm install → install-autostart.js) wurde noch nicht mit einem echten v2.0-Release gegen eine echte v2.0-Installation durchgespielt.

- **Auswirkung bei Fehler:** URL-Validierung und Staging-Mechanismus verhindern inkonsistente Zustände. Schlimmster Fall: Watcher bleibt auf v2.0, Log enthält Fehlergrund.
- **Erkennung:** `watcher.log` auf Nutzersystem — enthält alle Schritte.
- **Empfehlung:** Ersten Update-Durchlauf auf einer Testmaschine oder mit dem echten Streamer-PC protokollieren.

**AU-2 — v2.3-`updater.js` läuft auf v2.0-Infrastruktur**
Nach dem Download und Rename läuft der neue `updater.js` (v2.3) auf einem v2.0-System. Der Updater setzt voraus, dass `install-autostart.js` vorhanden und lesbar ist (`waitForFile`). In v2.0 war `install-autostart.js` bereits vorhanden — dieses Risiko ist damit gering.

- **Neuerung in updater.js (v2.3 vs v2.0):** LOTRO-Check via `spawnSync('tasklist', ...)` + VBScript-Dialog-Kette. Diese Logik war in v2.0 nicht vorhanden. Die neue `updater.js` läuft vollständig autark.
- **Auswirkung:** Keine — alle neuen Updater-Features sind für sich funktionsfähig.

### 🟢 Geringes Risiko

**AU-3 — `watcher.pid` nach Update: kein Stale-Lock-Problem**
Der v2.0-Watcher hat keine `watcher.pid`-Datei (Singleton-Lock ist neu in v2.3). Nach dem Update wird `install-autostart.js install` aufgerufen, das einen neuen Watcher startet. Dieser schreibt als erstes seine PID in `watcher.pid`. Der v2.0-Watcher ist zu diesem Zeitpunkt bereits beendet (exit(0) nach Updater-Spawn). Kein Konflikt.

- **Resilienz:** ✅ Reibungsloser Übergang.

**AU-4 — npm install Netzwerkfehler → Fallback auf vorhandene node_modules**
Wenn `npm install` während des Updates fehlschlägt (kein Internet, npm-Registry down), gibt `updater.js` den Fehler in `errors[]` und zeigt ihn im Abschluss-Dialog. Die bestehenden `node_modules` aus v2.0 sind mit v2.3 kompatibel (`axios`, `chokidar` — keine neuen Dependencies in v2.3).

- **Auswirkung:** npm install schlägt fehl, aber Watcher und Client starten trotzdem.
- **Resilienz:** Teilweise — `updater.js` zeigt Fehlerliste, markiert aber trotzdem version.json als aktualisiert? Nein — `updater.js` schreibt `version.json` erst nach `install-autostart.js install` und führt das auch bei npm-Fehler aus. Das ist korrekt (Code ist korrekt deployed, nur Dependencies nicht refresht).

**AU-5 — WP-Plugin muss separat aktualisiert werden**
Das WordPress-Plugin wird durch Auto-Update nicht aktualisiert. Der neue v2.3-Client ist vollständig rückwärtskompatibel mit dem v2.1-WP-Plugin (keine API-Änderungen in v2.3 — nur Client-seitige Änderungen).

- **Auswirkung:** Keine — v2.3 führt keine neuen API-Felder oder Endpunkte ein.

---

## Gesamtbewertung: Auto-Update v2.0 → v2.3

| Risiko | Bewertung | Mitigiert durch |
|---|---|---|
| Erstmaliger ungetesteter Update-Ablauf (AU-1) | 🟡 Mittel | Staging, URL-Validierung, Logging |
| updater.js auf v2.0-Infrastruktur (AU-2) | 🟢 Gering | Abwärtskompatibilität |
| watcher.pid nach Update (AU-3) | 🟢 Kein Risiko | Sauberer Ablauf ✅ |
| npm install schlägt fehl (AU-4) | 🟢 Gering | Vorhandene node_modules kompatibel |
| WP-Plugin separat updaten (AU-5) | 🟢 Kein Risiko | Keine API-Änderungen in v2.3 ✅ |

**Fazit: Auto-Update v2.0 → v2.3 kann verteilt werden.** Das einzige mittlere Risiko (AU-1: ungetesteter Ablauf) kann durch Beobachtung des ersten echten Update-Durchlaufs verringert werden.
