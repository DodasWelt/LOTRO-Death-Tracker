# Risikoanalyse Linux-Kompatibilität

**Stand:** 7. März 2026, Senior-Code-Review nachgeführt
**Basis:** Code-Review nach Implementierung der Linux-Unterstützung (alle Plattform-Branches).

Geprüfte Dateien: `Client/client.js` (`getLOTROPath()`), `Client/install-autostart.js` (Watcher-Template + `install/uninstall/status/test`), `Client/updater.js` (alle Plattform-Branches), `INSTALL.sh`, `UPDATE.sh`

Vorgänger-Analyse: `RISIKOANALYSE-v2.4.md`

---

## Was wurde geändert?

| Datei | Art |
|---|---|
| `Client/client.js` | `getLOTROPath()`: Linux-Pfade Steam/Flatpak/Lutris |
| `Client/install-autostart.js` | `isLOTRORunning()`, `isLOTRORunningSync()`, `linuxDialog()`, `showVbsDialog()`, `handleUpdateDialog()`, `acquireLock()`, `getLotroPath()` (Watcher-Template); `installLinux()`, `uninstallLinux()`, `status()`, `test()` (äußere Logik) |
| `Client/updater.js` | `npmCmd`, `isLotroRunning()`, `killLotro()`, `linuxDialog()`, `vbsDialog()`, `getLOTROPath()` (IIFE), `downloadFileSync()` |
| `INSTALL.sh` | Neu |
| `UPDATE.sh` | Neu |

---

## Perspektive 1: Streamer (Linux-Endnutzer)

*Frage: Was kann beim normalen Betrieb unter Linux schiefgehen? Was bemerkt der Streamer, und kann er es selbst beheben?*

---

### 🔴 Hohes Risiko

*Keine.*

---

### 🟡 Mittleres Risiko

**LX-P1-A — Dialog-Fallback: Update-Frage wird automatisch mit "Ja" beantwortet**

~~Wenn weder `zenity` noch `kdialog` installiert ist und LOTRO beim Update-Check läuft, ruft `handleUpdateDialog()` intern `showVbsDialog()` → `linuxDialog('question', ...)` auf. Da kein GUI-Dialog möglich ist, gibt `linuxDialog()` für Fragen `true` zurück (default = Ja, non-interactive).~~

**Code-Review ergab: Bereits korrekt implementiert.** `linuxDialog()` gibt im Fallback `return type !== 'question'` zurück — für Fragen also `false` (= Nein). `showVbsDialog()` wandelt das in `7` (VBS-Nein) um. `handleUpdateDialog()` interpretiert `r1 !== 6` als "Nein" → Erinnerung beim nächsten LOTRO-Start. LOTRO wird nicht beendet, das Update nicht erzwungen.

**Bewertung:** 🟢 Kein Risiko — korrekt implementiert ✅

---

**LX-P1-B — LOTRO-Pfad nicht erkannt: Client startet, überwacht falsches Verzeichnis ✅ behoben**

Wird LOTRO aus einem nicht-standard Steam-Library-Ordner gestartet (z.B. zweite Festplatte mit eigener Steam Library), lautet der Proton-Prefix-Pfad:

```
/mnt/games/Steam/steamapps/compatdata/212500/pfx/drive_c/...
```

statt des erwarteten `~/.steam/steam/steamapps/...`. Die drei hartcodierten Pfade in `getLOTROPath()` greifen nicht, die Lutris-Erkennung ebenfalls nicht (kein LOTRO-YAML in Lutris).

**Konsequenz:** `getLOTROPath()` gibt `~/Documents/The Lord of the Rings Online` zurück. Dieses Verzeichnis existiert unter Linux nicht. `client.js` bricht mit "LOTRO directory not found" ab. Kein Tod-Tracking.

**Erkennung:** `client.log` zeigt die Fehlermeldung mit dem falschen Pfad. Behebbar durch `LOTRO_PATH=...` Env-Var setzen.

**Wahrscheinlichkeit:** Mittel — Nutzer mit mehreren Festplatten oder nicht-Standard-Steam-Library-Pfaden sind betroffen.

