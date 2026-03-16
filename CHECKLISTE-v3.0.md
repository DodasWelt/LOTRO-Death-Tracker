# LOTRO Death Tracker v3.0 — Manuelle Test-Checkliste

> Diese Checkliste ergänzt die automatisierte Test-Suite (`node test-v30.js`).
> Alle Punkte hier erfordern eine echte Windows-Umgebung mit LOTRO-Installation.
> Abhaken wenn bestanden `[x]`, Fehler mit `[!]` und Beschreibung markieren.

---

## Vorbereitung

- [x] Echte Windows-Maschine (Windows 10/11) mit:
  - [x] LOTRO installiert und einmal gestartet (Dokumente-Ordner existiert)
  - [x] Node.js installiert (v18+ empfohlen)
  - [x] Internetverbindung
- [x] v3.0 ZIP von GitHub bereit (oder aus aktuellem Repo-Stand gebaut)
- [x] `C:\LOTRO-Death-Tracker` existiert NICHT (frische Umgebung) ODER ist mit v2.7 installiert (für Update-Test)

---

## 1. INSTALL.bat — Erstinstallation

### 1.1 LOTRO-Running-Check (T6-A) — NEU in v3.0
- [x] LOTRO starten, dann INSTALL.bat als Administrator ausführen
- [x] Dialog erscheint: "LOTRO läuft noch. Soll LOTRO jetzt beendet werden?"
  - [x] [Ja] → LOTRO wird beendet, Installation läuft durch
  - [x] [Nein] → Meldung "Installation abgebrochen" und Exit

### 1.2 Normale Installation (LOTRO nicht aktiv)
- [x] Als Administrator ausführen
- [x] Node.js wird erkannt (steht in install.log)
- [x] LOTRO-Pfad wird automatisch erkannt
- [x] Plugin-Dateien kopiert:
  - [x] `[LOTRO-Pfad]\Plugins\DodasWelt\DeathTracker.plugin`
  - [x] `[LOTRO-Pfad]\Plugins\DodasWelt\DeathTracker\Main.lua`
- [x] npm install erfolgreich (kein `[FEHLER]` in install.log)
- [x] Autostart-Einträge vorhanden:
  - [x] `%APPDATA%\...\Startup\LOTRO-Death-Tracker.vbs` ← Watcher
  - [x] `%APPDATA%\...\Startup\LOTRO-Death-Tracker-Status.vbs` ← Status-Server **NEU v3.0 (T3-B)**
- [x] PID-Dateien vorhanden:
  - [x] `C:\LOTRO-Death-Tracker\watcher.pid`
  - [x] `C:\LOTRO-Death-Tracker\status-server.pid`
- [x] UNINSTALL.bat in `C:\LOTRO-Death-Tracker\` vorhanden **NEU v3.0 (T6-C)**
- [x] REINSTALL.bat in `C:\LOTRO-Death-Tracker\` vorhanden **NEU v3.0 (T6-C)**
- [x] Erfolgs-Popup: "LOTRO Death Tracker v3.0 erfolgreich installiert!"

### 1.3 OBS-Dock Status-Server **NEU v3.0**
- [x] Browser öffnen: `http://localhost:7890`
- [x] Statusseite lädt und zeigt "LOTRO Death Tracker v3.0"
- [x] Drei Status-Dots sichtbar (Watcher / Client / Plugin)
- [x] Watcher-Dot: **Grün**
- [x] Client-Dot: **Grau** (LOTRO läuft nicht → Client inaktiv)
- [x] Plugin-Dot: **Grün** (Datei installiert)
- [x] Button "Watcher neu starten" sichtbar

---

## 2. PC-Neustart — Dual-Autostart (T3-B) — NEU in v3.0

- [x] PC neu starten
- [x] Nach Anmeldung ~30 Sekunden warten
- [x] `C:\LOTRO-Death-Tracker\watcher.pid` vorhanden → Watcher läuft
- [x] `C:\LOTRO-Death-Tracker\status-server.pid` vorhanden → Status-Server läuft
- [x] `http://localhost:7890` erreichbar
- [x] Task-Manager: zwei `node.exe` Prozesse sichtbar

---

## 3. Watchdog-Test (T3-C) — NEU in v3.0

- [x] Status-Server-PID aus `C:\LOTRO-Death-Tracker\status-server.pid` lesen
- [x] Prozess im Task-Manager beenden (PID matchen)
- [x] `http://localhost:7890` → nicht erreichbar
- [x] 65 Sekunden warten
- [x] `http://localhost:7890` → **wieder erreichbar** (Watchdog hat neu gestartet)
- [x] In `C:\LOTRO-Death-Tracker\watcher.log`:
  - [x] `Watchdog: Status-Server nicht erreichbar – starte neu...` vorhanden

---

## 4. UPDATE.bat — Upgrade von v2.7 → v3.0

> Setzt v2.7 als Ausgangszustand voraus.

- [x] UPDATE.bat als Administrator ausführen
- [x] Bestehende Installation erkannt: `C:\LOTRO-Death-Tracker`
- [X] Alle `node.exe` beendet ohne "Datei gesperrt"-Fehler
- [X] Dateien aktualisiert (Version in client.js, install-autostart.js, package.json: `3.0`)
- [x] npm install erfolgreich
- [X] Nach Update: **jetzt auch** Status-Server-VBS im Startup-Ordner **NEU v3.0**
- [x] UNINSTALL.bat + REINSTALL.bat aktualisiert **NEU v3.0**
- [x] Erfolgs-Popup: "LOTRO Death Tracker v3.0 aktualisiert!"

---

