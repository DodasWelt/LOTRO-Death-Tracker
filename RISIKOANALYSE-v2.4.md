# Risikoanalyse v2.4 — 3-Perspektiven-Review

**Stand:** 6. März 2026
**Basis:** Code-Review nach Implementierung von v2.4 (Themen 12–19).

Geprüfte Dateien: `Client/install-autostart.js` (generierter Watcher-Code), `Client/client.js`, `Client/updater.js`, `Client/package.json`, `Client/version.json.template`, `LOTRO-Plugin/Main.lua`, `LOTRO-Plugin/DeathTracker.plugin`, `WordPress/lotro-death-tracker.php`, `Overlay/streamelements-overlay-minimalist.html`, `Overlay/streamelements-overlay-test.html`, `INSTALL.bat`, `UPDATE.bat`, `ANLEITUNG.md`

Vorgänger-Analyse: `RISIKOANALYSE-v2.3.md`

---

## Was hat sich in v2.4 geändert?

| Thema | Dateien | Art |
|---|---|---|
| T12: Plugin-Dateien im Auto-Update | `updater.js` | Neue Funktion |
| T13: Client-Crash-Restart via Watcher | `install-autostart.js`, `client.js` | Bug Fix |
| T14: Staging Rename-Backup | `install-autostart.js` | Bug Fix |
| T15: Versionsstrings & User-Agent | `INSTALL.bat`, `UPDATE.bat`, `ANLEITUNG.md`, `lotro-death-tracker.php` | Kosmetik |
| T16: Overlay `isChecking`-Flag | beide Overlays | Verbesserung |
| T17: Lokales Tod-Tracking & stiller DB-Abgleich | `Main.lua`, `install-autostart.js`, `lotro-death-tracker.php` | Neue Funktion (groß) |
| T18: Periodischer Update-Check (In-Game-Dialog) | `install-autostart.js` | Neue Funktion |
| T19: watcher.log Lokalzeit | `client.js`, `install-autostart.js` | Verbesserung |

---

## Perspektive 1: Streamer (Endnutzer)

*Frage: Was kann beim normalen Betrieb schiefgehen? Was bemerkt der Streamer, und kann er es selbst beheben?*

### 🔴 Hohes Risiko

*Keine.*

### 🟡 Mittleres Risiko

**P1-H — Update-Dialog blockiert Watcher-Event-Loop** *(neu, T18)*

`showVbsDialog()` ruft `spawnSync('wscript.exe', ...)` auf. `spawnSync` blockiert den Node.js-Event-Loop vollständig, bis der Nutzer den Dialog bestätigt. Während der Dialog offen ist:

- Der 5-Sekunden-`checkLOTRO()`-Takt läuft nicht.
- Falls LOTRO während der Dialog-Anzeige beendet wird, beendet der Watcher `client.js` erst nach Dialog-Schließung.
- Der 3h-Scheduler feuert zu festen Zeiten (0:00, 3:00, 6:00 Uhr). Ein Dialog um 3:00 Uhr auf einem PC ohne Nutzer bleibt so lange offen, bis jemand zurückkommt.

**Auswirkung:** Max. einige Minuten Verzögerung beim LOTRO-Check. Tode, die in dieser Zeit stattfinden, werden vom Plugin korrekt in `DeathTracker_Sync.plugindata` geschrieben und von `client.js` weitergesendet — da `client.js` eigenständig läuft. Kein Datenverlust.

**Wahrscheinlichkeit:** Gering — Dialog erscheint nur wenn LOTRO bereits läuft. In der Praxis meist: kurz vor oder nach dem Spielstart.

**Behebbarkeit:** Dialog erscheint auf dem Desktop, ist sofort erkennbar.

**Mitigation implementiert:** Dialog-Text enthält jetzt den Hinweis "Der Watcher pausiert kurz während dieses Dialogs – Tode werden weiterhin aufgezeichnet."

