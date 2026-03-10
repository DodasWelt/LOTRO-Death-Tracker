# Risikoanalyse v2.6 — 3-Perspektiven-Review

**Stand:** 10. März 2026
**Basis:** Code-Review nach Implementierung von v2.6 (Sys-Tray, Bug-Fixes H3/H6/H7, syncLocalDeaths-Korrekturen).

Geprüfte Dateien: `Client/install-autostart.js` (generierter Watcher-Code), `Client/client.js`, `Client/updater.js`, `Client/package.json`, `LOTRO-Plugin/Main.lua`, `WordPress/lotro-death-tracker.php`, `Overlay/streamelements-overlay-minimalist.html`, `INSTALL.bat`, `UPDATE.bat`, `INSTALL.sh`, `UPDATE.sh`, `ANLEITUNG.md`

Vorgänger-Analyse: `RISIKOANALYSE-v2.4.md` (Linux-Kompatibilität wurde als v2.5 Pre-Release veröffentlicht, keine separate Analyse)

---

## Was hat sich in v2.6 geändert?

| Änderung | Dateien | Art |
|---|---|---|
| Sys-Tray Status-Icon (3 Zustände: rot/gelb/grün) | `install-autostart.js`, `package.json` | Neues Feature |
| H3: Signal-0-Check in `checkLOTRO()` für tote Client-Prozesse | `install-autostart.js` | Bug Fix |
| H6: npm-Paket-Existenzprüfung nach `npm install` in `updater.js` | `updater.js` | Bug Fix |
| H7: `.tmp`-Staging in `downloadFileSync()` in `updater.js` | `updater.js` | Bug Fix |
| `stopClient()` löscht `clientProcess` auch bei ESRCH | `install-autostart.js` | Bug Fix |
| `updateTray()` Retry-Logik + `lastTrayState`-Reset bei Fehler | `install-autostart.js` | Bug Fix |
| `syncLocalDeaths()` Netzwerkfehler-Handler ruft `processNext()` auf | `install-autostart.js` | Bug Fix |
| `syncLocalDeaths()` fehlende `baselinePlugin` — kritischer Formel-Bug | `install-autostart.js` | Bug Fix (kritisch) |
| Migration alter `deaths.local.json`-Einträge ohne `baselinePlugin` | `install-autostart.js` | Migrations-Logik |
| DB-Reset-Schutzprüfung (`currentServer < baselineServer`) | `install-autostart.js` | Verbesserung |
| Charakter-Umbenennung-Warnung bei fehlendem State-File | `install-autostart.js` | Verbesserung |
| `processSyncFile()` Null-Check für fehlendes `content`-Feld | `client.js` | Bug Fix |
| Main.lua Header-Kommentar Version 2.4 → 2.6 | `Main.lua` | Kosmetik |
| ANLEITUNG.md auf 5-Schritt-Format gekürzt, Linux-Abschnitt hinzugefügt | `ANLEITUNG.md` | Dokumentation |

---

## Perspektive 1: Streamer (Endnutzer)

*Frage: Was kann beim normalen Betrieb schiefgehen? Was bemerkt der Streamer, und kann er es selbst beheben?*

### 🔴 Hohes Risiko

*Keine.*

### 🟡 Mittleres Risiko

**P1-S1 — Sys-Tray Binary vom Antivirus blockiert** *(neu)*

`node-systray-v2` enthält ein vorkompiliertes Go-Binary (`tray.exe` / `tray` auf Linux). Einige Antivirus-Lösungen (insbesondere Kaspersky, Bitdefender, ESET) flaggen Go-Binaries aus unbekannten Quellen als verdächtig und quarantänisieren sie beim Entpacken oder beim ersten `npm install`.

**Auswirkung:** Das Binary kann nicht ausgeführt werden. `require('node-systray-v2')` wirft eine Exception → `TRAY_AVAILABLE = false` → Watcher läuft normal weiter, nur ohne Tray-Icon. **Kein Datenverlust, keine Funktionsbeeinträchtigung.**

