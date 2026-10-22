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

**Overlay ab 3.1:** `Overlay/lotro-death-overlay.html`, vom WP-Plugin ausgeliefert unter
`https://www.dodaswelt.de/wp-json/lotro-deaths/v1/overlay` — **eine URL für alle Streamer** (OBS → Browser-Quelle, 1920×1080). Kein Token, URL darf öffentlich sein (nur lesend).

- **Sendeplan statt Quittieren:** Overlay pollt `GET /death/current` alle 2 s und plant jeden Eintrag aus `upcoming` per `setTimeout` auf `showAt - clockOffset`. `clockOffset` = Offset der Probe mit kürzester Laufzeit (`serverTime` vs. lokale Mitte der Anfrage). Ergebnis im Test: zwei Tabs zeigen auf die Millisekunde gleichzeitig.
- Zustandslos: kein `POST /death/next`; nach Suspend/Neustart wird einfach wieder der aktuelle Plan geholt. Wer > `MIN_REMAINING_MS` vor Ende dazukommt, zeigt den Rest; Sound nur bis `SOUND_MAX_LATE_MS` nach Beginn.
- Kein Mapping-Filter mehr im Overlay — der Server nimmt nur gemappte Charaktere an.
- API-Basis wird aus der eigenen URL abgeleitet (auch `?rest_route=`-Form); lokale Datei → Fallback `DEFAULT_API_URL`; Override `?api=`.
- **Test:** `…/overlay?test=1` → `/test/`-Endpunkte, TEST-Badge, ohne Sound (`&sound=1` mit Sound). Ersetzt das frühere `streamelements-overlay-test.html`.
- OBS-Hinweis: Autoplay-Audio funktioniert in OBS-Browser-Quellen ohne Klick (obs-browser setzt `autoplay-policy=no-user-gesture-required`). Bei „Audio über OBS steuern" berichten einige Nutzer von fehlendem Ton → ggf. Hardwarebeschleunigung der Browser-Quelle abschalten.

**Altes StreamElements-Overlay (veraltet, Übergang):** `Overlay/streamelements-overlay-minimalist.html`, URL `https://streamelements.com/overlay/699101f20ad2498d64a6c71e/OK0Fv1s0HutgMqmZixPH`. Funktioniert mit 3.1 weiter (`/death/next` ist No-op), zeigt aber nicht synchron. Michael will weg von StreamElements; Twitch-Extension ist ausdrücklich nicht gewünscht.

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
<script src="https://cdn.jsdelivr.net/gh/DodasWelt/LOTRO-Death-Tracker@v3.1/Website/lotro-data-fetcher.js"></script>
```
Bei neuem Release: `@v3.1` → `@v3.2` (usw.) im Script-Tag aktualisieren. Auch in `Overlay/CLAUDE.md` CDN-Einbindungs-Beispiel (`@vX.Y`) auf `vX.Y` setzen.