**Bewertung:** 🟢 Gering (mitigiert durch Dialog-Hinweis)

---

**P1-G — syncLocalDeaths: Falsch-Positive bei Sonderzeichen im Charakternamen** *(neu, T17)*

`syncLocalDeaths()` extrahiert den Charakternamen aus dem Dateipfad (`path.basename(path.dirname(stateFilePath))`). LOTRO benennt PluginData-Verzeichnisse nach dem Charakternamen — auf deutschem Windows (Windows-1252) können Umlaute (ä, ö, ü) anders kodiert vorliegen als in der Datenbank.

**Worst-Case-Ablauf:**
1. Beim ersten Watcher-Start nach v2.4: `charName = "Glöin"` (aus Dateipfad, Windows-1252-kodiert), kein Treffer in `GET /characters` → `charData = null`, `currentServer = 0`, Baseline wird gesetzt: `{baselineServer: 0}`.
2. Beim zweiten Watcher-Start: `currentPlugin = 5`, `currentServer = 0` (immer noch kein Treffer), `missing = 5 - (0 - 0) = 5`.
3. → `POST /death/silent` mit falschem `charName` → 5 stille Tode werden für einen Phantomcharakter in der DB erstellt.

**Auswirkung:** Fehlerhafte stille Tode für einen Charakter, der in der DB unter anderem Namen geführt wird. Korrekte Charakterstatistiken bleiben unberührt.

**Wahrscheinlichkeit:** Gering — betrifft ausschließlich Charaktere mit Umlauten/Sonderzeichen im Namen **und** nur wenn der PluginData-Ordnername nicht exakt mit dem in der DB gespeicherten Namen übereinstimmt. ASCII-Namen (die meisten LOTRO-Namen) sind nicht betroffen.

**Behebbarkeit:** Den Phantomcharakter manuell aus `deaths.local.json` entfernen — beim nächsten Watcher-Start wird die Baseline neu gesetzt.

**Mitigation implementiert:** Lookup in `syncLocalDeaths()` verwendet jetzt `.toLowerCase().trim()` auf beiden Seiten des Vergleichs — ASCII-Umlaut-Differenzen werden damit abgefangen, soweit beide Seiten dieselbe Byte-Repräsentation haben.

**Restrisiko:** Unicode-normalisierungsbedingte Unterschiede (NFD vs. NFC, z. B. `ö` als U+00F6 vs. `o` + combining diaeresis) sind damit nicht gelöst. In der Praxis sehr selten.

**Bewertung:** 🟢 Gering (mitigiert durch case-insensitive Lookup)

---

### 🟢 Geringes Risiko

**P1-A — Race/Class-Enum-Werte: Silent-Fallback auf "Unknown"** *(unverändert aus v2.1)*
Falsch gemappte Werte landen still als `"Unknown"`. In-game-Verifikation empfohlen.

**P1-B — Event-Verlust bei Server-Ausfall** *(unverändert aus v2.1)*
Bei Ausfall von `dodaswelt.de` im Moment eines Todes geht das Event verloren. `syncLocalDeaths` kann den Verlust beim nächsten Watcher-Start **jetzt** erkennen und nachtragen — wenn `client.js` nicht lief.

**Hinweis:** P1-B ist durch T17 deutlich entschärft: Tode, die nicht gesendet werden konnten, weil der Client nicht lief, werden beim nächsten Start erkannt und still nachgetragen. Verlorene Events wegen laufendem Client + Server-Fehler sind weiterhin nicht abgedeckt.

**P1-C — Watcher startet nicht nach Windows-Neustart (AV/GPO)** *(unverändert)*

**P1-D — LOTRO-Pfad ändert sich nach Installation** *(unverändert)*

**P1-I — autoRestart:false: Client-Neustart hängt am Watcher** *(neu, T13)*

