# LOTRO Death Tracker v3.0 — Manuelle Test-Checkliste

> Diese Checkliste ergänzt die automatisierte Test-Suite (`node test-v30.js`).
> Alle Punkte hier erfordern eine echte Windows-Umgebung mit LOTRO-Installation.
> Abhaken wenn bestanden `[x]`, Fehler mit `[!]` und Beschreibung markieren.

---

## Vorbereitung

- [ ] Echte Windows-Maschine (Windows 10/11) mit:
  - [ ] LOTRO installiert und einmal gestartet (Dokumente-Ordner existiert)
  - [ ] Node.js installiert (v18+ empfohlen)
  - [ ] Internetverbindung
- [ ] v3.0 ZIP von GitHub bereit (oder aus aktuellem Repo-Stand gebaut)
- [ ] `C:\LOTRO-Death-Tracker` existiert NICHT (frische Umgebung) ODER ist mit v2.7 installiert (für Update-Test)

---

## 1. INSTALL.bat — Erstinstallation

### 1.1 LOTRO-Running-Check (T6-A) — NEU in v3.0
- [ ] LOTRO starten, dann INSTALL.bat als Administrator ausführen
- [ ] Dialog erscheint: "LOTRO läuft noch. Soll LOTRO jetzt beendet werden?"
  - [ ] [Ja] → LOTRO wird beendet, Installation läuft durch
  - [ ] [Nein] → Meldung "Installation abgebrochen" und Exit

### 1.2 Normale Installation (LOTRO nicht aktiv)
- [ ] Als Administrator ausführen
- [ ] Node.js wird erkannt (steht in install.log)
- [ ] LOTRO-Pfad wird automatisch erkannt
- [ ] Plugin-Dateien kopiert:
  - [ ] `[LOTRO-Pfad]\Plugins\DodasWelt\DeathTracker.plugin`
  - [ ] `[LOTRO-Pfad]\Plugins\DodasWelt\DeathTracker\Main.lua`
- [ ] npm install erfolgreich (kein `[FEHLER]` in install.log)
- [ ] Autostart-Einträge vorhanden:
  - [ ] `%APPDATA%\...\Startup\LOTRO-Death-Tracker.vbs` ← Watcher
  - [ ] `%APPDATA%\...\Startup\LOTRO-Death-Tracker-Status.vbs` ← Status-Server **NEU v3.0 (T3-B)**
- [ ] PID-Dateien vorhanden:
  - [ ] `C:\LOTRO-Death-Tracker\watcher.pid`
  - [ ] `C:\LOTRO-Death-Tracker\status-server.pid`
- [ ] UNINSTALL.bat in `C:\LOTRO-Death-Tracker\` vorhanden **NEU v3.0 (T6-C)**
- [ ] REINSTALL.bat in `C:\LOTRO-Death-Tracker\` vorhanden **NEU v3.0 (T6-C)**
- [ ] Erfolgs-Popup: "LOTRO Death Tracker v3.0 erfolgreich installiert!"

### 1.3 OBS-Dock Status-Server **NEU v3.0**
- [ ] Browser öffnen: `http://localhost:7890`
- [ ] Statusseite lädt und zeigt "LOTRO Death Tracker v3.0"
- [ ] Drei Status-Dots sichtbar (Watcher / Client / Plugin)
- [ ] Watcher-Dot: **Grün**
- [ ] Client-Dot: **Grau** (LOTRO läuft nicht → Client inaktiv)
- [ ] Plugin-Dot: **Grün** (Datei installiert)
- [ ] Button "Watcher neu starten" sichtbar

---

## 2. PC-Neustart — Dual-Autostart (T3-B) — NEU in v3.0

- [ ] PC neu starten
- [ ] Nach Anmeldung ~30 Sekunden warten
- [ ] `C:\LOTRO-Death-Tracker\watcher.pid` vorhanden → Watcher läuft
- [ ] `C:\LOTRO-Death-Tracker\status-server.pid` vorhanden → Status-Server läuft
- [ ] `http://localhost:7890` erreichbar
- [ ] Task-Manager: zwei `node.exe` Prozesse sichtbar

---

## 3. Watchdog-Test (T3-C) — NEU in v3.0

- [ ] Status-Server-PID aus `C:\LOTRO-Death-Tracker\status-server.pid` lesen
- [ ] Prozess im Task-Manager beenden (PID matchen)
- [ ] `http://localhost:7890` → nicht erreichbar
- [ ] 65 Sekunden warten
- [ ] `http://localhost:7890` → **wieder erreichbar** (Watchdog hat neu gestartet)
- [ ] In `C:\LOTRO-Death-Tracker\watcher.log`:
  - [ ] `Watchdog: Status-Server nicht erreichbar – starte neu...` vorhanden

---

## 4. UPDATE.bat — Upgrade von v2.7 → v3.0

> Setzt v2.7 als Ausgangszustand voraus.

- [ ] UPDATE.bat als Administrator ausführen
- [ ] Bestehende Installation erkannt: `C:\LOTRO-Death-Tracker`
- [ ] Alle `node.exe` beendet ohne "Datei gesperrt"-Fehler
- [ ] Dateien aktualisiert (Version in client.js, install-autostart.js, package.json: `3.0`)
- [ ] npm install erfolgreich
- [ ] Nach Update: **jetzt auch** Status-Server-VBS im Startup-Ordner **NEU v3.0**
- [ ] UNINSTALL.bat + REINSTALL.bat aktualisiert **NEU v3.0**
- [ ] Erfolgs-Popup: "LOTRO Death Tracker v3.0 aktualisiert!"

