# 🎮 LOTRO Death Tracker - Installations-Anleitung für Streamer

**Version 5.0** | Stand: Februar 2025

---

## 📋 Inhaltsverzeichnis

1. [Überblick](#überblick)
2. [Voraussetzungen](#voraussetzungen)
3. [Installation - Automatisch](#installation-automatisch)

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

## ⚙️ Voraussetzungen

### Was du brauchst:

#### ✅ **Node.js (WICHTIG!)**
- **Installation starten:** Doppelklick auf node-v24.13.1-x64.msi
- **Installation:** Standardeinstellungen OK (sprich alles nur bestätigen ohne Änderungen)
- **Nach der Installation:**⚠️⚠️⚠️ SEHR SEHR WICHTIG ⚠️⚠️⚠️: PC neustarten - ist Wichtig, damit alles richtig funktioniert

**So überprüfst du ob Node.js installiert ist:**
1. Windows-Taste drücken
2. `cmd` eingeben und Enter
3. `node --version` eingeben
4. Wenn eine Versionsnummer erscheint (z.B. `v20.11.0`) → **Installiert ✓**
5. Wenn Fehler → **Node.js installieren**

---

## 🚀 Installation - Automatisch (EMPFOHLEN)

Der Installer macht alles automatisch!

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
- Öffne ein zweites Explorer-Fenster
- Suche nach: `PluginData` Ordner
- Pfad ist meistens:
  - `C:\Program Files (x86)\Steam\steamapps\common\Lord of the Rings Online\PluginData`
  - ODER: `C:\Users\DEINNAME\Documents\The Lord of the Rings Online\PluginData`

#### **Schritt 3: Fertig!**

Nach der Installation:
- ✅ Plugin installiert
- ✅ Client installiert
- ✅ Autostart konfiguriert
- ✅ Bereit zum Streamen!

## 🎮 Plugin im Spiel laden

### **Erste Verwendung:**

1. **Starte LOTRO**
2. **Logge dich ein**
3. **Öffne Chat-Fenster**
4. **Gib ein:** `/plugins load DodasWelt.DeathTracker`
Falls das nicht funktioniert, kannst du das Plugin auch über den Pfeil unten links -> System -> Zusatzmodule und dort den DeathTracker anwählen und oben auf laden stellen
5. **Bestätige:** Im Chat sollte erscheinen: `DeathTracker loaded`

### **Plugin-Befehle:**

```
/plugins load DodasWelt.DeathTracker    → Plugin laden
/plugins unload DodasWelt.DeathTracker  → Plugin entladen
/plugins list                           → Alle Plugins anzeigen
```

### **Wichtig:**
- Plugin muss **nach jedem Login** geladen werden
- Auto-Load kann für jeden Charakter bei Zusatzmodule (siehe ein paar Zeilen weiter oben) eingestellt werden.

---

## 📺 StreamElements Overlay einrichten

Füge die folgende URL, als neue Browserquelle in OBS ein:
https://streamelements.com/overlay/699101f20ad2498d64a6c71e/OK0Fv1s0HutgMqmZixPH

Die Auflösung ist 1920 (Breite) x 1080 (Höhe)


---

## 🔄 Update von Version 1.5 auf 2.0

Du hast bereits den LOTRO Death Tracker installiert und möchtest auf Version 2.0 aktualisieren?

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
[5/5] Autostart neu konfigurieren
```

#### **Schritt 3: Windows neu starten**
Damit der neue Autostart aktiv wird, bitte Windows neu starten oder Abmelden → Anmelden.

#### **Falls LOTRO während des Updates lief:**
Im Spiel eingeben:
```
/plugins unload DodasWelt.DeathTracker
/plugins load DodasWelt.DeathTracker
```

---

## ❓Bei Fragen oder es funktioniert etwas nicht ##
Melde dich via Discord bei Doda