`client.js` ruft bei `uncaughtException` nicht mehr `main()` intern auf, sondern beendet sich (`process.exit(1)`). Der Watcher erkennt dies via den neuen `'exit'`-Listener auf `clientProcess`, setzt `clientProcess = null` und startet beim nächsten 5-Sekunden-Tick neu.

- **Auswirkung:** Maximal 5 Sekunden Unterbrechung bei einem Client-Crash. Vorher (autoRestart: true) war es 5 Sekunden internen Delay + mögliche doppelte Chokidar-Instanz. Dieses Verhalten ist sicherer.
- **Risiko:** Wenn der Watcher selbst nicht mehr läuft (z.B. nach Absturz), wird der Client nach einem Crash nicht neu gestartet. `npm run install-service` behebt das.
- **Bewertung:** 🟢 Gering — Verbesserung gegenüber v2.3.

**P1-J — syncLocalDeaths schlägt bei Server nicht erreichbar still fehl** *(neu, T17)*

Wenn `dodaswelt.de` beim Watcher-Start nicht erreichbar ist, meldet `syncLocalDeaths` "API nicht erreichbar" ins Log und überspringt die Prüfung. Beim nächsten Watcher-Start wird erneut versucht. In der Zwischenzeit kumuliert der Plugin-Zähler weiter — beim nächsten erfolgreichen Sync werden alle fehlenden Tode auf einmal nachgetragen.

- **Bewertung:** 🟢 Gering — das ist das gewünschte Verhalten.

---

## Perspektive 2: Entwickler / Wartung

*Frage: Was kann bei zukünftigen Releases und Code-Änderungen schiefgehen?*

### 🟡 Mittleres Risiko

**P2-A — Auto-Update erstmals mit v2.4-Release ungetestet** *(aus v2.3 übernommen, jetzt für v2.3 → v2.4)*

Der erste echte Auto-Update-Durchlauf von einer v2.3-Installation auf v2.4 wurde noch nicht in Echtbetrieb durchgespielt. Dieser Durchlauf umfasst erstmals:
- Den neuen Plugin-Download (T12) via PowerShell
- Die neuen Watcher-Features (T17, T18) im generierten `lotro-watcher.js`
- `syncLocalDeaths()` als neuer Startup-Schritt

**Mitigationen:** Staging-Mechanismus (T14 verbessert), URL-Validierung, watcher.log mit vollständigem Protokoll, Plugin-Update non-fatal (T12), `deaths.local.json` wird bei fehlendem Eintrag automatisch initialisiert.

- **Empfehlung:** Ersten Update-Durchlauf auf Testinstallation oder eigenem PC beobachten. `watcher.log` und neue `deaths.local.json` prüfen.
- **Bewertung:** 🟡 Mittel

**P2-H — Stale `.bak`-Dateien nach abruptem Prozessende** *(neu, T14)*

Das neue Backup-Rename-Pattern (T14) erzeugt temporäre `*.bak`-Dateien (`client.js.bak`, `install-autostart.js.bak` usw.) während des Rename-Vorgangs. Bei normalem Ablauf werden sie sofort gelöscht. Bei abruptem Prozessende (Strom, OS-Kill, Antivirus) zwischen dem ersten `renameSync(dest, backupPath)` und dem letzten `unlinkSync(backupPath)` kann die `.bak`-Datei auf dem System verbleiben.

**Szenarien:**

| Moment des Abbruchs | Ergebnis | Auswirkung |
|---|---|---|
| Nach `renameSync(dest, bak)`, vor `renameSync(staging, dest)` | `.bak` vorhanden, `dest` fehlt | Client startet nicht mehr |
| Nach `renameSync(staging, dest)`, vor `unlinkSync(bak)` | Beide vorhanden | Harmlos — `.bak` ist Datenmüll |
| Nach `unlinkSync(bak)` | Nur `dest` vorhanden | Korrekt |