**Fix implementiert:** `libraryfolders.vdf` wird jetzt in allen drei `getLOTROPath()`-Implementierungen ausgelesen (`client.js`, Watcher-Template in `install-autostart.js`, IIFE in `updater.js`). Beide Locations werden geprüft: native Steam (`~/.steam/steam/config/libraryfolders.vdf`) und Flatpak-Steam. Für jeden gefundenen Library-Pfad wird `compatdata/212500/...` geprüft. Schlägt auch das fehl, greift weiterhin der `LOTRO_PATH`-Env-Var-Fallback.

**Bewertung:** 🟢 Gering — behoben, `LOTRO_PATH` bleibt als letzter Fallback

---

**LX-P1-C — XDG Autostart funktioniert nicht auf allen Desktop-Umgebungen**

XDG Autostart (`~/.config/autostart/*.desktop`) wird von GNOME, KDE, XFCE, MATE, LXQt, Cinnamon unterstützt. Nicht unterstützt von:
- Tiling Window Managern ohne eigenen Session Manager (i3, sway, dwm, bspwm)
- Wayland-Compositors ohne XDG-Portal-Unterstützung (bestimmte Sway-Konfigurationen)
- Systemen ohne graphische Sitzung (nur SSH)

**Konsequenz:** Der Watcher startet nach dem Anmelden nicht automatisch. LOTRO-Tracking findet nicht statt, bis der Nutzer den Watcher manuell startet.

**Erkennung:** `npm run status` zeigt "INSTALLIERT" (Desktop-Datei existiert), aber `watcher.pid` fehlt.

**Wahrscheinlichkeit:** Gering bis Mittel — abhängig vom Nutzer-Setup. Streamer nutzen typischerweise vollwertige Desktop-Umgebungen.

**Behebbarkeit:** Nutzer kann Watcher manuell starten oder eigene Autostart-Methode einrichten (systemd user service, Shell-Profil).

**Bewertung:** 🟡 Mittel — bekannte Einschränkung, nicht vermeidbar ohne systemd-Support

---

### 🟢 Geringes Risiko

**LX-P1-D — pgrep-Fallback liefert falsch-positive Treffer**

`pgrep -f lotroclient` sucht die Zeichenkette "lotroclient" im vollen Kommandozeilenstring aller Prozesse. Theoretisch könnte ein anderer Prozess diesen String im Pfad oder in den Argumenten enthalten.

`pgrep -f "proton.*212500"` greift, wenn kein `lotroclient`-Prozess gefunden wurde. Es sucht "proton" UND "212500" im Kommandozeilenstring. AppID 212500 ist exklusiv für LOTRO registriert — andere Proton-Spiele haben andere AppIDs.

**Auswirkung bei falsch-positivem Treffer:** Watcher denkt LOTRO läuft, startet `client.js`, überwacht Dateien. Da keine neuen PluginData-Events entstehen, werden keine Events gesendet. Reiner Leerlauf.

**Bewertung:** 🟢 Gering — kein Datenverlust, nur unnötiger Prozess

---

**LX-P1-E — pkill beendet mehr als erwartet**

`pkill -f lotroclient` in `handleUpdateDialog()` und `killLotro()` sendet SIGTERM an **alle** Prozesse, deren Kommandozeile "lotroclient" enthält. Auf einem Rechner mit mehreren LOTRO-Instanzen (unwahrscheinlich) oder einem Prozess, der zufällig "lotroclient" im Pfad hat, werden alle beendet.

**Auswirkung:** Höchstens, dass LOTRO sauber beendet wird — was in diesem Kontext genau das Ziel ist.

**Bewertung:** 🟢 Gering

---

**LX-P1-F — `curl` nicht installiert: Plugin-Update schlägt fehl**

`curl` ist auf den meisten Linux-Distributionen vorinstalliert, aber nicht auf allen (z.B. minimale Alpine-Linux-Setups). Fehlt `curl`, schlägt `downloadFileSync()` in `updater.js` fehl.

**Auswirkung:** Plugin-Update nicht durchgeführt, Fehlermeldung im Dialog. Client-Update ist davon nicht betroffen. Non-fatal.

**Bewertung:** 🟢 Gering — `INSTALL.sh` prüft `curl` vor der Installation

---

**LX-P1-G — notify-send ohne Notification-Daemon: Dialoge lautlos**

