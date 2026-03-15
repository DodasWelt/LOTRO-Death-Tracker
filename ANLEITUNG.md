# 🎮 LOTRO Death Tracker - Installations-Anleitung

**Version 3.0** | Stand: März 2026

---

## 🎯 Wie funktioniert es?

```
LOTRO Spiel → Plugin → Client → Server → Overlay/Website
```

Du stirbst im Spiel → Plugin erkennt es → Client sendet Daten → Overlay zeigt es im Stream.

---

## 🪟 Installation – Windows

### Schritt 1: ZIP-Datei entsperren und entpacken

Windows blockiert heruntergeladene Dateien automatisch. Ohne diesen Schritt passiert beim Doppelklick auf die BAT-Datei gar nichts.

1. **Rechtsklick** auf `LOTRO-Death-Tracker-v3.0.zip` → **Eigenschaften**
2. Haken bei **„Zulassen"** setzen → **Übernehmen** → **OK**
3. ZIP danach entpacken

### Schritt 2: INSTALL.bat entsperren und starten

1. **Rechtsklick** auf `INSTALL.bat` → **Eigenschaften** → Haken bei **„Zulassen"** → **OK**
2. **Rechtsklick** auf `INSTALL.bat` → **Als Administrator ausführen**

Der Installer erledigt alles automatisch (LOTRO-Pfad finden, Plugin installieren, Client einrichten, Autostart konfigurieren). Am Ende erscheint ein Popup: **„LOTRO Death Tracker v3.0 erfolgreich installiert!"**

> **Node.js nicht installiert?** Der Installer erkennt das und öffnet die Download-Seite automatisch. Nach der Node.js-Installation den PC neu starten und `INSTALL.bat` erneut ausführen.

### Schritt 3: Plugin im Spiel aktivieren

1. LOTRO starten und einloggen
2. Unten links auf den **Pfeil** klicken → **System** → **Zusatzmodule**
3. **DeathTracker** in der Liste anwählen → **Laden** klicken
4. Für automatisches Laden bei jedem Login: **„Beim Einloggen automatisch laden"** aktivieren

### Schritt 4: Overlay in OBS einrichten

Neue Browserquelle in OBS hinzufügen:

**URL:** `https://streamelements.com/overlay/699101f20ad2498d64a6c71e/OK0Fv1s0HutgMqmZixPH`
**Breite:** 1920 | **Höhe:** 1080

### Schritt 5: Fertig!

Der Client läuft ab sofort unsichtbar im Hintergrund und startet automatisch mit Windows. Deaths und Level-Ups werden ab jetzt automatisch erkannt und im Stream angezeigt.

---

## 🐧 Installation – Linux

### Schritt 1: ZIP entpacken

```bash
unzip LOTRO-Death-Tracker-v3.0.zip
cd LOTRO-Death-Tracker-v3.0
```

### Schritt 2: INSTALL.sh ausführen

```bash
bash INSTALL.sh
```

Der Installer findet deinen LOTRO-Pfad automatisch (Steam native, Steam Flatpak, Lutris, Wine). Alternativ kann der Pfad manuell angegeben werden:

```bash
LOTRO_PATH="/pfad/zu/LOTRO" bash INSTALL.sh
```

Am Ende erscheint die Meldung: **„LOTRO Death Tracker v3.0 erfolgreich installiert!"**

> **Node.js nicht installiert?** Den Paketmanager der Distribution verwenden, z.B. `sudo apt install nodejs npm` (Ubuntu/Debian) oder `sudo pacman -S nodejs npm` (Arch).

### Schritt 3: Plugin im Spiel aktivieren

1. LOTRO starten und einloggen
2. Unten links auf den **Pfeil** klicken → **System** → **Zusatzmodule**
3. **DeathTracker** in der Liste anwählen → **Laden** klicken
4. Für automatisches Laden bei jedem Login: **„Beim Einloggen automatisch laden"** aktivieren

### Schritt 4: Overlay in OBS einrichten

Neue Browserquelle in OBS hinzufügen:

