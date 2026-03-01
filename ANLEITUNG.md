# 🎮 LOTRO Death Tracker - Installations-Anleitung für Streamer

**Version 2.0** | Stand: März 2026

---

## 📋 Inhaltsverzeichnis

1. [Überblick](#überblick)
2. [Wichtig vor dem Start: ZIP und BAT-Datei entsperren](#wichtig-vor-dem-start-zip-und-bat-datei-entsperren)
3. [Voraussetzungen](#voraussetzungen)
4. [Installation - Automatisch](#installation-automatisch)
5. [Update von Version 1.5 auf 2.0](#update-von-version-15-auf-20)
6. [Plugin im Spiel laden](#plugin-im-spiel-laden)
7. [StreamElements Overlay einrichten](#streamelements-overlay-einrichten)

---

## 🎯 Überblick

Der **LOTRO Death Tracker** zeigt automatisch deine Deaths im Stream an:

- ✅ **LOTRO Plugin** - Erkennt Deaths im Spiel
- ✅ **Client** - Lädt Daten automatisch hoch (läuft unsichtbar im Hintergrund)
- ✅ **Overlay** - Zeigt Deaths im Stream (StreamElements Overlay)
- ✅ **Website** - Zeigt aktuelles Level auf der Website

### Wie funktioniert es?

```
LOTRO Spiel → Plugin → Client → Server → Overlay/Website
```

1. Du stirbst im Spiel
2. Plugin erkennt den Tod
3. Client sendet Daten zum Server
4. Overlay zeigt es im Stream
5. Website zeigt dein aktuelles Level

---

## ⚠️ Wichtig vor dem Start: ZIP und BAT-Datei entsperren

Windows blockiert aus dem Internet heruntergeladene Dateien automatisch ("Mark of the Web"). Ohne diesen Schritt kann es sein, dass sich das Fenster sofort wieder schließt, ohne dass etwas passiert.

### Schritt 1: ZIP-Datei entsperren (VOR dem Entpacken!)

1. **Rechtsklick** auf die heruntergeladene ZIP-Datei (`LOTRO-Death-Tracker-v2.0.zip`)
2. Wähle: **Eigenschaften**
3. Unten im Fenster: Haken bei **"Zulassen"** setzen
4. Auf **Übernehmen** klicken, dann **OK**

> ⚠️ Diesen Schritt unbedingt VOR dem Entpacken durchführen! Wird die ZIP erst entpackt und dann entsperrt, sind die enthaltenen Dateien trotzdem noch blockiert.

### Schritt 2: BAT-Datei entsperren (nach dem Entpacken)

Auch nach dem Entpacken muss die ausführbare Datei einzeln entsperrt werden:

- **Für Erstinstallation:** Rechtsklick auf `INSTALL.bat` → Eigenschaften → Haken bei "Zulassen" → Übernehmen → OK
- **Für Update:** Rechtsklick auf `UPDATE.bat` → Eigenschaften → Haken bei "Zulassen" → Übernehmen → OK

Danach die Datei als Administrator ausführen (siehe unten).

### Falls das Fenster sich trotzdem sofort schließt

Eine Diagnose-Logdatei (`install.log` bzw. `update.log`) wird im selben Ordner wie die BAT-Datei erstellt. Existiert diese Datei NICHT, ist die BAT selbst noch blockiert (Schritt 2 wiederholen). Existiert sie, enthält sie den genauen Fehlergrund.

---

## ⚙️ Voraussetzungen

### Was du brauchst:

#### ✅ **Node.js**

Node.js ist eine Laufzeitumgebung, die der Death Tracker Client benötigt.

**So überprüfst du ob Node.js bereits installiert ist:**
1. Windows-Taste drücken
2. `cmd` eingeben und Enter
3. `node --version` eingeben
4. Wenn eine Versionsnummer erscheint (z.B. `v24.14.0`) → **Installiert ✓**
5. Wenn Fehler erscheint → Node.js ist nicht installiert

**Node.js nicht installiert?** Kein Problem! Die Installer-/Update-Datei erkennt das automatisch und öffnet den Download direkt im Browser. Nach der Installation von Node.js **unbedingt den PC neu starten**, bevor du INSTALL.bat oder UPDATE.bat erneut ausführst.

---

## 🚀 Installation - Automatisch (EMPFOHLEN)

Der Installer macht alles automatisch!

> **Voraussetzung:** ZIP entsperren + INSTALL.bat entsperren (siehe oben)

#### **Schritt 1: Installer starten**
1. In den entpackten Ordner gehen
2. **Rechtsklick** auf `INSTALL.bat`
3. Wähle: **Als Administrator ausführen** ⚠️

#### **Schritt 2: Installation durchführen**

Der Installer führt dich durch 5 Schritte:

```
[1/5] Node.js überprüfen
[2/5] LOTRO-Ordner finden
[3/5] Plugin installieren
[4/5] Client installieren
[5/5] Autostart konfigurieren
```

**Falls LOTRO nicht gefunden wird:**
- Installer fragt nach dem Pfad
- Pfad ist meistens:
  - `C:\Users\DEINNAME\Documents\The Lord of the Rings Online`

**Falls Node.js nicht gefunden wird:**
- Der Browser öffnet automatisch den Node.js-Installer
- Node.js installieren (alle Standardeinstellungen übernehmen)
- ⚠️ PC danach neu starten
- INSTALL.bat erneut ausführen

#### **Schritt 3: Fertig!**

Am Ende erscheint ein Popup-Fenster: **"LOTRO Death Tracker v2.0 erfolgreich installiert!"**

Nach der Installation:
- ✅ Plugin installiert
- ✅ Client installiert und läuft im Hintergrund
- ✅ Autostart konfiguriert (startet automatisch mit Windows)
- ✅ Bereit zum Streamen!

---

## 🔄 Update von Version 1.5 auf 2.0

Du hast bereits den LOTRO Death Tracker installiert und möchtest auf Version 2.0 aktualisieren?

> **Voraussetzung:** ZIP entsperren + UPDATE.bat entsperren (siehe oben)

#### **Schritt 1: Update-Paket entpacken**
1. Das neue ZIP entpacken
2. In den entpackten Ordner gehen

#### **Schritt 2: Update starten**
1. **Rechtsklick** auf `UPDATE.bat`
2. Wähle: **Als Administrator ausführen** ⚠️

Der Updater macht automatisch:
```
[1/5] Alten Autostart stoppen
[2/5] Client-Dateien aktualisieren
[3/5] Node.js Pakete aktualisieren
[4/5] LOTRO Plugin aktualisieren
[5/5] Autostart neu konfigurieren und Watcher starten
```

#### **Schritt 3: Fertig!**

Am Ende erscheint ein Popup-Fenster: **"LOTRO Death Tracker v2.0 aktualisiert!"**

Ein Windows-Neustart ist **nicht** nötig - der neue Watcher startet automatisch im Hintergrund.

#### **Falls LOTRO während des Updates lief:**
Im Spiel eingeben:
```
/plugins unload DodasWelt.DeathTracker
/plugins load DodasWelt.DeathTracker
```

---

## 🎮 Plugin im Spiel laden

### **Erste Verwendung:**

1. **Starte LOTRO**
2. **Logge dich ein**
3. **Öffne Chat-Fenster**
4. **Gib ein:** `/plugins load DodasWelt.DeathTracker`

Falls das nicht funktioniert, kannst du das Plugin auch über den Pfeil unten links → System → Zusatzmodule → DeathTracker anwählen und oben auf "Laden" klicken.

### **Plugin-Befehle:**

```
/plugins load DodasWelt.DeathTracker    → Plugin laden
/plugins unload DodasWelt.DeathTracker  → Plugin entladen
/plugins list                           → Alle Plugins anzeigen
```

### **Wichtig:**
- Plugin muss **nach jedem Login** geladen werden
- Auto-Load kann für jeden Charakter bei Zusatzmodule eingestellt werden

---

## 📺 StreamElements Overlay einrichten

Füge die folgende URL als neue Browserquelle in OBS ein:
https://streamelements.com/overlay/699101f20ad2498d64a6c71e/OK0Fv1s0HutgMqmZixPH

Die Auflösung ist 1920 (Breite) x 1080 (Höhe)

---

## ❓ Bei Fragen oder es funktioniert etwas nicht

Melde dich via Discord bei Doda
