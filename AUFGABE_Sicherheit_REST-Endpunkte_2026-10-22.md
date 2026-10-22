# AUFGABE: REST-Endpunkte des WordPress-Plugins absichern

**Erstellt:** 22.10.2026, aus einer Sicherheits-Session zu dodaswelt.de (Anlass: PHP-Lücken php2shell, CVE-2026-109618/-109619)
**Betrifft:** `WordPress/lotro-death-tracker.php` (läuft live auf dodaswelt.de, Plugin-Version 3.0)
**Status:** ✅ ERLEDIGT am 22.10.2026 — umgesetzt als v3.1, getestet, gepusht, Pre-Release v3.1 erstellt. Offen bei Michael: WP-Plugin hochladen + Live-Test (siehe Abschluss unten).

## Befund (Stichprobe vom 22.10.2026)

In `register_routes()` (ab ca. Zeile 336) sind rund 15 Routen unter `lotro-deaths/v1` mit `'permission_callback' => '__return_true'` registriert, also für jeden im Internet offen. Darunter schreibende Routen:

- `POST /death` (Client meldet Tod/Level-up)
- `POST /death/next` (Warteschlange weiterschalten)
- `POST /death/silent`
- `POST /test/death`, `GET /test/death/current`, `POST /test/death/next` u. a. — Test-Routen im Produktivsystem

Nur `POST`/`DELETE /streamers/mapping` prüfen `check_admin_permission`.

**Folgen:** Jeder, der die URL kennt, kann gefälschte Tode/Level-ups mit beliebigen Charakternamen einschleusen (erscheinen live im StreamElements-Overlay und auf herrin-inge.de), die Warteschlange manipulieren oder die Datenbank vollschreiben.

**Nicht gefunden (Stichprobe, nicht vollständig geprüft):** SQL-Injection — Eingaben laufen durch `sanitize_text_field`, Abfragen mit Nutzereingaben über `$wpdb->prepare`. Kein Hinweis auf Codeausführung.

## Wichtige Randbedingung

Der Node.js-Client wird **öffentlich über GitHub Releases an mehrere Streamer verteilt**. Ein einzelner fest eingebauter API-Schlüssel im Client wäre damit öffentlich und schützt nichts. Außerdem lesen das Overlay (StreamElements) und `Website/lotro-data-fetcher.js` (herrin-inge.de, Browser) Daten per GET — diese Lesezugriffe müssen weiter funktionieren.

## Aufgabe

1. **Ist-Analyse:** Für jede Route klären, wer sie aufruft (Client, Overlay, Website-Fetcher, Admin) und ob sie öffentlich sein muss. Quellen: `Client/`, `Overlay/`, `Website/`, `WordPress/CLAUDE.md`, `RISIKOANALYSE-v2.7.md`.
2. **Lösungsvorschlag an Michael** (vor der Umsetzung, mit Vor- und Nachteilen), z. B.:
   - Schreibende Routen nur mit Token pro Streamer/Installation (Token im WP-Admin erzeugen, im Client einmalig eintragen, Prüfung per `hash_equals` im `permission_callback`)
   - `/death/next` und `/death/silent`: wer ruft sie auf? Falls das Overlay — eigener Overlay-Token im StreamElements-Widget
   - `/test/*`-Routen entfernen oder nur für Admins
   - Einfaches Rate-Limit (Transient pro IP) und Längenbegrenzung der Felder
   - Lese-Routen (`GET`) bewusst öffentlich lassen
3. **Rückwärtskompatibilität / Rollout:** Bestehende Streamer-Installationen dürfen nicht über Nacht kaputtgehen. Übergangsphase (Token optional → Pflicht) und Update-Weg (`UPDATE.bat`/`UPDATE.sh`, Auto-Updater) mitdenken.
4. Umsetzung erst nach Freigabe. Danach Test gegen die Test-Umgebung laut `WordPress/CLAUDE.md`.