**Erkennung:** `watcher.log` enthält `[TRAY] node-systray-v2 nicht verfügbar – fahre ohne Tray-Icon fort.`

**Wahrscheinlichkeit:** Mittel — erfahrungsgemäß blockieren ca. 10–20 % der AV-Lösungen unbekannte Go-Binaries bei der Erstausführung.

**Behebbarkeit:** Gut — der Watcher degradiert graceful. AV-Ausnahme kann manuell hinzugefügt werden, falls das Tray-Icon gewünscht ist.

**Mitigation:** `TRAY_AVAILABLE`-Flag schützt zuverlässig vor Abstürzen. Fehler wird vollständig geloggt. ANLEITUNG.md enthält Troubleshooting-Schritt mit AV-Ausnahme + `npm run install-service`.

**Bewertung:** 🟢 Gering (Kernfunktion unbeeinträchtigt; Troubleshooting dokumentiert)

---

**P1-S2 — Migration `deaths.local.json` ohne `baselinePlugin`: Einmalige Baseline-Lücke** *(neu)*

Bestehende v2.4/v2.5-Installationen haben eine `deaths.local.json` ohne `baselinePlugin`-Feld. Beim ersten v2.6-Watcher-Start löst die Migrations-Logik aus: die Baseline wird auf den aktuellen Stand zurückgesetzt. Deaths, die zwischen dem letzten Watcher-Stop und dem v2.6-Start stattfanden und noch nicht auf dem Server sind, werden **nicht** nachgetragen.

**Auswirkung:** Maximal einige fehlende stille Tode im Zeitfenster des Updates. In der Praxis: das Update findet über den Auto-Update-Mechanismus statt, während LOTRO nicht läuft → keine Deaths in diesem Fenster.

**Wahrscheinlichkeit:** Sehr gering — das Update läuft typischerweise vor dem LOTRO-Start.

**Mitigation (implementiert):** Besser als die bisherige v2.4/v2.5-Situation, bei der durch die falsche Formel aktiv Phantomtode erzeugt wurden. Eine rückwirkende Korrektur ist ohne `baselinePlugin` technisch nicht möglich.

**Bewertung:** 🟢 Gering (einmaliges, minimales Datenloch im Update-Fenster; besser als bisherige Phantomtode)

---

### 🟢 Geringes Risiko

**P1-A — Race/Class-Enum-Werte: Silent-Fallback auf „Unknown"** *(unverändert seit v2.1)*

Falsch gemappte Werte landen still als `"Unknown"`. In-game-Verifikation nach wie vor empfohlen.

**P1-B — Event-Verlust bei Server-Ausfall während laufendem Client** *(unverändert)*

`syncLocalDeaths` kann nur Tode nachtragen, die aufgetreten sind während `client.js` nicht lief. Events, die `client.js` zu senden versuchte, aber aufgrund eines Server-Fehlers nicht senden konnte, sind nicht abgedeckt.

**P1-H — Update-Dialog blockiert Watcher-Event-Loop** *(aus v2.4, unverändert)*
Bewertung: 🟢 Gering — Dialog-Hinweis ist implementiert.

**P1-S3 — Linux: `notify-send` nicht verfügbar** *(neu)*

Auf headless-Systemen oder minimalen Distros ohne `libnotify` steht `notify-send` nicht zur Verfügung. Der Sys-Tray-Fallback für Linux verwendet `notify-send` für Statusbenachrichtigungen.

**Auswirkung:** Keine Benachrichtigungen, kein Tray-Icon auf Linux. Watcher läuft normal.
**Behebbarkeit:** `sudo apt install libnotify-bin` (Ubuntu/Debian). Alternativ: kein Komfortfeature, kein Einfluss auf Tracking.
**Bewertung:** 🟢 Gering — nur Komfortfeature, graceful degradiert.

**P1-S4 — DB-Reset-Schutz löst bei manueller Deaths-Löschung aus** *(neu)*