Wenn `zenity` und `kdialog` fehlen, wird `notify-send` als Fallback aufgerufen. Ohne laufenden Notification-Daemon (libnotify/D-Bus) schlägt `notify-send` still fehl. Der Log-Eintrag bleibt als einzige Spur.

Betrifft nur Info-Dialoge (Abschluss-Meldungen). Das kritischere Szenario ist LX-P1-A (Fragen-Dialoge).

**Bewertung:** 🟢 Gering — Log-Eintrag bleibt als Fallback

---

## Perspektive 2: Entwickler / Wartung

*Frage: Was kann bei zukünftigen Releases und Code-Änderungen schiefgehen?*

---

### 🔴 Hohes Risiko

*Keine.*

---

### 🟡 Mittleres Risiko

**LX-P2-A — Dreifache Duplizierung von `getLOTROPath()`**

`getLOTROPath()` ist jetzt an **drei** unabhängigen Stellen implementiert:

| Datei | Stelle | Zweck |
|---|---|---|
| `Client/client.js` | Funktion `getLOTROPath()` | chokidar-Watchpfad |
| `Client/install-autostart.js` | Watcher-Template, Funktion `getLotroPath()` | `syncLocalDeaths()` |
| `Client/updater.js` | IIFE im Schritt 4 | Plugin-Download |

Alle drei enthalten denselben Linux-Pfad-Erkennungslogik (Steam native, Flatpak, Lutris). Wenn sich der LOTRO-Installationspfad ändert (neue Proton-Version ändert Prefix-Struktur, Steam ändert Verzeichnislayout, Lutris-YAML-Format ändert sich), müssen **alle drei Stellen** synchron gehalten werden.

In v2.4 waren es bereits zwei Kopien (P2-C aus `RISIKOANALYSE-v2.4.md`). Die Linux-Implementierung hat eine dritte hinzugefügt.

**Risiko:** Eine Stelle wird bei einer Änderung vergessen — Nutzer eines bestimmten LOTRO-Starts können plötzlich nicht mehr getrackt werden, ohne klare Fehlermeldung.

**Empfehlung:** Langfristig: `getLOTROPath()` als gemeinsames Hilfsskript auslagern (`lib/lotro-path.js`), das von allen drei Stellen require()'d wird. Kurzfristig: Alle drei Stellen in `CLAUDE.md` explizit als "muss synchron gehalten werden" dokumentieren.

**Bewertung:** 🟡 Mittel — struktureller Wartungsmangel mit wachsendem Risiko

---

**LX-P2-B — Linux-Pfade vollständig ungetestet**

Sämtliche Linux-Code-Pfade wurden auf einem Windows-System (WSL) entwickelt. Ein Echtbetrieb auf einem Linux-System mit tatsächlich installiertem LOTRO via Steam+Proton oder Lutris hat nicht stattgefunden.

**Ungeprüfte Szenarien:**
- Steam-Flatpak-Pfad korrekt? (Tiefes Verzeichnis, kann sich zwischen Flatpak-Versionen unterscheiden)
- Lutris-YAML: `wine_prefix:` immer auf Top-Level oder innerhalb von Abschnitten wie `game:`?
- `pgrep -f "proton.*212500"` trifft tatsächlich auf einen laufenden LOTRO-Proton-Prozess zu?
- XDG-Autostart: .desktop-Datei wird korrekt ausgeführt?
- `process.execPath` zeigt auf korrekte node-Binary auf Linux?

**Risiko:** Syntaktisch korrekter Code, der semantisch auf echtem Linux-Setup nicht funktioniert.

**Empfehlung:** Testlauf auf echtem Linux-PC (oder VM mit Steam+Proton) vor Veröffentlichung als Linux-fähige Version. Mindesttest: `LOTRO_PATH=/tmp/test node client.js`, `node install-autostart.js install`, Autostart-Eintrag prüfen.

**Bewertung:** 🟡 Mittel — kein Schaden möglich, aber unbekannter Funktionsgrad

---

**LX-P2-C — linuxDialog() doppelt implementiert**

`linuxDialog()` ist in zwei Dateien implementiert:
- `Client/updater.js` — als eigenständige Funktion
- `Client/install-autostart.js` — eingebettet im Watcher-Template (generierter Code)

Beide müssen identisch bleiben. Bei Änderungen (z.B. zusätzlicher Dialog-Typ, neue Tool-Unterstützung) müssen beide Stellen synchron gehalten werden.

