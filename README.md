# LOTRO Death Tracker

Automatisches Death- & Level-Up-Tracking für Lord of the Rings Online Stream-Overlays.

Entwickelt von **DodasWelt / Herrin Inge** | [dodaswelt.de](https://www.dodaswelt.de)

---

## Was ist das?

Der LOTRO Death Tracker erkennt automatisch, wenn dein Charakter in Lord of the Rings Online stirbt oder einen Level aufsteigt, und zeigt diese Events als animiertes Overlay in deinem Stream an.

### Wie es funktioniert

1. Ein **Lua-Plugin** im Spiel erkennt Tod und Level-Up-Events
2. Ein **Node.js-Client** auf deinem PC liest diese Events aus und sendet sie an einen Server
3. Das **StreamElements-Overlay** zeigt die Events live in deinem Stream an

---

## Schnellstart

Die vollstandige Installationsanleitung findest du in [ANLEITUNG.md](ANLEITUNG.md).

Kurzzusammenfassung:
1. `INSTALL.bat` als Administrator ausfuhren
2. LOTRO starten und das Plugin laden: `/plugins load DodasWelt.DeathTracker`
3. StreamElements-Overlay-URL in OBS einbinden

---

## Projektstruktur

```
/Client/          Node.js Client (File-Watcher & API-Sender)
/LOTRO-Plugin/    Lua Plugin fur das Spiel
/WordPress/       WordPress REST API Plugin (Server)
/Overlay/         StreamElements Overlay (HTML/CSS/JS)
/Website/         JS-Bibliothek fur Website-Integration
INSTALL.bat       Installer fur Windows
ANLEITUNG.md      Vollstandige Installationsanleitung
```

---

## Systemanforderungen

- Windows 10 oder neuer
- Lord of the Rings Online (Steam oder Arc)
- Node.js 18 oder neuer
- StreamElements-Account (fur das Overlay)

---

## Lizenz

Privates Projekt. Weitergabe und Nutzung fur LOTRO-Streamer erlaubt.