Wenn ein Streamer manuell einzelne Einträge aus `wp_lotro_deaths` löscht (z.B. über phpMyAdmin), kann `currentServer < baselineServer` ausgelöst werden und fälschlicherweise als DB-Reset interpretiert werden.

**Auswirkung:** Log-Warnung + Baseline-Reset. Keine Phantomtode, keine Exception. Der neue `baselinePlugin`-Wert reflektiert den aktuellen Zustand.
**Bewertung:** 🟢 Gering — Log-Hinweis "bitte DB-Stand prüfen" ist ausreichend.

---

## Perspektive 2: Entwickler / Wartung

*Frage: Was kann bei zukünftigen Releases und Code-Änderungen schiefgehen?*

### 🟡 Mittleres Risiko

**P2-S1 — Auto-Update v2.5 → v2.6: Neue npm-Dependency `node-systray-v2`** *(neu, kritisch für Update)*

Der v2.5 → v2.6 Auto-Update-Ablauf beinhaltet erstmals ein `npm install` mit einer neuen GitHub-hosted Dependency (`github:DodasWelt/node-systray-v2#<commit>`). Risiken:

- **Netzwerkfehler beim npm install:** `npm` kann die GitHub-Dependency nicht herunterladen → `npm install` schlägt fehl → `updater.js` zeigt Fehler im Abschluss-Dialog. Bestehende `node_modules` bleiben unverändert (v2.5-Stand ohne `node-systray-v2`). Der Watcher startet, `require('node-systray-v2')` → Exception → `TRAY_AVAILABLE = false`. Betrieb normal.
- **GitHub-Ratelimt:** `npm install` von GitHub-Packages ohne Token unterliegt Rate-Limiting. Bei häufigen gleichzeitigen Updates könnte dies fehlschlagen.
- **AV quarantänisiert das Binary direkt nach Download:** Watcher startet ohne Tray-Icon (P1-S1).

**Mitigationen implementiert:**
- H6-Fix prüft Paket-Existenz nach `npm install` (essentielle Pakete)
- `TRAY_AVAILABLE`-Fallback schützt vor Runtime-Fehlern
- Verbesserter `npm install`-Fehlerhandler: wenn essentielle Pakete (`chokidar`, `axios`) vorhanden sind, kein Fehler-Dialog — nur Log-Warnung. Verhindert Fehlalarm-Dialog für optionales Komfort-Feature.

**Bewertung:** 🟢 Gering (Fehlerhandler unterscheidet zwischen kritischen und optionalen Paketen ✅)

---

**P2-A — Auto-Update v2.5 → v2.6 erstmals im Echtbetrieb** *(angepasst aus v2.4)*

Dieses Update enthält mit `node-systray-v2` eine neue binäre Dependency und den `baselinePlugin`-Migrations-Code — beides wurde noch nicht in einem echten Auto-Update-Durchlauf getestet.

**Mitigationen:** Staging-Mechanismus, URL-Validierung, watcher.log mit vollständigem Protokoll, `TRAY_AVAILABLE`-Fallback.

**Empfehlung:** Ersten Update-Durchlauf auf eigenem PC beobachten. `watcher.log` und `deaths.local.json` (Migration-Log-Eintrag) prüfen.

**Bewertung:** 🟡 Mittel

---

### 🟢 Geringes Risiko

**P2-S2 — `node-systray-v2`-Fork: Kein Upstream-Sync** *(neu)*

Die Dependency ist auf einen spezifischen Commit des eigenen Forks (`DodasWelt/node-systray-v2`) gepinnt. Der Fork erhält keine automatischen Updates aus dem Upstream (`edgar-p-yan/node-systray-v2`).

**Auswirkung:** Sicherheitsupdates oder Node.js-Kompatibilitätsfixes im Upstream kommen nicht automatisch an. Bei zukünftigen Node.js-Major-Versionen könnte das Binary inkompatibel werden.
**Behebbarkeit:** Fork manuell rebased und Commit-Hash in `package.json` aktualisieren.
**Bewertung:** 🟢 Gering — kein bekanntes Sicherheitsrisiko, binäre Abhängigkeit ohne serverseitigen Code.