## Nicht Teil dieser Aufgabe

WordPress-Härtung allgemein (Cloudflare, Wordfence, PHP-Update) — ist am 22.10.2026 erledigt worden.

---

## Ist-Analyse (Claude, 22.10.2026)

| Route | Aufrufer (Code-Stelle) | Muss öffentlich sein? | Risiko heute |
|---|---|---|---|
| `POST /death` | `Client/client.js:155` (axios) | nein → Streamer-Token | **hoch**: Fake-Tode/Level-ups mit beliebigem Namen, DB-Flut |
| `POST /death/silent` | Watcher `Client/install-autostart.js:713` | nein → Streamer-Token | **kritisch**: `count` hat keine Obergrenze → *eine* Anfrage mit `count=10000000` = 10 Mio. INSERTs (DoS + Zählerfälschung) |
| `POST /death/next` | Overlay `streamelements-overlay-minimalist.html:359/390`, Test-Overlay | nein → Overlay-Token | **mittel**: Tode lassen sich vor der Anzeige wegklicken (IDs sind über `/death/current` lesbar); ohne `id` wird blind der älteste markiert |
| `GET /death/current` | Overlay | ja | gering (nur Lesen) |
| `GET /queue` | niemand (kein Aufrufer gefunden) | nein | gering, nur Info-Leck |
| `GET /history`, `/characters`, `/streamers`, `/health` | Website-Fetcher, Overlay, Watcher (`/characters`), Client (`/health`) | ja | gering; `limit` ist auf 100 gedeckelt |
| `POST/DELETE /streamers/mapping`, `DELETE /test/clear` | Admin (App-Passwort) | – | geschützt |
| `POST /test/death`, `POST /test/death/next` | nur manuell bei Tests (`SERVER_URL=.../test/death`) | nein | mittel: Test-Tabellen beliebig befüllbar |
| `GET /test/death/current`, `/test/queue`, `/test/health` | Test-Overlay | nein (nur während Tests) | gering |

Weitere Befunde:
- Keine Längenprüfung: `characterName`/`region` gehen bis `VARCHAR(255)`, `date/time/datetime` ungeprüft, `level` beliebig (auch negativ), `eventType` nicht auf `death|levelup` beschränkt.
- `streamer_mapping` hat `UNIQUE(twitch_username)` → genau **ein** Charakter pro Streamer. Ein Token an Charakter zu binden, würde Twinks sperren.
- Das WP-Plugin hat **keine Admin-Seite**; Mappings laufen nur per REST + App-Passwort.
- Der Updater ersetzt nur eine feste Dateiliste → eine neue lokale Token-Datei im Installationsordner überlebt Updates.
- SQL-Injection: bestätigt keine gefunden (alle Nutzereingaben über `prepare`/`insert` mit Formaten).

## Lösungsvorschlag

### Phase 1 – Sofort-Härtung (WP-Plugin 3.1, bricht keinen Client)
1. `/death/silent`: `count` auf max. 20 pro Anfrage begrenzen (Watcher sendet realistisch 1–5).
2. Eingabeprüfung: `eventType` nur `death|levelup`, `level` 0–200, `characterName` max. 64 Zeichen, `region` 100, `race/class` 50, `date/time/datetime` 50. Sonst HTTP 400.
3. Rate-Limit per Transient pro IP für schreibende Routen (z. B. 30/Min., `/death/silent` 5/Min.), Antwort HTTP 429.
4. `/death/next` ohne `id` → HTTP 400 (blinder Fallback entfällt; beide Overlays senden immer `id`).
5. `/test/*` schreibend und lesend nur, wenn im WP-Admin „Testmodus" eingeschaltet ist (sonst 404). Standard: aus.
6. `GET /queue` entfernen oder auf Admin beschränken (kein Aufrufer).