**Bewertung:** 🟡 Mittel — weniger kritisch als LX-P2-A, da Dialog-Logik weniger änderungsanfällig

---

### 🟢 Geringes Risiko

**LX-P2-D — Lutris-YAML-Parsing via Regex: strukturell fragil ✅ behoben**

`yml.match(/wine_prefix:\s*(.+)/)` liest den ersten `wine_prefix:`-Eintrag aus dem YAML. YAML ist ein hierarchisches Format — `wine_prefix` kann je nach Lutris-Version in unterschiedlichen Abschnitten (`game:`, `system:`) liegen oder als `prefix:` statt `wine_prefix:` geschrieben sein.

Aktuelle Lutris-Version (0.5.x) schreibt `wine_prefix:` auf Top-Level. Bei zukünftigen Lutris-Versionen könnte sich das ändern.

**Fix implementiert:** Regex in allen drei Implementierungen auf `(?:wine_prefix|prefix):\s*(.+)` erweitert — erkennt jetzt sowohl `wine_prefix:` als auch `prefix:` als gültige Schlüssel.

**Auswirkung bei Fehler:** Lutris-Pfad wird nicht erkannt → Fallback auf `~/Documents/LOTRO`. Fehlermeldung im `client.log`. Behebbar per `LOTRO_PATH` Env-Var.

**Bewertung:** 🟢 Gering — behoben, Fallback weiterhin vorhanden

---

**LX-P2-E — npm-Pfad auf Linux: PATH-Abhängigkeit beim Watcher-Spawn**

Der Linux-Watcher wird von XDG Autostart gestartet. Dessen `PATH` entspricht der Anmelde-Session, nicht der interaktiven Shell. Falls `npm` nur in `~/.nvm/versions/node/.../bin/` liegt (NVM-Installation), ist es im XDG-Start-PATH möglicherweise nicht enthalten.

**Auswirkung:** `execSync('npm install ...')` in `updater.js` schlägt fehl. Fehler erscheint im Abschluss-Dialog. Client-Update ist davon nicht betroffen (Watcher läuft weiter).

**Mitigierender Faktor:** `INSTALL.sh` prüft `npm` per `command -v` vor der Installation. Nach erfolgreicher Installation ist `node_modules` aktuell — `npm install` beim Auto-Update ist optional (neue Dependencies).

**Bewertung:** 🟢 Gering — klar dokumentierter Fehler, non-fatal

---

**LX-P2-F — Installationspfad-Inkonsistenz: `__dirname` vs. `~/.local/share/...`**

`INSTALL.sh` kopiert Client-Dateien nach `~/.local/share/lotro-death-tracker/`. `install-autostart.js install` generiert `lotro-watcher.js` mit dem zu diesem Zeitpunkt gültigen `__dirname` (also dem Installationsverzeichnis).

Wenn `install-autostart.js` direkt aus dem Quellcode-Verzeichnis (z.B. aus dem entpackten ZIP) aufgerufen wird statt aus dem Installationsverzeichnis, enthält die generierte Watcher-Datei den falschen Pfad für `CLIENT_PATH`.

**Auswirkung:** Watcher findet `client.js` nicht mehr nach einer Verschiebung des Installationsverzeichnisses. Neuinstallation via `npm run install-service` aus dem korrekten Verzeichnis behebt das.

**Bewertung:** 🟢 Gering — nur bei nicht-standardgemäßer Verwendung

---

**LX-P2-G — Versionsstellen: INSTALL.sh und UPDATE.sh mit hardcodierten Versionsnummern ✅ behoben**

`INSTALL.sh` und `UPDATE.sh` enthalten hardcodierte Versions-Strings ("v2.4") in Kommentaren und Erfolgsmeldungen. Diese müssen bei jedem Release auf die neue Version gesetzt werden.

**Fix implementiert:** CLAUDE.md-Versionscheckliste um `INSTALL.sh` und `UPDATE.sh` erweitert (sowohl in der Versionstabelle als auch im `grep`-Prüfbefehl vor dem Release).

**Bewertung:** 🟢 Gering — behoben

---

## Perspektive 3: Infrastruktur / Externe Abhängigkeiten