## 5. End-to-End: Death-Event (Kernfunktion)

### 5.1 Plugin laden
- [x] LOTRO starten
- [x] `/plugins load DodasWelt.DeathTracker` <- das ist falsch und geht vermutlich nur mit dem Englischen Client. Richtiger Weg ist: Pfeil hoch unten in der 
- [x] Chat-Bestätigung: `DeathTracker v3.0 initialized!`
- [x] Client-Dot im Status-Server: **Grün** (Client jetzt aktiv)

### 5.2 Tod provozieren
- [x] Absichtlich sterben
- [x] In `C:\LOTRO-Death-Tracker\watcher.log` innerhalb 10s: <- das watcher.log ist hier falsch. Es stand in der client.log. Dort ist es auch richtig.
  - [x] `New death event detected!`
  - [x] `Death successfully sent!`
- [x] API prüfen: `GET https://www.dodaswelt.de/wp-json/lotro-deaths/v1/death/current`
  - [x] Charaktername korrekt
  - [x] `eventType: "death"`
- [x] Overlay (StreamElements oder Test-HTML): "GEFALLEN" erscheint für ~10s

### 5.3 Duplikat-Schutz
- [x] Keine neue Dateiänderung → kein zweites Event gesendet
- [x] In watcher.log: `Event already processed (timestamp: ...)` <- auch das ist nicht in der watcher.log, sondern in der client.log. Dort ist es auch richtig.

---

## 6. End-to-End: Level-Up-Event (T2 — Level-Sync Bug)

- [x] `currentLevel` für Charakter in DB notieren:
  `GET https://www.dodaswelt.de/wp-json/lotro-deaths/v1/characters`
- [x] Level-Up provozieren
- [x] In watcher.log:
  - [x] `New levelup event detected!`
  - [x] `Level-Up: [Name] erreicht Level [N]`
  - [x] `Level-up successfully sent!`
- [x] DB erneut prüfen:
  - [x] `currentLevel` um 1 erhöht ✓
  - [x] `total_deaths` **nicht** erhöht ✓

---

## 7. UNINSTALL.bat — Volldeinstallation — NEU v3.0

> **Achtung:** Erst nach abgeschlossenem Test — löscht alles!

- [x] `C:\LOTRO-Death-Tracker\UNINSTALL.bat` als Administrator ausführen
- [x] Bestätigungsdialog: [J] eingeben
- [x] Prozesse beendet (node.exe)
- [x] `LOTRO-Death-Tracker.vbs` aus Startup entfernt
- [x] `LOTRO-Death-Tracker-Status.vbs` aus Startup entfernt **NEU v3.0**
- [x] `[LOTRO-Pfad]\Plugins\DodasWelt\` gelöscht
- [x] `C:\LOTRO-Death-Tracker\` vollständig gelöscht
- [x] Popup: "LOTRO Death Tracker wurde vollständig deinstalliert"
- [x] Verifikation: kein Verzeichnis, keine VBS-Dateien, kein Plugin mehr vorhanden

---

## 8. REINSTALL.bat — Saubere Neuinstallation — NEU v3.0

- [x] REINSTALL.bat als Administrator ausführen
- [x] GitHub API gibt neueste Version zurück
- [x] ZIP wird heruntergeladen
- [x] Runner-Skript startet detached
- [x] Nach ~30 Sekunden:
  - [x] `C:\LOTRO-Death-Tracker\` frisch installiert
  - [x] Watcher und Status-Server laufen
  - [x] Beide VBS im Startup-Ordner
  - [x] `http://localhost:7890` erreichbar

---

## 9. Overlay — Tab-Suspension-Resilience (T8) — NEU v3.0

- [x] Overlay-URL in OBS Browser-Quelle laden
- [x] Browser-Quelle in OBS **deaktivieren** (30s warten)
- [x] Browser-Quelle wieder **aktivieren**
- [x] Test-Death senden
- [x] Overlay zeigt Tod korrekt an (kein hängender State)
- [x] Browser-Konsole (OBS → Interact → F12):
  - [x] `[VISIBILITY] Tab wieder sichtbar – State wird zurückgesetzt` vorhanden

---

## 10. Regressionstest: v2.7-Funktionen unverändert

- [x] Death-Events werden korrekt erkannt (wie Test 5)
- [x] LOTRO beenden → Client stoppt automatisch
- [x] LOTRO starten → Client startet automatisch
- [x] Status-Server Restart-Button funktioniert (POST /restart)
- [x] `syncLocalDeaths()` beim Watcher-Start: kein Absturz

---

## Abschluss-Tabelle

| Test | Ergebnis | Anmerkung |
|------|----------|-----------|
| `node test-v30.js` (102 Tests) | ✅ | |
| 1. INSTALL.bat | ✅ | |
| 2. PC-Neustart Dual-Autostart | ✅ | |
| 3. Watchdog-Test | ✅ | |
| 4. UPDATE.bat | ✅ | |
| 5. Death-Event E2E | ✅ | |
| 6. Level-Up E2E | ✅ | |
| 7. UNINSTALL.bat | ✅ | |
| 8. REINSTALL.bat | ✅ | |
| 9. Overlay Resilience | ✅ | |
| 10. Regressionstest | ✅ | |

**Tester:** DodasWelt_________
**Datum:** 16.03.2026__________
**Windows-Version:** Windows 11__________
**LOTRO-Version:** 47.1___________

**Gesamtergebnis:**
- [x] FREIGEGEBEN für Release v3.0
- [ ] BLOCKIERT — offene Fehler: ___________________

---

*Erstellt für LOTRO Death Tracker v3.0 — DodasWelt / Herrin Inge*
