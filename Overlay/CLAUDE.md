# Overlay & Website — Implementierungsdetails

Ergänzt das Root-`CLAUDE.md`. Gilt für alle Arbeiten in `Overlay/` und `Website/`.

---

## Audio-Logik im Overlay

| Situation | Sound |
|---|---|
| Normaler Tod (`deathCount % 5 !== 0`) | `Trauerlied_1.mp3` |
| Meilenstein-Tod (5., 10., 15., … = `deathCount % 5 === 0`) | zufällig `Alert_1.mp3` **oder** `Alert_2.mp3` |

Audio-URLs: `https://www.dodaswelt.de/lotro/` + Dateiname. Konfiguriert in `CONFIG.SOUND_URL` und `CONFIG.ALERT_SOUND_URLS`.

---

## Overlay-Anzeige

Pro Death-Event für `DISPLAY_DURATION` (Standard: 10s):
- `GEFALLEN` (Titel, animiert) · Charakter-Name · `Level N` · `N Mal gestorben`

**Mapping-Filter:** Beim Start (und alle 5 Minuten) holt Overlay `/streamers` → `Set` gemappter Charakternamen. Unbekannte Charaktere → `skipDeath()` (still `/death/next`, nicht anzeigen). Leeres Set (API nicht erreichbar) → fail-open.

Filter greift in **beiden** Pfaden: `checkForDeaths` und `advanceQueue`.

**StreamElements Overlay URL:** `https://streamelements.com/overlay/699101f20ad2498d64a6c71e/OK0Fv1s0HutgMqmZixPH` (1920×1080)

**Test-Overlay:** `Overlay/streamelements-overlay-test.html` — lokal öffenbar (Doppelklick). TEST-Badge, keine Sounds, kein Filter, 6s Anzeigedauer.

---

## lotro-data-fetcher.js (Website-Integration)

IIFE-Modul als `LOTROData` global auf `herrin-inge.de`. Öffentliche API:
- `LOTROData.getCurrentCharacter(name?)` → letzter aktiver Charakter (via `/characters`, nach `last_seen DESC`)
- `LOTROData.getLatestDeath(name?)` → letzter verarbeiteter Tod aus History
- `LOTROData.getAllDeaths(limit?, name?)` → mehrere History-Einträge
- `LOTROData.getAllCharacters()` → alle Charaktere mit Level + Statistiken
- `LOTROData.getStats()` → Gesamtstatistiken via `/health`
- `LOTROData.watchForUpdates(callback, interval?)` → Callback bei neuem Tod (Standard: 30s)
- `LOTROData.getAllStreamers()` → alle Streamer aus `/streamers`
- `LOTROData.getStreamer(twitchUsername)` → Stats für einen Streamer
- `LOTROData.watchStreamers(callback, interval?)` → Callback bei Änderungen (Standard: 60s)
- `LOTROData.setApiUrl(url)` → API-URL überschreiben

**CDN-Einbindung auf herrin-inge.de:**
```html
<script src="https://cdn.jsdelivr.net/gh/DodasWelt/LOTRO-Death-Tracker@v3.0/Website/lotro-data-fetcher.js"></script>
```
Bei neuem Release: `@v3.0` → `@v3.1` (usw.) im Script-Tag aktualisieren. Auch in `Overlay/CLAUDE.md` CDN-Einbindungs-Beispiel (`@vX.Y`) auf `vX.Y` setzen.
