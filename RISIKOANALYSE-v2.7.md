# Risikoanalyse v2.7 — SysTray → OBS-Dock Status-Seite

**Stand:** März 2026 | **Version:** 2.7

---

## Zusammenfassung der Änderung

v2.6 hatte `node-systray-v2` (Go-Binary als Subprocess). Wenn das Binary von Antivirus
gequarantänt wurde, crashte der Watcher bei fehlendem `error`-Event-Handler komplett.
v2.7 ersetzt SysTray durch einen lokalen HTTP-Status-Server (`lotro-status-server.js`,
Ports 7890–7894) als **eigenständigen Prozess**.

---

## Risiken

### P1-A: Port 7890 belegt (🟢 Gering)

**Problem:** Eine andere Anwendung belegt Port 7890.

**Mitigation (implementiert):** Der Status-Server probiert automatisch Ports 7890–7894
der Reihe nach durch (`EADDRINUSE`-Check in `server.on('error', ...)`). Erst wenn alle
5 Ports belegt sind, beendet er sich. Watcher und Client laufen in jedem Fall unabhängig
weiter — Death-Tracking bleibt immer funktionsfähig.

**Restrisiko:** Sehr unwahrscheinlich, dass alle 5 Ports gleichzeitig belegt sind. Falls
doch: Status-Seite nicht erreichbar, Death-Tracking läuft weiter.

---

### P2-A: StreamDeck-Node-Pfade (🟢 Gering)

**Problem:** StreamDeck-Plugin-Node-Prozesse können mit der DeathTracker-Installation
kollidieren. Ein globales `taskkill /F /IM node.exe /T` würde aber auch VS Code,
Discord-Overlay und alle anderen Node-Prozesse beenden.

**Mitigation (implementiert):** Das VBScript fragt via WMI alle laufenden `node.exe`-
Prozesse ab und terminiert **nur die**, deren `ExecutablePath` unter
`%APPDATA%\Elgato\StreamDeck\Plugins\` liegt. Anschließend (nach 500 ms Wartezeit)
werden die `node\` und `nodejs\` Unterordner in allen Plugin-Ordnern gelöscht. Pfad
dynamisch via `ExpandEnvironmentStrings`. Der gesamte Block läuft mit
`On Error Resume Next` — schlägt WMI oder Ordner-Bereinigung fehl, bricht der
Restart nicht ab. StreamDeck legt den Node-Ordner beim nächsten Start neu an.

**Restrisiko:** WMI könnte auf manchen Systemen durch Gruppenrichtlinien eingeschränkt
sein — dann werden SD-Node-Prozesse nicht terminiert. Die Ordner-Löschung würde in
diesem Fall mit `Access Denied` fehlschlagen (von `On Error Resume Next` geschluckt).

---

### P1-B: Restart-Flow beendet Fremdprozesse (🟢 Gering)

**Problem:** Ein globales `taskkill /F /IM node.exe /T` würde ALLE Node-Prozesse beenden
(StreamDeck, VS Code Extension Host, Discord-Overlay etc.).

**Mitigation (implementiert):** Das VBScript liest `watcher.pid` und `client.pid` aus
dem Installations-Verzeichnis (via `fso.GetParentFolderName(WScript.ScriptFullName)`)
und ruft **gezielt** `taskkill /F /PID <pid>` für diese zwei Prozesse auf. Fremde
Node-Prozesse (StreamDeck etc.) werden nicht berührt.

**Restrisiko:** Falls eine PID-Datei fehlt oder veraltet ist (Stale-PID), wird der
entsprechende Prozess nicht beendet. `install-autostart.js install` startet dann trotzdem
— der neue Watcher erkennt den alten via Singleton-Lock und beendet ihn.

---

---

### P2-B: Restart-Temp-Script wird nicht gelöscht (🟢 Gering → ✅ Behoben)

**Problem:** `_lotro_restart.vbs` / `_lotro_restart.sh` bleiben nach dem Restart liegen.

**Mitigation (implementiert):** Das VBScript löscht sich am Ende selbst:
```vbs
On Error Resume Next
fso.DeleteFile WScript.ScriptFullName
On Error GoTo 0
```
Das Shell-Script endet mit `rm -f "$0"`. Beim nächsten Restart wird die Datei ohnehin
überschrieben — die Selbst-Löschung ist "best effort" ohne Auswirkung auf den Restart.

---

### P3-A: `client.pid` nicht gelöscht bei OOM-Kill / `SIGKILL` (🟢 Gering)

**Problem:** Wenn `client.js` per `SIGKILL` oder OOM beendet wird, läuft `process.on('exit', ...)`
nicht → `client.pid` bleibt stehen → Status-Server zeigt Client als aktiv.

**Mitigation:** Status-Server prüft via `process.kill(pid, 0)` ob der Prozess noch lebt — Stale-PID
wird als inaktiv erkannt. Nächster Client-Start überschreibt die Datei.

---

## Nicht mehr relevante Risiken (durch v2.7 behoben)

- **Watcher-Crash durch fehlenden SysTray-Error-Handler** → SysTray vollständig entfernt
- **Antivirus löscht `tray_windows.exe` nach npm install** → Kein Go-Binary mehr
- **Tray-Retry-Loop alle 5s bei Fehler** → Entfällt
- **`destroyTray()` + `new SysTray()` bei schnellen Übergängen** → Entfällt
- **`isPluginActive()` spawnt `reg.exe` alle 5s** → Gecacht im Status-Server
- **Restart killt alle Node-Prozesse** → Gezielter PID-Kill statt `taskkill /IM node.exe`
- **StreamDeck Node-Ordner-Bereinigung mit globalem Node-Kill** → Jetzt gezielt via WMI (nur SD-Prozesse)
- **Temp-Script bleibt liegen** → Selbst-Löschung implementiert