---

## 5. End-to-End: Death-Event (Kernfunktion)

### 5.1 Plugin laden
- [ ] LOTRO starten
- [ ] `/plugins load DodasWelt.DeathTracker`
- [ ] Chat-Bestätigung: `DeathTracker v3.0 initialized!`
- [ ] Client-Dot im Status-Server: **Grün** (Client jetzt aktiv)

### 5.2 Tod provozieren
- [ ] Absichtlich sterben
- [ ] In `C:\LOTRO-Death-Tracker\watcher.log` innerhalb 10s:
  - [ ] `New death event detected!`
  - [ ] `Death successfully sent!`
- [ ] API prüfen: `GET https://www.dodaswelt.de/wp-json/lotro-deaths/v1/death/current`
  - [ ] Charaktername korrekt
  - [ ] `eventType: "death"`
- [ ] Overlay (StreamElements oder Test-HTML): "GEFALLEN" erscheint für ~10s

### 5.3 Duplikat-Schutz
- [ ] Keine neue Dateiänderung → kein zweites Event gesendet
- [ ] In watcher.log: `Event already processed (timestamp: ...)`

---

## 6. End-to-End: Level-Up-Event (T2 — Level-Sync Bug)

- [ ] `currentLevel` für Charakter in DB notieren:
  `GET https://www.dodaswelt.de/wp-json/lotro-deaths/v1/characters`
- [ ] Level-Up provozieren
- [ ] In watcher.log:
  - [ ] `New levelup event detected!`
  - [ ] `Level-Up: [Name] erreicht Level [N]`
  - [ ] `Level-up successfully sent!`
- [ ] DB erneut prüfen:
  - [ ] `currentLevel` um 1 erhöht ✓
  - [ ] `total_deaths` **nicht** erhöht ✓

---

## 7. UNINSTALL.bat — Volldeinstallation — NEU v3.0

> **Achtung:** Erst nach abgeschlossenem Test — löscht alles!

- [ ] `C:\LOTRO-Death-Tracker\UNINSTALL.bat` als Administrator ausführen
- [ ] Bestätigungsdialog: [J] eingeben
- [ ] Prozesse beendet (node.exe)
- [ ] `LOTRO-Death-Tracker.vbs` aus Startup entfernt
- [ ] `LOTRO-Death-Tracker-Status.vbs` aus Startup entfernt **NEU v3.0**
- [ ] `[LOTRO-Pfad]\Plugins\DodasWelt\` gelöscht
- [ ] `C:\LOTRO-Death-Tracker\` vollständig gelöscht
- [ ] Popup: "LOTRO Death Tracker wurde vollständig deinstalliert"
- [ ] Verifikation: kein Verzeichnis, keine VBS-Dateien, kein Plugin mehr vorhanden

---

## 8. REINSTALL.bat — Saubere Neuinstallation — NEU v3.0

- [ ] REINSTALL.bat als Administrator ausführen
- [ ] GitHub API gibt neueste Version zurück
- [ ] ZIP wird heruntergeladen
- [ ] Runner-Skript startet detached
- [ ] Nach ~30 Sekunden:
  - [ ] `C:\LOTRO-Death-Tracker\` frisch installiert
  - [ ] Watcher und Status-Server laufen
  - [ ] Beide VBS im Startup-Ordner
  - [ ] `http://localhost:7890` erreichbar

---

## 9. Overlay — Tab-Suspension-Resilience (T8) — NEU v3.0

- [ ] Overlay-URL in OBS Browser-Quelle laden
- [ ] Browser-Quelle in OBS **deaktivieren** (30s warten)
- [ ] Browser-Quelle wieder **aktivieren**
- [ ] Test-Death senden
- [ ] Overlay zeigt Tod korrekt an (kein hängender State)
- [ ] Browser-Konsole (OBS → Interact → F12):
  - [ ] `[VISIBILITY] Tab wieder sichtbar – State wird zurückgesetzt` vorhanden

---

## 10. Regressionstest: v2.7-Funktionen unverändert

- [ ] Death-Events werden korrekt erkannt (wie Test 5)
- [ ] LOTRO beenden → Client stoppt automatisch
- [ ] LOTRO starten → Client startet automatisch
- [ ] Status-Server Restart-Button funktioniert (POST /restart)
- [ ] `syncLocalDeaths()` beim Watcher-Start: kein Absturz

---

## Abschluss-Tabelle

| Test | Ergebnis | Anmerkung |
|------|----------|-----------|
| `node test-v30.js` (102 Tests) | ⬜ | |
| 1. INSTALL.bat | ⬜ | |
| 2. PC-Neustart Dual-Autostart | ⬜ | |
| 3. Watchdog-Test | ⬜ | |
| 4. UPDATE.bat | ⬜ | |
| 5. Death-Event E2E | ⬜ | |
| 6. Level-Up E2E | ⬜ | |
| 7. UNINSTALL.bat | ⬜ | |
| 8. REINSTALL.bat | ⬜ | |
| 9. Overlay Resilience | ⬜ | |
| 10. Regressionstest | ⬜ | |

**Tester:** ___________________
**Datum:** ___________________
**Windows-Version:** ___________________
**LOTRO-Version:** ___________________

**Gesamtergebnis:**
- [ ] FREIGEGEBEN für Release v3.0
- [ ] BLOCKIERT — offene Fehler: ___________________

---

*Erstellt für LOTRO Death Tracker v3.0 — DodasWelt / Herrin Inge*