*Frage: Welche externen Abhängigkeiten kommen durch Linux hinzu? Was passiert wenn sich externe Systeme ändern?*

---

### 🟡 Mittleres Risiko

**LX-P3-A — Proton-Kompatdata-Pfad ändert sich mit Steam-Updates**

Valve hat den `compatdata`-Pfad in der Vergangenheit zwischen Steam-Versionen geändert. Derzeit:
```
~/.steam/steam/steamapps/compatdata/212500/pfx/...
```

Bei einer Steam-internen Umstrukturierung (z.B. Umzug auf XDG Base Directories) würde dieser Pfad ungültig. Die Flatpak-Variante (`~/.var/app/com.valvesoftware.Steam/...`) ist ebenfalls Valve-spezifisch und kann sich ändern.

**Auswirkung:** Kein LOTRO-Pfad erkannt → `client.log` Fehlermeldung. Manuell per `LOTRO_PATH` behebbar.

**Wahrscheinlichkeit:** Gering — Steam ist seit Jahren stabil in dieser Struktur. Proton selbst wechselt die Prefix-Struktur nicht ohne Major-Version.

**Bewertung:** 🟡 Mittel — externe Abhängigkeit die wir nicht kontrollieren können

---

### 🟢 Geringes Risiko

**LX-P3-B — Steam Deck: Eigener Pfad nicht berücksichtigt**

Das Steam Deck nutzt SteamOS (Arch-basiert) und hat standardmäßig Flatpak-Steam installiert. Der Flatpak-Pfad ist abgedeckt. Jedoch unterscheidet sich das Steam Deck in weiteren Punkten:

- Standard-Nutzername ist `deck`, nicht `steamuser` — aber `pfx/drive_c/users/steamuser` bleibt konstant (Proton-spezifisch, nicht vom Linux-Username abhängig). ✅
- SteamOS hat kein zenity vorinstalliert; kdialog ist über Discover installierbar. `notify-send` ist verfügbar. Fallback greift korrekt.

**Bewertung:** 🟢 Gering — Steam Deck sollte ohne zusätzliche Anpassungen funktionieren

---

**LX-P3-C — pgrep: Nicht auf allen Linux-Systemen verfügbar**

`pgrep` ist Teil des `procps`-Pakets und auf nahezu allen Standard-Distributionen vorinstalliert. Auf BusyBox-basierten Systemen (Alpine Linux, OpenWRT) fehlt es. LOTRO-Streamer nutzen typischerweise vollwertige Desktop-Systeme.

**Bewertung:** 🟢 Gering — akademisches Risiko für die Zielgruppe

---

**LX-P3-D — Auto-Update via GitHub Raw auf Linux: Identisch zu Windows**

Das Auto-Update-System lädt Dateien via `https.request` (Node.js built-in) von `raw.githubusercontent.com`. Dieser Pfad ist plattformunabhängig. Kein Linux-spezifisches Risiko gegenüber der Windows-Version.

Der Unterschied: `updater.js` auf Linux ruft `npm` statt `npm.cmd` auf. Wenn `npm` beim Update-Zeitpunkt nicht im PATH ist (LX-P2-E), schlägt npm install fehl. Non-fatal.

**Bewertung:** 🟢 Gering

---

**LX-P3-E — CLAUDE.md Versionstabelle: INSTALL.sh / UPDATE.sh fehlen ✅ behoben**

Die erweiterte CLAUDE.md-Checkliste für Releases enthält `INSTALL.bat` und `UPDATE.bat`, aber nicht `INSTALL.sh` und `UPDATE.sh`. Diese sind nicht im GitHub-Release-ZIP-Skript berücksichtigt.

**Fix implementiert:** CLAUDE.md aktualisiert:
- `cp`-Befehl im Release-Skript um `INSTALL.sh UPDATE.sh` erweitert
- Asset-Tabelle zeigt `INSTALL.sh` und `UPDATE.sh` als ZIP-Inhalt
- `grep`-Prüfbefehl enthält jetzt `grep -h "Version:" INSTALL.sh UPDATE.sh`
- Versionstabelle enthält Einträge für `INSTALL.sh` und `UPDATE.sh`

**Bewertung:** 🟢 Gering — behoben

---

## Gesamtbewertung