**P2-S3 — Dreifache `getLOTROPath()`-Implementierung** *(aus v2.4 P2-C, verschärft)*

`getLOTROPath()` ist jetzt dreifach implementiert: `client.js`, Watcher-Template in `install-autostart.js`, IIFE in `updater.js`. Bei neuen Pfad-Fallbacks (z.B. neuer Launcher) müssen alle drei Stellen synchron gehalten werden. In `CLAUDE.md` dokumentiert.

**Bewertung:** 🟢 Gering — bekannt, dokumentiert.

**P2-D — Versionssynchronität: 15+ Stellen bei jedem Release** *(aktualisiert)*

Ab v2.6 kommen `INSTALL.sh` und `UPDATE.sh` als neue Versionsstellen hinzu. Die vollständige Checkliste ist in `CLAUDE.md` gepflegt.

**Bewertung:** 🟢 Gering — vollständige Checkliste in `CLAUDE.md` vorhanden.

**P2-S4 — `watchedFiles`-Set in `client.js` ungenutzt** *(bekannt)*

`const watchedFiles = new Set()` (Zeile 23) und `CONFIG.pollInterval` (Zeile 15) sind deklariert aber nie verwendet. Kein Laufzeit-Einfluss — nur toter Code. Bei zukünftigem Refactoring bereinigen.

**Bewertung:** 🟢 Kein Risiko.

---

## Perspektive 3: Infrastruktur / Externe Abhängigkeiten

*Frage: Was passiert wenn externe Dienste ausfallen oder ihr Verhalten ändern?*

### 🟡 Mittleres Risiko

**P3-S1 — npm install bei Auto-Update benötigt GitHub-Zugriff für `node-systray-v2`** *(neu)*

`npm install` muss `github:DodasWelt/node-systray-v2#<hash>` von `codeload.github.com` herunterladen. Bei GitHub-Ausfall oder Netzwerkblockade schlägt dieser spezifische Schritt fehl — alle anderen npm-Pakete (`chokidar`, `axios`) sind im bestehenden `node_modules` bereits vorhanden und werden übersprungen.

**Auswirkung:** `node-systray-v2` fehlt nach Update → Watcher startet ohne Tray-Icon. Kein Datenverlust, kein Betriebsausfall.

**Mitigation:** Verbesserter Fehlerhandler in `updater.js`: bei fehlgeschlagenem `npm install` wird geprüft ob essentielle Pakete vorhanden sind. Wenn ja → nur Log-Warnung, kein Fehler-Dialog. Kein Fehlalarm für den Streamer.

**Bewertung:** 🟢 Gering (kein Fehlalarm-Dialog mehr; betrifft nur optionales Komfortfeature ✅)

---

### 🟢 Geringes Risiko

**P3-I — `/death/silent` erfordert koordiniertes Deployment** *(aus v2.4, jetzt für v2.6)*

WP-Plugin muss v2.6 sein, damit der neue `syncLocalDeaths`-Code (mit korrekter `baselinePlugin`-Formel) funktioniert. Reihenfolge: WP-Plugin **vor** dem GitHub-Release deployen.

**Bewertung:** 🟢 Gering — keine neuen API-Endpoints in v2.6, `/death/silent` existiert seit v2.4.

**P3-A bis P3-E** *(unverändert aus v2.1)*
GitHub-API, WordPress-Server, raw.githubusercontent.com, StreamElements, LOTRO-Lua-API — weiterhin gültig.

**P3-F — jsDelivr CDN-URL muss nach v2.6-Release aktualisiert werden** *(aktualisiert)*
`herrin-inge.de` nutzt `@v2.5`. Nach Release auf `@v2.6` aktualisieren.

---

