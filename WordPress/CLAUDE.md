# WordPress Plugin — Implementierungsdetails

Ergänzt das Root-`CLAUDE.md`. Gilt für alle Arbeiten in `WordPress/`.

---

## API Endpoints (dodaswelt.de)

```
POST   /wp-json/lotro-deaths/v1/death             # Event senden (death ODER levelup)          [Streamer-Token]
GET    /wp-json/lotro-deaths/v1/death/current     # Laufender + kommende Sendeplätze, serverTime
POST   /wp-json/lotro-deaths/v1/death/next        # VERALTET ab 3.1 – No-op (altes SE-Overlay)
POST   /wp-json/lotro-deaths/v1/death/silent      # Fehlende Tode still nachtragen (max. 20)    [Streamer-Token]
GET    /wp-json/lotro-deaths/v1/history           # History (?limit=N, ?character=Name)
GET    /wp-json/lotro-deaths/v1/characters        # Alle Characters mit Level + Todes-Statistiken
GET    /wp-json/lotro-deaths/v1/health            # System-Status
GET    /wp-json/lotro-deaths/v1/overlay           # Stream-Overlay (HTML) – eine URL für alle Streamer
GET    /wp-json/lotro-deaths/v1/streamers         # Alle Streamer mit LOTRO-Stats (für herrin-inge.de)
POST   /wp-json/lotro-deaths/v1/streamers/mapping # Streamer+Charakter+Zuordnung anlegen        [Admin-Auth]
DELETE /wp-json/lotro-deaths/v1/streamers/mapping # Zuordnung löschen (Streamer bleibt)         [Admin-Auth]
```

`GET /queue` wurde in 3.1 entfernt (kein Aufrufer).

**Response-Format `POST /death` (kein `data`-Wrapper!):**
```json
{ "success": true, "message": "Death event queued", "queuePosition": 1, "deathCount": 5, "id": 42, "showAt": 1792658716464, "authToken": "…nur beim Abholen…" }
```

**Response-Format GET `/death/current`:**
```json
{ "success": true, "data": { "id": 1, "characterName": "...", "level": 10, "deathCount": 5, "showAt": 1792658716464, ... },
  "upcoming": [ …bis zu 5 Sendeplätze… ], "queueLength": 2, "serverTime": 1792658712502, "slotMs": 13000, "displayMs": 10000 }
```

**levelup-Events** werden nicht eingeplant — nur `current_level` in `wp_lotro_characters` wird aktualisiert.

---

## Absicherung (ab 3.1)

**Streamer-Token (Trust on First Use)** — `check_client_permission()` ist `permission_callback` von `/death`, `/death/silent` und den `/test/`-Gegenstücken:

| Fall | Ergebnis |
|---|---|
| Charakter nicht in `wp_lotro_streamer_mapping` | 403 `character_not_registered` |
| Streamer hat Token, `X-LOTRO-Token` passt (`hash_equals` auf SHA-256) | erlaubt, `token_last_used` aktualisiert |
| Streamer hat Token, Header fehlt/falsch | 401 `invalid_token` |
| Kein Token, `X-LOTRO-Client` gesetzt (Client ≥ 3.1), `claim_until` nicht abgelaufen | erlaubt + Handler vergibt Token (`authToken` in Antwort, einmalig) |
| Kein Token, Client ≥ 3.1, Fenster abgelaufen | ohne Token erlaubt solange „Alte Clients zulassen" an, sonst 401 `claim_expired` |
| Kein Token, alter Client (kein `X-LOTRO-Client`) | erlaubt solange Option „Alte Clients zulassen" an, sonst 401 `client_outdated` |

- Token = `bin2hex(random_bytes(32))`, gespeichert nur als SHA-256 in `wp_lotro_streamers.token_hash`.
- Abholung atomar: `UPDATE … WHERE token_hash IS NULL AND claim_until >= now` → bei parallelen Erstanfragen (Client + Watcher) gibt es genau einen Token.
- Abholfenster `CLAIM_DAYS = 7` ab Anlegen oder „Token zurücksetzen". Alte Clients bekommen **nie** einen Token (sie würden ihn wegwerfen und sich aussperren).
- Token gehört zum **Streamer**, nicht zum Charakter. Ein Charakter pro Streamer (`UNIQUE twitch_username` im Mapping).

**Weitere Limits:** Rate-Limit per Transient pro IP (`/death` 30/min, `/death/silent` 5/min → 429). IP = `CF-Connecting-IP` **nur** wenn `REMOTE_ADDR` in einer Cloudflare-Range liegt (`$cloudflare_ranges`, Quelle cloudflare.com/ips – bei Änderungen dort aktualisieren). `eventType` nur `death|levelup`, `level` 0–200, Textfelder per `clip()` gekürzt (Name 64, Region 100, Volk/Klasse 50, Datum 50). `/death/silent` `count` auf `SILENT_MAX_COUNT = 20` gedeckelt (Watcher holt den Rest beim nächsten Start nach). CORS `Allow-Headers` enthält `X-LOTRO-Token, X-LOTRO-Client`.