**Wichtig:** Der kritische Fall (erste Zeile) lässt `client.js` komplett fehlen. Der Watcher startet `spawn(execPath, [CLIENT_PATH])` → spawn schlägt fehl → `'exit'`-Listener feuert sofort → `clientProcess = null` → nach 5s neuer Versuch. Das wiederholt sich dauerhaft, bis das Problem behoben wird.

**Erkennung:** `watcher.log` zeigt "Client beendet (Code: 1)" alle ~5 Sekunden. `client.js.bak` ist im Installationsverzeichnis sichtbar.

**Behebbarkeit:** `client.js.bak` manuell zu `client.js` umbenennen.

**Mitigation implementiert:** Beim Watcher-Start (nach `acquireLock()`, vor `checkAndApplyUpdate()`) wird automatisch nach `*.bak`-Dateien für alle 4 Update-Dateien gesucht:
- Fehlt das Original → `.bak` wird zu Original umbenannt (Recovery, kritischer Fall)
- Beide vorhanden → `.bak` wird gelöscht (harmloser Datenmüll)
Beide Fälle werden ins `watcher.log` protokolliert.

**Wahrscheinlichkeit:** Sehr gering — erfordert Prozessende exakt im Rename-Fenster (Millisekunden).

**Bewertung:** 🟢 Gering (automatische Recovery implementiert)

---

### 🟢 Geringes Risiko

**P2-B — Neue DB-Spalte ohne SHOW COLUMNS Fallback** *(unverändert aus v2.1)*
Kein Schema-Change in v2.4. Bleibt relevant für zukünftige Releases.

**P2-C — Duplikate getLOTROPath()-Implementierungen** *(neu, T12 + T17)*

`getLOTROPath()` ist jetzt zweimal implementiert: in `updater.js` (für Plugin-Download, T12) und im generierten `lotro-watcher.js` (für `syncLocalDeaths`, T17). Beide sind funktional identisch, aber nicht aus einer gemeinsamen Quelle generiert.

- **Risiko:** Bei Änderungen (z.B. neuer LOTRO-Pfad-Fallback) müssen beide Stellen synchron gehalten werden.
- **Bewertung:** 🟢 Gering — kein gemeinsames Modul verfügbar (Watcher-Template ist generierter Code, Updater ist eigenständig). Gut in `CLAUDE.md` dokumentieren.

**P2-D — Versionssynchronität: nun 10 Stellen bei jedem Release** *(aktualisiert)*

Ab v2.4 gilt die erweiterte CLAUDE.md-Checkliste mit 10 Pflichtfeldern:
- PHP-Header, `$db_version` (nur bei Schema-Änderung), `package.json`, `version.json.template`, `client.js`, `.plugin`, `Main.lua`, Git-Tag
- **Neu:** PHP User-Agent in `check_for_update()`, `INSTALL.bat` Erfolgsmeldung, `UPDATE.bat` Erfolgsmeldung, `ANLEITUNG.md` Versionsnummer

- **Dokumentiert:** CLAUDE.md enthält vollständige Checkliste.

**P2-E — deaths.local.json: Keine automatische Bereinigung bei Charakter-Löschung**

Wenn ein Charakter gelöscht wird (DB-Eintrag entfernt) oder umbenannt wird, bleibt der Eintrag in `deaths.local.json` erhalten. Das hat keine negative Auswirkung — beim nächsten `GET /characters` wird der Charakter nicht gefunden (`charData = null`), `currentServer = 0`, die Formel berechnet `missing = currentPlugin - (0 - baselineServer)`. Da `baselineServer` für diesen bekannten Charakter einen alten positiven Wert hat, ergibt sich `missing < 0` → clamped auf 0. Kein Nachtragen.

- **Auswirkung:** Keine. `deaths.local.json` enthält veraltete Einträge, die harmlos ignoriert werden.
- **Bewertung:** 🟢 Gering

**P2-F — syncLocalDeaths: Kein Schutz gegen gleichzeitige Ausführung** *(neu, T17)*