### Phase 1b – Token-System vorbereiten (WP 3.1 + Client 3.1, Token optional)
- Neue WP-Admin-Seite *Einstellungen → LOTRO Death Tracker*: pro Streamer Token erzeugen/widerrufen, Anzeige „zuletzt benutzt", Overlay-Token, Testmodus-Schalter, Modus `aus | protokollieren | erzwingen` (Standard: protokollieren).
- Tokens: 32 Byte Zufall (`random_bytes`), in der DB nur als SHA-256 gespeichert, beim Erzeugen einmalig angezeigt. Prüfung im `permission_callback` per `hash_equals`.
- Header `X-LOTRO-Token` (wird in `add_cors_headers` zu `Allow-Headers` ergänzt).
- Client: liest Token aus `token.txt` im Installationsordner (oder Env `LOTRO_TOKEN`), sendet ihn in `client.js` und im Watcher (`httpsPostJSON`). Ohne Token läuft alles wie bisher.
- Overlay: neues `CONFIG.OVERLAY_TOKEN`, Header bei `/death/next`.
- Eingabe beim Streamer: optionale Abfrage in `INSTALL.bat/.sh` + `UPDATE.bat/.sh` (Enter = überspringen) und ein Eingabefeld im OBS-Dock (Status-Server Port 7890).

### Phase 2 – Pflicht (WP 3.2, frühestens wenn die Admin-Seite alle aktiven Streamer als „mit Token" zeigt)
- Modus auf `erzwingen`: `/death`, `/death/silent` ohne gültigen Token → HTTP 401, `/death/next` ohne Overlay-Token → 401.
- Watcher-Log zeigt bei 401 einen klaren Hinweis „Token fehlt/ungültig – bei DodasWelt anfordern".

### Vor- und Nachteile
- **+** Phase 1 schließt die DoS-Lücke und Feld-Missbrauch sofort, ohne dass ein Streamer etwas tun muss.
- **+** Token pro Installation → einzeln widerrufbar, kein gemeinsames Geheimnis im öffentlichen Code.
- **+** Umschalten auf `erzwingen` ist ein Klick, kein neues Release.
- **−** Bis Phase 2 bleiben Fake-Tode möglich (nur gebremst durch Rate-Limit und Validierung).
- **−** Jeder Streamer muss den Token einmal von Hand eintragen. Das Auto-Update kann das nicht übernehmen.
- **−** Overlay-Token steht im Widget-Code. Das reicht, solange die Overlay-URL nicht öffentlich wird.
- **−** Neue DB-Tabelle für Tokens → `$db_version` 2.1 → 2.2.

---

## Überarbeiteter Plan nach Rücksprache mit Michael (22.10.2026)

**Entscheidungen Michael:**
- Umfang: Phase 1 + Token-System. Twitch Extension: nein. Overlay später als gehostete OBS-Browser-Source (siehe Recherche).
- Token wird **automatisch beim ersten Senden** vergeben (Trust on First Use), kein manuelles Verschicken.
- Abholfenster **7 Tage** ab Anlegen/Zurücksetzen, nur **einmal** abholbar.
- Button **„Token zurücksetzen" pro Streamer** im WP-Admin (startet ein neues 7-Tage-Fenster).
- **Ein Charakter pro Streamer**, keine Twinks (bleibt `UNIQUE twitch_username`).
- **Nicht gemappte Charaktere werden abgelehnt** (HTTP 403).
- `REINSTALL` behält `token.txt`, `UNINSTALL` löscht sie (danach Reset durch Michael).
- Bestehende Streamer aus Season 1: kein Sonderweg, ggf. für Season 2 neu anlegen.