## Overlay-Sendeplan (ab 3.1)

Statt „Overlay quittiert per `/death/next`" vergibt der Server beim Eintreffen eines Todes einen Sendeplatz: `show_at_ms = max(jetzt + LEAD_MS, letzter Sendeplatz + SLOT_MS)` (4 s Vorlauf, 13 s pro Platz, 10 s sichtbar). Serialisiert über `GET_LOCK('lotro_dt_slot_<tabelle>')`. Kein Rückstau-Limit (Michael: Gruppen-Tode laufen nacheinander).

- `finalize_shown()` (in `/death/current`, `/history`, `/health`, `/death`) setzt `processed=1, shown_at=FROM_UNIXTIME(show_at_ms/1000)` für vorbeigelaufene Plätze → History und herrin-inge.de unverändert.
- Verpasste Plätze werden nicht nachgeholt (laut Event-Regel läuft OBS beim Sterbenden immer).
- `/overlay` liefert `overlay.html` aus dem Plugin-Ordner (Quelle im Repo: `Overlay/lotro-death-overlay.html`, beim Release kopieren!).

## Admin-Seite (ab 3.1)

WP-Admin → Menü **LOTRO Tracker** (`render_admin_page()`, Formulare → `admin-post.php?action=lotro_dt`, Nonce `lotro_dt_admin`, `manage_options`):
Streamer anlegen/löschen, Charaktere anlegen/löschen (nur ungemappt), Zuordnung setzen/lösen, **Token zurücksetzen** pro Streamer, Einstellungen „Alte Clients zulassen" (`lotro_death_tracker_allow_legacy`, Standard an) und „Testmodus" (`lotro_death_tracker_test_mode`, Standard aus). Meldungen per Transient `lotro_dt_notice_<user>`.
**XSS-Falle:** Bestätigungstexte nur über `data-confirm` + `confirm(this.dataset.confirm)` — nie Namen in Inline-JS einbauen (`esc_attr()` kodiert vorhandene Entities wie `&quot;` nicht doppelt → Ausbruch aus dem JS-String; Altdaten aus der Zeit vor 3.1 können beliebige Namen enthalten).

---

## Datenbankstruktur

- `wp_lotro_deaths` — Death-Queue: `id, character_name, level, event_type, death_count, death_date, death_time, death_datetime, region, race, character_class, timestamp, received_at, processed, shown_at`
- `wp_lotro_characters` — Charakter-Statistiken: `character_name, current_level, total_deaths, race, character_class, last_seen`
- `wp_lotro_streamer_mapping` — `twitch_username, character_name, display_name, race, character_class` (UNIQUE auf beiden Feldern) — ab 3.1 die 1:1-Zuordnung; `display_name/race/class` dort sind Altbestand (Fallback in `/streamers`)
- `wp_lotro_streamers` (ab 3.1) — `twitch_username (UNIQUE), display_name, token_hash, token_claimed_at, claim_until, token_last_used, created_at`
- `wp_lotro_deaths.show_at_ms` (ab 3.1) — Sendeplatz in ms (NULL bei `/death/silent` und Alt-Einträgen)

DB-Migration: `maybe_upgrade()` via `plugins_loaded`-Hook, gesteuert über WP-Option `lotro_death_tracker_db_version` (aktuell `2.2`).

**Migration 3.1 (einmalig, Option `lotro_death_tracker_streamer_migration`):** Streamer aus Mapping übernehmen (Abholfenster 7 Tage ab Update), gemappte Charaktere in `wp_lotro_characters` anlegen, unverarbeitete Alt-Einträge der Quittier-Queue als gezeigt markieren.

**Kritisch:** `dbDelta` fügt bei bestehenden Tabellen manchmal keine neuen Spalten hinzu → `create_tables()` enthält nach `dbDelta` expliziten `SHOW COLUMNS`-Check mit `ALTER TABLE` als Fallback. Bei jeder neuen Spalte diesen Block erweitern + `$db_version` erhöhen.

**Datenmigration (einmalig):** `INSERT INTO wp_lotro_characters … SELECT FROM wp_lotro_deaths` — geschützt durch separate Option `lotro_death_tracker_data_migration` (`'0'` → `'1'`), unabhängig von `$db_version`.

**Reihenfolge in `api_submit_event`:** Erst `INSERT` in `wp_lotro_deaths`, dann `upsert_character`. Nicht umkehren — sonst wird Todes-Counter erhöht auch wenn Queue-Eintrag fehlschlägt.

---

## Kritische Implementierungsdetails

1. **`POST /death/next` ist ab 3.1 ein No-op** — bleibt nur, damit das alte StreamElements-Overlay nicht fehlschlägt. Nicht wieder mit Logik füllen (jeder mit der URL könnte sonst Tode wegklicken).

2. **CORS nur auf eigene Routen** — `add_cors_headers()` prüft `$_SERVER['REQUEST_URI']` auf `/wp-json/lotro-deaths/`. Nicht auf alle WP-Seiten ausweiten.