| # | Risiko | Perspektive | Bewertung | Status |
|---|---|---|---|---|
| LX-P1-A | Dialog-Fallback: Frage wird automatisch mit "Ja" beantwortet | Streamer | ~~🟡 Mittel~~ | ✅ Korrekt implementiert — Default `false` (Nein) |
| LX-P1-B | LOTRO-Pfad bei nicht-Standard Steam Library nicht erkannt | Streamer | ~~🟡 Mittel~~ → 🟢 | ✅ Behoben — `libraryfolders.vdf`-Scan in allen 3 Implementierungen |
| LX-P1-C | XDG Autostart funktioniert nicht auf allen Desktop-Umgebungen | Streamer | 🟡 Mittel | Bekannte Einschränkung — in ANLEITUNG dokumentieren |
| LX-P2-A | Dreifache `getLOTROPath()`-Duplizierung | Entwickler | 🟡 Mittel | Offen — Langfristig: gemeinsames Modul; CLAUDE.md-Hinweis ergänzt |
| LX-P2-B | Linux-Pfade vollständig ungetestet | Entwickler | 🟡 Mittel | Offen — Testlauf auf echtem Linux-System erforderlich |
| LX-P2-C | `linuxDialog()` doppelt implementiert | Entwickler | 🟡 Mittel | Offen — bei Änderungen beide Stellen synchron halten |
| LX-P3-A | Proton-Kompatdata-Pfad änderbar durch Steam-Updates | Infrastruktur | 🟡 Mittel | Bekannt — manuell behebbar per `LOTRO_PATH` |
| LX-P1-D | pgrep falsch-positive Treffer | Streamer | 🟢 Gering | Akzeptiert |
| LX-P1-E | pkill beendet mehr als erwartet | Streamer | 🟢 Gering | Akzeptiert |
| LX-P1-F | curl nicht installiert | Streamer | 🟢 Gering | INSTALL.sh prüft curl |
| LX-P1-G | notify-send ohne Daemon | Streamer | 🟢 Gering | Log-Eintrag als Fallback |
| LX-P2-D | Lutris YAML-Parsing via Regex fragil | Entwickler | 🟢 Gering | ✅ Behoben — Regex auf `(?:wine_prefix\|prefix)` erweitert |
| LX-P2-E | npm-Pfad bei NVM-Installation im XDG-PATH | Entwickler | 🟢 Gering | Non-fatal |
| LX-P2-F | Installationspfad-Inkonsistenz bei manueller Nutzung | Entwickler | 🟢 Gering | Neuinstallation behebt |
| LX-P2-G | INSTALL.sh / UPDATE.sh Versionsstellen | Entwickler | 🟢 Gering | ✅ Behoben — CLAUDE.md-Checkliste ergänzt |
| LX-P3-B | Steam Deck: Eigener Pfad | Infrastruktur | 🟢 Gering | Flatpak-Pfad abgedeckt |
| LX-P3-C | pgrep nicht auf BusyBox-Systemen | Infrastruktur | 🟢 Gering | Kein realer Use-Case |
| LX-P3-E | INSTALL.sh / UPDATE.sh fehlen in ZIP-Skript | Infrastruktur | 🟢 Gering | ✅ Behoben — CLAUDE.md + Release-Skript aktualisiert |

---

## Priorisierte Empfehlungen vor erstem Linux-Release

### Muss (Blocker)

1. ~~**LX-P1-A beheben:** `linuxDialog()` für Fragen ohne verfügbares GUI-Tool auf `false` defaulten (= "Nein, nicht jetzt"). Verhindert unbeabsichtigtes LOTRO-Beenden.~~ ✅ War bereits korrekt implementiert.

2. **LX-P2-B: Testlauf auf echtem Linux-System** — Mindestens einen Durchlauf mit tatsächlich installiertem LOTRO via Steam+Proton: LOTRO-Pfad-Erkennung, Watcher-Start, LOTRO-Prozess-Erkennung, XDG-Autostart. *Noch offen.*

### Sollte (empfohlen)

3. ~~**LX-P1-B: Steam Library Folders auslesen** — `libraryfolders.vdf` parsen und alle konfigurierten Library-Pfade für LOTRO prüfen. Deckt die häufigste Nicht-Standard-Konfiguration ab.~~ ✅ Implementiert.