## Teil 2: Verteilung v2.5 → v2.6 (Auto-Update)

**Was passiert beim Auto-Update v2.5 → v2.6?**

```
v2.5-Watcher startet
  → checkAndApplyUpdate(): findet v2.6-Release auf GitHub
  → vergleicht Versionen → Update erforderlich
  → HEAD-Validierung auf raw.githubusercontent.com
  → update-staging/ anlegen
  → Downloads: client.js, install-autostart.js, package.json, updater.js
  → Backup-Rename-Pattern → Produktionsdateien ersetzt
  → update-staging/ löschen
  → updater.js spawnen (detached, windowsHide: true)
  → Watcher beendet sich
    ↓
  updater.js (v2.6):
  → isLotroRunning() → VBScript/Linux-Dialog falls aktiv
  → waitForFile(install-autostart.js, 10s)
  → npm install  ← NEU: lädt node-systray-v2 von GitHub herunter
  → Prüfung: chokidar + axios vorhanden? (H6-Fix)
  → node install-autostart.js install
      → generiert lotro-watcher.js (v2.6, mit Sys-Tray + baselinePlugin-Fixes)
      → generiert start-lotro-watcher.vbs (Windows) / .desktop (Linux)
      → startet neuen Watcher (v2.6)
  → version.json: { "version": "2.6" }
  → getLOTROPath() → Plugin-Dateien laden
  → Abschluss-Dialog
    ↓
  Erster Start des neuen v2.6-Watchers:
  → acquireLock()
  → .bak-Cleanup (falls vorhanden)
  → checkAndApplyUpdate() → Kein Update
  → scheduleNext3hCheck()
  → syncLocalDeaths():
      → Charakter ohne baselinePlugin gefunden → Migrations-Log + Baseline-Reset
  → checkLOTRO() Loop startet
  → Sys-Tray initialisiert (falls binary verfügbar)
```

### 🟡 Mittleres Risiko

**AU-1 — v2.5 → v2.6 Auto-Update erstmals im Echtbetrieb**

Neue Elemente gegenüber v2.4 → v2.5-Update:
- `npm install` mit neuer GitHub-Dependency `node-systray-v2`
- `baselinePlugin`-Migration in `syncLocalDeaths()` auf bestehender `deaths.local.json`

**Mitigationen:** Alle bekannten Fehlerpfade haben graceful Fallbacks. `TRAY_AVAILABLE`-Flag verhindert Runtime-Crashes. Migrations-Log klar erkennbar.

**Empfehlung:** Ersten Update-Durchlauf auf eigenem PC beobachten. `watcher.log` auf Migration-Eintrag prüfen.

**Bewertung:** 🟡 Mittel

---

### 🟢 Geringes Risiko

**AU-2 — v2.6-Watcher läuft auf v2.5-Infrastruktur**

Vollständig rückwärtskompatibel. `deaths.local.json` (ohne `baselinePlugin`) wird sauber migriert. WP-Plugin-API: keine neuen Endpoints.

**AU-3 — npm install schlägt bei `node-systray-v2` fehl**

Watcher startet ohne Tray-Icon (`TRAY_AVAILABLE = false`). Alle anderen Funktionen unberührt. Verbesserter Fehlerhandler: wenn essentielle Pakete vorhanden sind, erscheint kein Fehler-Dialog — nur eine Log-Warnung. ✅

**AU-4 — WP-Plugin separat aktualisieren**

Keine neuen API-Endpoints in v2.6. WP-Plugin v2.4 reicht für alle Client-v2.6-Funktionen.

---

## Gesamtbewertung v2.6