3. **WP Plugin ZIP-Struktur** — `lotro-death-tracker.zip` muss Struktur `lotro-death-tracker/lotro-death-tracker.php` haben — nur dann funktioniert der WordPress-Update-Mechanismus. Ab 3.1 zusätzlich `lotro-death-tracker/overlay.html` (Kopie von `Overlay/lotro-death-overlay.html`), sonst liefert `/overlay` 404.

4. **`POST /death` hat keinen `data`-Wrapper** — In `client.js` daher `response.data.queuePosition` (nicht `response.data.data.queuePosition`).

5. **`with_test_tables()` in WP-Plugin** — Tauscht `$this->table_deaths`/`$this->table_characters` temporär gegen `_test`-Varianten. PHP single-threaded → race-condition-frei. `api_test_clear()` nutzt `TRUNCATE` (setzt Auto-Increment zurück).

---

## WordPress Plugin Auto-Update

Ab v2.0 über normalen WordPress-Update-Mechanismus:
- `pre_set_site_transient_update_plugins`-Filter → `check_for_update()`: fragt GitHub API ab, cached 12h via WP-Transient (`lotro_death_tracker_update_info`)
- `plugins_api`-Filter → `plugin_info()`: liefert Details für WP-Update-Popup
- Sucht nach Release-Asset `lotro-death-tracker*.zip`

---

## Test-Umgebung

### Live (dodaswelt.de, Test-Tabellen)

`/test/*` ist nur aktiv, wenn im WP-Admin **Testmodus** an ist (sonst 404). Schreibt in `wp_lotro_deaths_test` / `wp_lotro_characters_test`, nutzt aber die **echten** Streamer/Mappings/Tokens → für Tests einen eigenen Test-Streamer + Test-Charakter anlegen (sonst holt der Test den echten Token ab).

```
POST   /wp-json/lotro-deaths/v1/test/death          [Streamer-Token]
POST   /wp-json/lotro-deaths/v1/test/death/silent   [Streamer-Token]
GET    /wp-json/lotro-deaths/v1/test/death/current
POST   /wp-json/lotro-deaths/v1/test/death/next     (No-op)
GET    /wp-json/lotro-deaths/v1/test/health
DELETE /wp-json/lotro-deaths/v1/test/clear          [Admin-Auth, auch ohne Testmodus]
```

Client im Test-Modus: `SERVER_URL=https://www.dodaswelt.de/wp-json/lotro-deaths/v1/test/death node client.js`
Test-Overlay: `https://www.dodaswelt.de/wp-json/lotro-deaths/v1/overlay?test=1` (TEST-Badge, ohne Sound; `&sound=1` mit Sound)

Testtabellen leeren (PowerShell):
```powershell
Invoke-RestMethod -Uri "https://www.dodaswelt.de/wp-json/lotro-deaths/v1/test/clear" `
  -Method DELETE `
  -Headers @{ Authorization = "Basic " + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("user:apppassword")) }
```

### Lokal (Docker, ab 3.1)

```bash
bash WordPress/tests/run-tests.sh                                  # Umgebung starten + alle Tests
docker compose -f WordPress/tests/docker-compose.yml down -v       # Umgebung komplett entfernen
```

- WordPress + MySQL + WP-CLI per `WordPress/tests/docker-compose.yml` (Port 8089, Login admin/admin). Voraussetzung: Docker Desktop mit WSL-Integration für die Distro.
- `run-tests.sh` kopiert PHP + `overlay.html` nach `WordPress/tests/.plugin/` (gitignored, = Struktur des Release-ZIPs), leert die Plugin-Tabellen der lokalen DB, startet `wordpress` neu und führt `ip_test.php` (Cloudflare-IP-Erkennung) und `e2e.py` (54 Prüfungen: Admin-Formulare, Token-Vergabe/Reset/Fenster, Ablehnungen, Sendeplan, parallele Tode, Testmodus, CORS, Rate-Limit, XSS-Regression; leert am Ende den Sendeplan) aus.
- **Nach jedem Tausch der PHP-Datei den `wordpress`-Container neu starten** – OPcache hält sonst die alte Version im Speicher (führte beim Migrationstest zu falschen Ergebnissen). `run-tests.sh` macht das automatisch.
- Migrationstest von einer Vorversion (manuell): alte PHP per `git show <tag>:WordPress/lotro-death-tracker.php` nach `.plugin/` legen, Container neu starten, aktivieren, Altdaten per SQL anlegen, neue PHP zurückkopieren, Container neu starten, eine Anfrage senden.

### Implementierungsdetails

- `with_test_tables(callable $fn)`: tauscht `$this->table_deaths`/`$this->table_characters` temporär gegen `_test`-Varianten (Streamer/Mapping bleiben die echten)
- Testtabellen in `create_tables()` angelegt (gleiche Schema via `str_replace` auf SQL-Strings)
- `SHOW COLUMNS`-Fallback läuft für beide Tabellen-Gruppen
- `api_test_clear()` nutzt `TRUNCATE` (nicht DELETE) → schneller, setzt Auto-Increment zurück