**URL:** `https://streamelements.com/overlay/699101f20ad2498d64a6c71e/OK0Fv1s0HutgMqmZixPH`
**Breite:** 1920 | **Höhe:** 1080

### Schritt 5: Fertig!

Der Client läuft im Hintergrund und startet automatisch mit dem Desktop (XDG Autostart). Deaths und Level-Ups werden ab jetzt automatisch erkannt.

---

## 🗑️ Deinstallation

### Windows

Im Installationsverzeichnis (`C:\LOTRO-Death-Tracker\`) liegt `UNINSTALL.bat`.

1. **Rechtsklick** auf `UNINSTALL.bat` → **Als Administrator ausführen**
2. Bestätigung mit **J** eingeben
3. Der Deinstaller stoppt alle laufenden Prozesse, entfernt die Autostart-Einträge, löscht das LOTRO-Plugin und das gesamte Installationsverzeichnis.

Am Ende erscheint ein Popup: **„Deinstallation abgeschlossen."**

> Das Skript löscht sich nach Abschluss automatisch selbst.

### Linux

Im Installationsverzeichnis (`~/.local/share/lotro-death-tracker/`) liegt `UNINSTALL.sh`.

```bash
bash ~/.local/share/lotro-death-tracker/UNINSTALL.sh
```

Der Deinstaller stoppt alle laufenden Prozesse, entfernt die Autostart-Desktop-Dateien, löscht das LOTRO-Plugin und das Installationsverzeichnis.

---

## 🔄 Saubere Neuinstallation

Falls die Installation beschädigt ist oder du einen sauberen Neustart möchtest:

### Windows

1. **Rechtsklick** auf `REINSTALL.bat` (im Installationsverzeichnis oder ZIP) → **Als Administrator ausführen**
2. Das Skript lädt die neueste Version automatisch von GitHub, deinstalliert die alte Version und führt eine Frischinstallation durch.

> Kein manuelles Löschen nötig — `REINSTALL.bat` erledigt alles automatisch.

### Linux

```bash
bash REINSTALL.sh
```

Das Skript lädt die neueste Version von GitHub, deinstalliert die alte Version und führt eine Frischinstallation durch.

---

## ❓ Bei Fragen oder Problemen

Melde dich via Discord bei Doda.

---

## 🔧 Problemlösung

### Watcher startet nach einem Absturz nicht mehr

**Symptom:** LOTRO läuft, aber Death Tracker erkennt keine Tode mehr. In `watcher.log` steht `Watcher bereits aktiv (PID X)` — obwohl kein zweiter Watcher im Task-Manager sichtbar ist.

**Ursache:** Der Watcher wurde unerwartet beendet, ohne seine Lock-Datei zu bereinigen.

**Windows:**
1. Datei `C:\LOTRO-Death-Tracker\watcher.pid` löschen
2. Dann in einer Eingabeaufforderung:
   ```
   cd C:\LOTRO-Death-Tracker
   npm run install-service
   ```

**Linux:**
1. Datei `~/.local/share/lotro-death-tracker/watcher.pid` löschen
2. Dann:
   ```bash
   cd ~/.local/share/lotro-death-tracker
   npm run install-service
   ```

### Fenster schließt sich sofort (Windows)

Eine Logdatei (`install.log`) wird im selben Ordner wie die BAT-Datei erstellt. Existiert sie nicht, ist die BAT-Datei noch blockiert (Schritt 1 und 2 wiederholen). Existiert sie, enthält sie den genauen Fehlergrund.

### Status-Seite in OBS einrichten (optional)

Nach der Installation läuft ein lokaler Status-Server, der den aktuellen Zustand aller Tracker-Komponenten anzeigt.

**OBS Browser-Dock einrichten:**
1. OBS öffnen → Menü **Docks** → **Benutzerdefinierte Browser-Docks**
2. Name: `LOTRO Status`, URL: `http://localhost:7890` → **OK**
3. Das Dock zeigt: Watcher ✓/✗, Client ✓/✗, Plugin ✓/✗

Der Status-Server startet automatisch mit dem Watcher und ist auch dann erreichbar, wenn der Watcher nicht läuft — der **„Watcher neu starten"**-Button funktioniert daher immer.