Da `syncLocalDeaths()` asynchron läuft und beim Start des Watchers aufgerufen wird, könnte der Singleton-Lock im theoretischen Fall (Race Condition zwei Watcher) zweimal gleichzeitig laufen. In der Praxis verhindert der Singleton-Lock (T11) dies zuverlässig.

- **Bewertung:** 🟢 Kein Risiko — durch Singleton-Lock abgesichert.

---

## Perspektive 3: Infrastruktur / Externe Abhängigkeiten

*Frage: Was passiert wenn externe Dienste ausfallen oder ihr Verhalten ändern? Welche neuen Koordinierungsanforderungen entstehen?*

### 🟡 Mittleres Risiko

**P3-I — `/death/silent` erfordert koordiniertes Deployment von WP-Plugin und Client** *(neu, T17)*

Der neue Endpoint `POST /wp-json/lotro-deaths/v1/death/silent` ist Teil des v2.4-WP-Plugins. Der Watcher v2.4 ruft diesen Endpoint in `syncLocalDeaths()` auf.

**Problematisches Szenario:** Der Watcher wird via Auto-Update auf v2.4 aktualisiert (client.js, install-autostart.js usw.), aber das WordPress-Plugin wird nicht gleichzeitig aktualisiert (verbleibt auf v2.3 — das WP-Plugin-Update läuft über den WordPress-Update-Mechanismus, nicht über den Client-Auto-Update).

- **Auswirkung:** `syncLocalDeaths()` ruft `POST /death/silent` auf → `404 Not Found` → "Nachtragen fehlgeschlagen" im `watcher.log`. Fehlende Tode werden nicht nachgetragen bis das WP-Plugin aktualisiert ist. **Kein Datenverlust, keine Exception**, nur ineffektiver Sync.
- **Erkennung:** `watcher.log` enthält "Nachtragen fehlgeschlagen: ... (WordPress-Plugin v2.4 benötigt – bitte WP-Plugin aktualisieren)".
- **Mitigation implementiert:** Bei HTTP 404 ergänzt `syncLocalDeaths()` den Fehlertext jetzt explizit mit dem Hinweis auf das fehlende WP-Plugin v2.4 — der Streamer erkennt die Ursache direkt im Log.
- **Wahrscheinlichkeit:** Mittel — das WP-Plugin-Update hängt vom Nutzer (WordPress-Admin) ab und kann zeitlich verzögert sein.
- **Empfehlung:** WP-Plugin v2.4 vor dem GitHub-Release deployen. Kein technischer Blocker, aber Release-Reihenfolge wichtig.
- **Bewertung:** 🟡 Mittel (Diagnose verbessert, strukturelles Timing-Problem bleibt)

---

### 🟢 Geringes Risiko

**P3-A bis P3-E** *(unverändert aus v2.1-Analyse)*
GitHub-API-Ausfall, WordPress-Server-Ausfall, raw.githubusercontent.com-Ausfall, StreamElements-Ausfall, LOTRO-Lua-API-Änderung — alle weiterhin gültig und unverändert bewertet.

**P3-F — jsDelivr CDN-URL muss nach v2.4-Release aktualisiert werden** *(aktualisiert)*
Die `herrin-inge.de`-Einbindung nutzt `@v2.3`. Nach v2.4-Release muss das Script-Tag auf `@v2.4` aktualisiert werden. Dokumentiert in `CLAUDE.md`.

**P3-J — PowerShell `Invoke-WebRequest` in restriktiver Umgebung** *(neu, T12)*

`updater.js` nutzt `spawnSync('powershell.exe', ['-Command', 'Invoke-WebRequest ...'])` zum Herunterladen der Plugin-Dateien. In manchen Unternehmensumgebungen können PowerShell-Cmdlets wie `Invoke-WebRequest` durch Gruppenrichtlinien oder Netzwerk-Proxies blockiert sein.