| # | Risiko | Perspektive | Bewertung | Mitigiert durch |
|---|---|---|---|---|
| P2-A | Auto-Update v2.5 → v2.6 ungetestet in Echtbetrieb | Entwickler | 🟡 Mittel | Testlauf auf eigenem PC empfohlen |
| P1-S1 | Sys-Tray Binary von AV blockiert | Streamer | 🟢 Gering | `TRAY_AVAILABLE`-Fallback + ANLEITUNG.md-Troubleshooting ✅ |
| P1-S2 | Migration ohne `baselinePlugin`: einmalige Baseline-Lücke | Streamer | 🟢 Gering | Besser als bisherige Phantomtode; Update typischerweise ohne LOTRO ✅ |
| P2-S1 | `npm install` mit GitHub-Dependency bei Auto-Update | Entwickler | 🟢 Gering | Verbesserter Fehlerhandler: kein Fehlalarm-Dialog bei optionalem Paket ✅ |
| P3-S1 | GitHub-Zugriff für `node-systray-v2` bei Auto-Update | Infrastruktur | 🟢 Gering | Kein Fehlalarm-Dialog mehr; nur Komfortfeature betroffen ✅ |
| P1-A | Race/Class-Enums unverifiziert | Streamer | 🟢 Gering | — |
| P1-S3 | Linux: `notify-send` nicht verfügbar | Streamer | 🟢 Gering | graceful degradiert |
| P1-S4 | DB-Reset-Schutz bei manueller Deaths-Löschung | Streamer | 🟢 Gering | Log-Hinweis ✅ |
| P2-S2 | `node-systray-v2`-Fork kein Upstream-Sync | Entwickler | 🟢 Gering | Kein akutes Sicherheitsrisiko |
| P2-S3 | Dreifache `getLOTROPath()`-Implementierung | Entwickler | 🟢 Gering | `CLAUDE.md`-Dokumentation ✅ |
| P2-D | Versionssynchronität 15+ Stellen | Entwickler | 🟢 Gering | `CLAUDE.md`-Checkliste ✅ |
| P3-F | jsDelivr CDN-URL nach Release aktualisieren | Infrastruktur | 🟢 Gering | `CLAUDE.md`-Checkliste ✅ |

### Behobene Risiken aus v2.4/v2.5

| Risiko | Lösung in v2.6 |
|---|---|
| `syncLocalDeaths` Phantomtode durch fehlende `baselinePlugin` | Korrekte Formel + `baselinePlugin` gespeichert + Migration ✅ |
| H3: Toter Client-Prozess nicht erkannt (`clientRunning`-Flag) | Signal-0-Check in `checkLOTRO()` ✅ |
| H6: Fehlende npm-Pakete nach Update nicht erkannt | Paket-Existenzprüfung in `updater.js` ✅ |
| H7: Temp-Datei-Konflikte bei Download | `.tmp`-Staging in `downloadFileSync()` ✅ |
| `stopClient()` lässt `clientProcess` bei ESRCH stehen | `clientProcess = null` außerhalb try/catch ✅ |
| `updateTray()` kein Retry nach SysTray-Konstruktorfehler | `lastTrayState`-Reset in catch-Block ✅ |
| `syncLocalDeaths` Kettenabbruch bei Netzwerkfehler | `processNext()` im error-Handler ✅ |
| `processSyncFile()` TypeError bei fehlendem `content`-Feld | Null-Check vor `.replace()` ✅ |

---

## Release-Empfehlung v2.6

**Release v2.6 ist bereit**, wenn:

1. **WP-Plugin** auf `dodaswelt.de` ist bereits auf v2.4+ (keine neue API in v2.6 erforderlich). ✅
2. **Erster Auto-Update-Test** auf eigenem PC durchgeführt: `watcher.log` auf Sys-Tray-Init und `syncLocalDeaths`-Migration prüfen.
3. **jsDelivr CDN-URL** auf `herrin-inge.de` von `@v2.5` auf `@v2.6` aktualisiert.
4. **Race/Class-Enums** einmalig in-game verifiziert *(offen seit v2.1, P1-A — weiterhin empfohlen)*.

**Kritische Release-Reihenfolge:** Da v2.6 keine neuen WP-API-Endpoints einführt, gibt es keine Koordinierungsanforderung zwischen WP-Plugin und Client-Release.