4. **LX-P1-C: Dokumentation** — In der Linux-ANLEITUNG (oder README) explizit auf XDG-Autostart-Einschränkungen hinweisen und `node lotro-watcher.js` als manuelle Alternative nennen. *Noch offen.*

5. ~~**LX-P2-G + LX-P3-E: CLAUDE.md-Checkliste erweitern** — `INSTALL.sh` und `UPDATE.sh` zu Versionstabelle und ZIP-Inhalt hinzufügen.~~ ✅ Implementiert.

### Kann warten (zukünftige Version)

6. **LX-P2-A: `getLOTROPath()` konsolidieren** — Gemeinsames Modul `lib/lotro-path.js` extrahieren. Reduziert langfristigen Wartungsaufwand. CLAUDE.md-Hinweis "muss synchron gehalten werden" wurde ergänzt.

7. ~~**LX-P2-D: Lutris YAML robuster parsen** — Mehrere Felder prüfen (`wine_prefix:`, `prefix:`) und Abschnitt-Hierarchie berücksichtigen.~~ ✅ Implementiert.

---

**Fazit nach Fixes:** Von den ursprünglich identifizierten Risiken wurden alle automatisch behebbaren Code-Probleme (LX-P1-A war Fehlalarm, LX-P1-B, LX-P2-D, LX-P2-G, LX-P3-E) adressiert. Die verbleibenden offenen Punkte sind entweder strukturelle Langzeitaufgaben (LX-P2-A: Code-Konsolidierung), Dokumentationsaufgaben (LX-P1-C) oder erfordern echte Hardware (LX-P2-B: Testlauf auf Linux-System mit installiertem LOTRO). Kein verbleibendes Risiko ist ein Blocker für einen ersten Linux-Release — der kritischste offene Punkt ist **LX-P2-B**: ohne echten Testlauf auf Linux ist der tatsächliche Funktionsgrad unbekannt.

---

## Nachträgliche Bugs aus Senior Code-Review (7. März 2026)

Folgende Bugs wurden beim vollständigen Datei-Review nach dem ersten Fix-Durchlauf gefunden und behoben:

| # | Datei | Bug | Schwere | Status |
|---|---|---|---|---|
| CR-1 | `install-autostart.js:846` | `.desktop` Exec-Zeile ohne Anführungszeichen — bricht bei Leerzeichen im Home-Pfad | 🟡 Mittel | ✅ Behoben — `Exec="node" "watcher.js"` |
| CR-2 | `INSTALL.sh:63` | Lutris YAML: nur `wine_prefix:` geprüft, nicht `prefix:` — Inkonsistenz zu JS | 🟡 Mittel | ✅ Behoben — `grep -E '^\s*(wine_prefix\|prefix):'` |
| CR-3 | `INSTALL.sh` | Kein VDF-Scan für nicht-standard Steam Library-Pfade — Inkonsistenz zu JS | 🟡 Mittel | ✅ Behoben — `libraryfolders.vdf`-Scan in Bash ergänzt |
| CR-4 | `UPDATE.sh:37-38` | `pkill -f "client.js"` zu breit — trifft auch fremde Node.js-Prozesse | 🟢 Gering | ✅ Behoben — vollständiger `$INSTALL_DIR`-Pfad als Pattern |
| CR-5 | `UPDATE.sh` | Kein LOTRO-Plugin-Update — INSTALL.sh kopiert Plugin, UPDATE.sh nicht | 🟢 Gering | ✅ Behoben — LOTRO-Pfaderkennung + Plugin-Kopieren ergänzt |
| CR-6 | Alle 5 `getLOTROPath()`-Impl. | Plain Wine (Standard-Prefix `~/.wine`) nicht erkannt | 🟢 Gering | ✅ Behoben — `~/.wine/drive_c/users/$USER/...` als Schritt vor Fallback |

**Nicht als Bug gewertet (nach Analyse):**
- VDF-Regex `\\s` in Template → korrekt `\s` im Output ✅
- `linuxDialog()` Frage-Fallback = `false` (Nein) ✅ — bereits korrekt
- `execSync('"npm"...')` auf Linux — Shell-Quoting löst das auf ✅
- `pgrep -f 'proton.*212500'` — korrekte POSIX ERE ✅
- Doppelte `var tc` — gültiges `var`-Scoping in JS ✅