- **Auswirkung:** Plugin-Update schlägt fehl, landet in `errors[]`, wird im Abschluss-Dialog angezeigt. Client-Update ist davon nicht betroffen (läuft über `https.request` in Node.js).
- **Wahrscheinlichkeit:** Sehr gering — privater Streamer-PC ohne Corporate-Policies.
- **Resilienz:** Non-fatal. Das System degradiert elegant: Client läuft, Plugin-Dateien sind nur nicht aktualisiert.
- **Bewertung:** 🟢 Gering

**P3-K — Erster `syncLocalDeaths`-Lauf nach Update: Kein `DeathTracker_State.plugindata` vorhanden** *(neu, T17)*

Unmittelbar nach dem Update auf v2.4 existiert `DeathTracker_State.plugindata` noch nicht — `Main.lua` v2.4 muss zuerst einmal im Spiel geladen werden. `findStateFiles()` gibt ein leeres Array zurück → "Keine Dateien gefunden" im Log → kein Nachtragen.

Beim nächsten Mal, wenn LOTRO gestartet wurde (neues Plugin aktiv), existiert die Datei, und `syncLocalDeaths` setzt korrekt die Baseline.

- **Auswirkung:** Tode, die zwischen v2.4-Update und dem ersten LOTRO-Start stattgefunden haben (d.h. keine), werden nicht nachgetragen. Das ist korrekt — der Zähler beginnt bei 0.
- **Bewertung:** 🟢 Kein Risiko — korrektes Verhalten.

**P3-G — Test-Tabellen: Vergessene Bereinigung** *(unverändert aus v2.3)*

**P3-H — Test-API-Credentials** *(unverändert aus v2.3)*

---

## Teil 2: Verteilung v2.3 → v2.4 (Auto-Update)

**Was passiert beim Auto-Update v2.3 → v2.4?**

```
v2.3-Watcher startet
  → checkAndApplyUpdate(): findet v2.4-Release auf GitHub
  → vergleicht Versionen → Update erforderlich
  → isLOTRORunningSync(): LOTRO nicht aktiv → stilles Update
  → applyUpdateNow(): HEAD-Validierung auf raw.githubusercontent.com
  → update-staging/ anlegen
  → Downloads: client.js, install-autostart.js, package.json, updater.js
  → Backup-Rename-Pattern (T14) → Produktionsdateien ersetzt
  → update-staging/ löschen
  → updater.js spawnen (detached, windowsHide: true)
  → Watcher beendet sich
    ↓
  updater.js (v2.4):
  → isLotroRunning(): LOTRO-Check → VBScript-Dialog falls aktiv
  → waitForFile(install-autostart.js, 10s)
  → npm install
  → node install-autostart.js install
      → generiert lotro-watcher.js (v2.4, mit syncLocalDeaths, handleUpdateDialog, 3h-Scheduler)
      → generiert start-lotro-watcher.vbs
      → startet neuen Watcher (v2.4)
  → version.json: { "version": "2.4" }
  → getLOTROPath() → Plugin-Dateien laden (Main.lua, DeathTracker.plugin)
  → Abschluss-Dialog
    ↓
  Erster Start des neuen v2.4-Watchers:
  → acquireLock()
  → checkAndApplyUpdate() → Kein Update
  → scheduleNext3hCheck() → nächsten 3h-Tick planen
  → syncLocalDeaths() → DeathTracker_State.plugindata noch nicht vorhanden → überspringen
  → checkLOTRO() Loop startet
```

---

### 🟡 Mittleres Risiko

**AU-1 — Erstmaliger v2.3 → v2.4 Auto-Update ungetestet**

Der Update-Ablauf wurde noch nicht in Echtbetrieb mit einer echten v2.3-Installation durchgespielt.

Neue Elemente gegenüber v2.3 → v2.3-Update:
- `isLOTRORunningSync()` im `checkAndApplyUpdate()`-Flow (synchroner LOTRO-Check)
- Backup-Rename-Pattern (T14) statt `unlinkSync + renameSync`
- `updater.js` führt jetzt Plugin-Download via PowerShell aus

