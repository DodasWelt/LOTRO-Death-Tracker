# WordPress Plugin — Implementierungsdetails

Ergänzt das Root-`CLAUDE.md`. Gilt für alle Arbeiten in `WordPress/`.

---

## API Endpoints (dodaswelt.de)

```
POST   /wp-json/lotro-deaths/v1/death             # Event senden (death ODER levelup)
GET    /wp-json/lotro-deaths/v1/death/current     # Ältester unverarbeiteter Death
POST   /wp-json/lotro-deaths/v1/death/next        # Aktuellen als gezeigt markieren, nächsten holen
POST   /wp-json/lotro-deaths/v1/death/silent      # Fehlende Tode still nachtragen (processed=1, kein Overlay)
GET    /wp-json/lotro-deaths/v1/queue             # Queue-Status
GET    /wp-json/lotro-deaths/v1/history           # History (?limit=N, ?character=Name)
GET    /wp-json/lotro-deaths/v1/characters        # Alle Characters mit Level + Todes-Statistiken
GET    /wp-json/lotro-deaths/v1/health            # System-Status
GET    /wp-json/lotro-deaths/v1/streamers         # Alle Streamer mit LOTRO-Stats (für herrin-inge.de)
POST   /wp-json/lotro-deaths/v1/streamers/mapping # Mapping hinzufügen/aktualisieren [Admin-Auth]
DELETE /wp-json/lotro-deaths/v1/streamers/mapping # Mapping löschen [Admin-Auth]
```

**Response-Format `POST /death` (kein `data`-Wrapper!):**
```json
{ "success": true, "message": "Death event queued", "queuePosition": 1, "deathCount": 5, "id": 42 }
```

**Response-Format GET `/death/current` und POST `/death/next` (mit `data`-Wrapper):**
```json
{ "success": true, "data": { "id": 1, "characterName": "...", "level": 10, "deathCount": 5, "date": "...", "time": "...", "datetime": "...", "region": "..." }, "queueLength": 2 }
```

**levelup-Events** werden nicht in die Queue eingetragen — nur `current_level` in `wp_lotro_characters` wird aktualisiert.

---

## Datenbankstruktur

- `wp_lotro_deaths` — Death-Queue: `id, character_name, level, event_type, death_count, death_date, death_time, death_datetime, region, race, character_class, timestamp, received_at, processed, shown_at`
- `wp_lotro_characters` — Charakter-Statistiken: `character_name, current_level, total_deaths, race, character_class, last_seen`
- `wp_lotro_streamer_mapping` — `twitch_username, character_name, display_name, race, character_class` (UNIQUE auf beiden Feldern)

DB-Migration: `maybe_upgrade()` via `plugins_loaded`-Hook, gesteuert über WP-Option `lotro_death_tracker_db_version` (aktuell `2.1`).

**Kritisch:** `dbDelta` fügt bei bestehenden Tabellen manchmal keine neuen Spalten hinzu → `create_tables()` enthält nach `dbDelta` expliziten `SHOW COLUMNS`-Check mit `ALTER TABLE` als Fallback. Bei jeder neuen Spalte diesen Block erweitern + `$db_version` erhöhen.

**Datenmigration (einmalig):** `INSERT INTO wp_lotro_characters … SELECT FROM wp_lotro_deaths` — geschützt durch separate Option `lotro_death_tracker_data_migration` (`'0'` → `'1'`), unabhängig von `$db_version`.

**Reihenfolge in `api_submit_event`:** Erst `INSERT` in `wp_lotro_deaths`, dann `upsert_character`. Nicht umkehren — sonst wird Todes-Counter erhöht auch wenn Queue-Eintrag fehlschlägt.

---

## Kritische Implementierungsdetails

1. **`POST /death/next` erwartet `id`** — Overlay sendet `{ id: deathId }`. Server markiert nur Eintrag mit passender ID. Ohne ID: Fallback auf ältesten unverarbeiteten (Rückwärtskompatibilität).

2. **CORS nur auf eigene Routen** — `add_cors_headers()` prüft `$_SERVER['REQUEST_URI']` auf `/wp-json/lotro-deaths/`. Nicht auf alle WP-Seiten ausweiten.

3. **WP Plugin ZIP-Struktur** — `lotro-death-tracker.zip` muss Struktur `lotro-death-tracker/lotro-death-tracker.php` haben — nur dann funktioniert der WordPress-Update-Mechanismus.

4. **`POST /death` hat keinen `data`-Wrapper** — In `client.js` daher `response.data.queuePosition` (nicht `response.data.data.queuePosition`).

5. **`with_test_tables()` in WP-Plugin** — Tauscht `$this->table_deaths`/`$this->table_characters` temporär gegen `_test`-Varianten. PHP single-threaded → race-condition-frei. `api_test_clear()` nutzt `TRUNCATE` (setzt Auto-Increment zurück).

---

## WordPress Plugin Auto-Update

Ab v2.0 über normalen WordPress-Update-Mechanismus:
- `pre_set_site_transient_update_plugins`-Filter → `check_for_update()`: fragt GitHub API ab, cached 12h via WP-Transient (`lotro_death_tracker_update_info`)
- `plugins_api`-Filter → `plugin_info()`: liefert Details für WP-Update-Popup
- Sucht nach Release-Asset `lotro-death-tracker*.zip`

---

## Test-Umgebung (ab v2.2)

End-to-End-Tests ohne Produktionsdaten. Testdaten in separaten DB-Tabellen (`wp_lotro_deaths_test`, `wp_lotro_characters_test`).

### Test-Endpunkte

```
POST   /wp-json/lotro-deaths/v1/test/death
GET    /wp-json/lotro-deaths/v1/test/death/current
POST   /wp-json/lotro-deaths/v1/test/death/next
GET    /wp-json/lotro-deaths/v1/test/queue
GET    /wp-json/lotro-deaths/v1/test/health
DELETE /wp-json/lotro-deaths/v1/test/clear   [Admin-Auth]
```

### Client im Test-Modus

```bash
SERVER_URL=https://www.dodaswelt.de/wp-json/lotro-deaths/v1/test/death node client.js
```

### Testtabellen leeren (PowerShell)

```powershell
Invoke-RestMethod -Uri "https://www.dodaswelt.de/wp-json/lotro-deaths/v1/test/clear" `
  -Method DELETE `
  -Headers @{ Authorization = "Basic " + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("user:apppassword")) }
```

### Implementierungsdetails

- `with_test_tables(callable $fn)`: tauscht Tabellen-Properties für Dauer des Callbacks
- Testtabellen in `create_tables()` angelegt (gleiche Schema via `str_replace` auf SQL-Strings)
- `SHOW COLUMNS`-Fallback läuft für beide Tabellen-Gruppen
- `api_test_clear()` nutzt `TRUNCATE` (nicht DELETE) → schneller, setzt Auto-Increment zurück