**Ablauf Token (Server, WP-Plugin 3.1):**
1. Mapping-Tabelle bekommt `token_hash`, `token_claimed_at`, `claim_until`, `token_last_used` (db_version 2.1 → 2.2). Beim Anlegen/Reset: `token_hash = NULL`, `claim_until = jetzt + 7 Tage`.
2. `POST /death` und `/death/silent`:
   - Charakter nicht im Mapping → 403.
   - Charakter hat Token → Header `X-LOTRO-Token` muss passen (`hash_equals` auf SHA-256) → sonst 401.
   - Charakter ohne Token, Client meldet `X-LOTRO-Client: 3.1` und Fenster offen → Token wird atomar vergeben (`UPDATE … WHERE token_hash IS NULL`), Klartext einmalig in der Antwort (`authToken`).
   - Charakter ohne Token, alter Client (kein Header) → wird angenommen wie bisher (Übergang), kein Token.
   - Fenster abgelaufen und kein Token → 401 mit Hinweis „Token zurücksetzen lassen".
3. Später (WP 3.2, wenn alle aktiven Streamer einen Token haben): Übergangsregel für alte Clients entfernen.

**Client 3.1:** liest/schreibt `token.txt` im Installationsordner, sendet `X-LOTRO-Token` + `X-LOTRO-Client`, speichert `authToken` aus der Antwort. Gilt für `client.js` und Watcher (`httpsPostJSON`). Bei 401 liest der Watcher die Datei neu (falls der Client gerade abgeholt hat) und loggt sonst einen klaren Hinweis. `REINSTALL.bat/.sh` sichern `token.txt` vor dem Löschen und stellen sie wieder her. Der Updater lässt die Datei sowieso unangetastet.

**WP-Admin-Seite (neu):** Tabelle aller Streamer mit Charakter, Token-Status (offen bis … / abgeholt am … / Fenster abgelaufen), zuletzt benutzt, Button „Token zurücksetzen". Dazu Formular zum Anlegen/Löschen von Streamern (Michael: ja).

**Phase 1 (unverändert):** `/death/silent` max. 20, Feldvalidierung, Rate-Limit pro IP, `/test/*` nur bei Testmodus, `GET /queue` entfernen, `X-LOTRO-Token`/`X-LOTRO-Client` in CORS-Allow-Headers. (`/death/next` entfällt, siehe Overlay.)

**Overlay (kommt mit in Release 3.1) – Sendeplan statt Quittieren:**
- Eine gemeinsame URL für alle Streamer (gehostet auf dodaswelt.de, OBS-Browser-Source). Kein Overlay-Token, kein Schlüssel pro Streamer. URL darf öffentlich sein.
- Server vergibt beim Eintreffen eines Todes einen Sendeplatz (`show_at` = max(jetzt, Ende des vorherigen Sendeplatzes)). Keine Obergrenze für den Rückstau (Michael: Gruppen-Tode dürfen nacheinander laufen).
- `GET /death/current` liefert den aktuellen/nächsten Sendeplatz + Serverzeit; Overlays gleichen ihre Uhr ab und zeigen Bild + Ton synchron.
- `POST /death/next` entfällt (in der Übergangszeit No-op, damit das alte StreamElements-Overlay weiterläuft).
- Overlay ist zustandslos und erholt sich selbst nach Schlafen/Neustart.
- Verpasste Sendeplätze werden nicht nachgeholt – laut Regel läuft OBS beim sterbenden Streamer immer, also kein Problem. Statistik/History unverändert.
- Gezeigt-Status: Tod gilt als `processed=1`, sobald sein Sendeplatz vorbei ist (History/herrin-inge.de bleiben kompatibel).