**Mitigationen:** Alle Update-Schritte haben fehlerrobuste Fallbacks. watcher.log dokumentiert jeden Schritt vollständig.

**Empfehlung:** Update auf eigenem PC oder Testinstallation zuerst beobachten.

**Bewertung:** 🟡 Mittel

**AU-10 — LOTRO läuft beim Watcher-Update-Check: Dialog erscheint unerwartet**

Wenn LOTRO genau dann läuft, wenn der v2.4-Watcher seinen Startup-`checkAndApplyUpdate()` ausführt und ein Update findet, erscheint `handleUpdateDialog()` mit einem VBScript-Dialog. Der Nutzer hat dieses Verhalten möglicherweise nicht erwartet (in v2.3 wurde auch bei laufendem LOTRO still aktualisiert).

- **Auswirkung:** Nutzer muss aktiv auf "Später" oder "Jetzt" klicken. Das Update wird nicht mehr automatisch durchgeführt solange LOTRO läuft — das ist beabsichtigtes v2.4-Verhalten.
- **Bewertung:** 🟡 Mittel (UX-Veränderung, die kommuniziert werden sollte)

---

### 🟢 Geringes Risiko

**AU-2 — v2.4-Updater läuft auf v2.3-Infrastruktur** *(vgl. AU-2 aus v2.3)*

Der neue `updater.js` (v2.4) läuft auf einem System das bisher `install-autostart.js` v2.3 hatte. Rückwärtskompatibel: `waitForFile` prüft nur die Existenz der Datei, nicht ihren Inhalt. `install-autostart.js install` generiert ein vollständig neues `lotro-watcher.js`.

- **Auswirkung:** Keine. Der neue Updater ist vollständig selbständig.

**AU-3 — deaths.local.json fehlt nach Update** *(T17)*

`deaths.local.json` existiert nach dem Update nicht. Der v2.4-Watcher startet, `syncLocalDeaths()` findet `DeathTracker_State.plugindata` noch nicht → überspringt. Sobald LOTRO gestartet und das Plugin geladen wurde, existiert die Datei, und beim nächsten Watcher-Start wird die Baseline korrekt gesetzt.

- **Auswirkung:** Keine — korrekte Initialisierung.

**AU-4 — npm install Netzwerkfehler** *(unverändert aus v2.3)*

Vorhandene `node_modules` aus v2.3 sind mit v2.4 kompatibel (keine neuen Dependencies). Fehler wird im Abschluss-Dialog angezeigt.

**AU-5 — WP-Plugin muss separat aktualisiert werden** *(aktualisiert)*

Das WP-Plugin v2.4 führt `/death/silent` ein. Wird das WP-Plugin nicht aktualisiert, funktioniert `syncLocalDeaths()` nicht (P3-I), aber alle anderen Funktionen laufen normal. Das WP-Plugin-Auto-Update ist unabhängig vom Client-Auto-Update.

**AU-6 — Plugin-Download via PowerShell schlägt fehl** *(T12)*

Falls PowerShell-Download fehlschlägt (Netzwerkfehler, AV), erscheint die Fehlermeldung im Abschluss-Dialog. Plugin-Dateien verbleiben auf v2.3. Das System läuft mit alten Plugin-Dateien. Da `DeathTracker_State.plugindata` nur mit der v2.4-Main.lua geschrieben wird, ist `syncLocalDeaths` ohne Plugin-Update wirkungslos — aber harmlos.

---

## Gesamtbewertung v2.4

| # | Risiko | Perspektive | Bewertung | Mitigiert durch |
|---|---|---|---|---|
| P1-H | Update-Dialog blockiert Event-Loop (T18) | Streamer | 🟢 Gering | Dialog-Hinweis "Watcher pausiert kurz" ✅ |
| P1-G | syncLocalDeaths Falsch-Positive bei Sonderzeichen (T17) | Streamer | 🟢 Gering | Case-insensitive Lookup implementiert ✅ |
| P2-A | Auto-Update v2.3 → v2.4 ungetestet | Entwickler | 🟡 Mittel | Staging, URL-Validierung, Logging, non-fatale Fallbacks |
| P2-H | Stale .bak-Dateien nach Prozessabbruch (T14) | Entwickler | 🟢 Gering | Automatische .bak-Recovery beim Watcher-Start ✅ |
| P3-I | /death/silent erfordert koordiniertes WP-Plugin-Deployment | Infrastruktur | 🟡 Mittel | 404-Hinweis im Log "WP-Plugin v2.4 benötigt" ✅ |
| AU-1 | Auto-Update ungetestet in Echtbetrieb | Auto-Update | 🟡 Mittel | Testlauf empfohlen |
| AU-10 | Unerwarteter Dialog bei LOTRO + Watcher-Update | Auto-Update | 🟡 Mittel | Neues erwartetes Verhalten, kommunizieren |
| P1-A | Race/Class-Enums unverifiziert | Streamer | 🟢 Gering | — |
| P1-I | autoRestart:false — Client-Neustart via Watcher | Streamer | 🟢 Gering | Besser als v2.3-Verhalten |
| P2-C | Doppelte getLOTROPath()-Implementierung | Entwickler | 🟢 Gering | CLAUDE.md-Dokumentation |
| P2-D | Versionssynchronität 10+ Stellen | Entwickler | 🟢 Gering | CLAUDE.md-Checkliste |
| P3-J | PowerShell Invoke-WebRequest blockiert (T12) | Infrastruktur | 🟢 Gering | Non-fatal, nur Plugin-Update |
| P3-F | jsDelivr CDN-URL nach Release aktualisieren | Infrastruktur | 🟢 Gering | CLAUDE.md-Checkliste |

### Gelöste Risiken aus v2.3

| Risiko | Lösung |
|---|---|
| P2-C (Doppelter Watcher bei Crash, T13) | `'exit'`-Listener auf `clientProcess` + `autoRestart: false` ✅ |
| P1-B (Event-Verlust bei nicht-laufendem Client, T17) | `syncLocalDeaths()` erkennt und trägt fehlende Tode nach ✅ |
| Staging-Datei-Verlust bei Rename-Fehler (T14) | Backup-Rename-Pattern mit Restore ✅ |

### Im Review v2.4 zusätzlich mitigiert

| Risiko | Lösung |
|---|---|
| P1-H (Dialog blockiert Event-Loop) | Dialog-Text erklärt Watcher-Pause ✅ |
| P1-G (Falsch-Positive bei Sonderzeichen) | Case-insensitive Charaktername-Lookup ✅ |
| P2-H (Stale .bak nach Prozessabbruch) | Automatische .bak-Recovery beim Watcher-Start ✅ |
| P3-I (404 schwer zu diagnostizieren) | Expliziter 404-Hinweis im watcher.log ✅ |

---

**Fazit:** v2.4 führt mit dem lokalen Tod-Tracking (T17) und dem periodischen Update-Dialog (T18) zwei komplexere Features ein, die in ihrer Grundlogik korrekt implementiert sind, aber im Echtbetrieb noch nicht erprobt wurden. Das größte Einzelrisiko ist **P3-I** (koordiniertes Deployment von WP-Plugin und Client) — hier ist die Reihenfolge beim Release wichtig: WP-Plugin **vor** oder zeitgleich mit dem Client-Release deployen.

**Release v2.4 ist bereit**, wenn:
1. WP-Plugin v2.4 auf `dodaswelt.de` deployed ist, bevor das GitHub-Release veröffentlicht wird.
2. Ein erster Test-Durchlauf des Auto-Updates auf eigenem PC bestätigt, dass der neue Watcher korrekt generiert wird.
3. Race/Class-Enums einmalig in-game verifiziert wurden (P1-A, offen seit v2.1).