**Ergänzung 22.10.2026 (Michael):**
- Admin-Seite verwaltet **Streamer, Charaktere und die Zuordnung** getrennt. Vorschlag Datenmodell: neue Tabelle `wp_lotro_streamers` (Twitch-Name, Anzeigename, Token-Felder), Charaktere in `wp_lotro_characters` (manuell anlegbar mit Volk/Klasse, Stats starten bei 0), `wp_lotro_streamer_mapping` als 1:1-Verknüpfung. Bestehende Mappings werden migriert. `GET /streamers` liefert unverändert dasselbe Format (herrin-inge.de bleibt kompatibel).
- **Client-Release vormerken:** Client 3.1 wird als **GitHub-Pre-Release** veröffentlicht. `/releases/latest` (Watcher und WP-Plugin) ignoriert Pre-Releases → kein Update-Dialog, kein Auto-Update bei den Streamern. WP-Plugin 3.1 installiert Michael per ZIP-Upload, sobald er will (kompatibel mit Client 3.0).
- **Season-Start:** 1. Pre-Release → `latest` (Clients aktualisieren sich beim nächsten Watcher-Check bzw. LOTRO-Start), 2. Streamer anlegen (7-Tage-Fenster beginnt).
- Admin-Schalter **„Alte Clients (ohne Token) zulassen"** (Standard: an) statt eines späteren WP-3.2-Releases.

---

## Abschluss (22.10.2026)

**Erledigt:**

| Punkt | Ergebnis |
|---|---|
| 1. Ist-Analyse | ✅ Tabelle oben (alle Routen, Aufrufer, Risiko) |
| 2. Lösungsvorschlag | ✅ mit Michael abgestimmt (Entscheidungen siehe „Überarbeiteter Plan") |
| 3. Rückwärtskompatibilität / Rollout | ✅ Alte Clients laufen weiter (Schalter „Alte Clients zulassen"), Client 3.1 nur als Pre-Release, altes StreamElements-Overlay funktioniert weiter |
| 4. Umsetzung + Test | ✅ v3.1 umgesetzt, lokal in Docker getestet |

**Umgesetzt in v3.1:**
- Nur gemappte Charaktere dürfen senden (403 sonst)
- Streamer-Token automatisch beim ersten Senden (7-Tage-Fenster, nur SHA-256 gespeichert, Reset pro Streamer)
- Rate-Limit pro IP (Cloudflare-aware), Feldlimits, `/death/silent` max. 20
- `/test/*` nur im Testmodus, `GET /queue` entfernt
- WP-Admin-Seite „LOTRO Tracker": Streamer, Charaktere, Zuordnung, Token-Reset, Einstellungen
- Overlay-Sendeplan: eine gemeinsame URL `https://www.dodaswelt.de/wp-json/lotro-deaths/v1/overlay`, alle Streamer sehen den Tod gleichzeitig; `/death/next` ist No-op (kein Wegklicken mehr möglich)
- Client/Watcher speichern und senden `token.txt`; REINSTALL behält sie, UNINSTALL entfernt sie

**Tests:** 54 End-to-End-Prüfungen gegen Docker-WordPress (`bash WordPress/tests/run-tests.sh`), Migrationstest 3.0 → 3.1, Browser-Sync-Test (2 Overlays zeitgleich auf die Millisekunde), echter Client gegen Testserver, Code-Review (2 Funde behoben: XSS auf der Admin-Seite, Verhalten bei abgelaufenem Abholfenster) — zusätzlich gefunden und behoben: doppelte Todeszähler bei gleichzeitigen Toden.

**Commits / Release:** `46f193d`, `455c2d7` auf `main` (gepusht); Pre-Release https://github.com/DodasWelt/LOTRO-Death-Tracker/releases/tag/v3.1 — `latest` bleibt v3.0, Streamer bekommen kein Update.

**Offen bei Michael:**
1. `lotro-death-tracker.zip` vom Release in WordPress hochladen (Plugins → Installieren → Plugin hochladen → ersetzen)
2. Live-Test: Testmodus an, eigenen Test-Streamer + Test-Charakter anlegen (keinen echten Streamer!), Overlay mit `…/overlay?test=1` prüfen, Testmodus wieder aus
3. Zur Season 2: `gh release edit v3.1 --prerelease=false --latest`, danach Streamer anlegen (7-Tage-Fenster startet)
4. Sobald alle Streamer einen Token haben: „Alte Clients zulassen" ausschalten
