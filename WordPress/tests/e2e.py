"""End-to-End-Test des WP-Plugins gegen das lokale Docker-WordPress.
Aufruf über run-tests.sh (setzt WordPress auf und leert die Plugin-Tabellen vorher).
"""
import json, os, re, sys, time, subprocess, threading
import urllib.request, urllib.parse, http.cookiejar

BASE = 'http://localhost:8089'
API  = BASE + '/wp-json/lotro-deaths/v1'
COMPOSE_DIR = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
fails = 0

def check(name, cond, info=''):
    global fails
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else '  -> ' + str(info)))
    if not cond: fails += 1

def sql(q):
    return subprocess.run(['docker', 'compose', 'exec', '-T', 'db', 'mysql', '-uwp', '-pwp', 'wp', '-N', '-e', q],
                          cwd=COMPOSE_DIR, capture_output=True, text=True).stdout.strip()

def req(method, url, body=None, headers=None, opener=None):
    data = json.dumps(body).encode() if body is not None else None
    h = {'Content-Type': 'application/json'} if body is not None else {}
    h.update(headers or {})
    r = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        resp = (opener or urllib.request.build_opener()).open(r)
        code, raw, hdrs = resp.status, resp.read(), resp.headers
    except urllib.error.HTTPError as e:
        code, raw, hdrs = e.code, e.read(), e.headers
    try:
        js = json.loads(raw)
    except Exception:
        js = None
    return code, js, raw, hdrs

def reset_rate_limit():
    sql("DELETE FROM wp_options WHERE option_name LIKE '%lotro_rl_%'")

def death(name, client=None, token=None, extra=None, path='/death', limit_reset=True):
    if limit_reset: reset_rate_limit()
    h = {}
    if client: h['X-LOTRO-Client'] = client
    if token:  h['X-LOTRO-Token'] = token
    b = {'characterName': name, 'eventType': 'death', 'level': 42, 'race': 'Hobbit', 'characterClass': 'Jäger'}
    b.update(extra or {})
    return req('POST', API + path, b, h)

# ── Admin login + forms ──
cj = http.cookiejar.CookieJar()
admin = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
admin.open(urllib.request.Request(BASE + '/wp-login.php'))
admin.open(urllib.request.Request(BASE + '/wp-login.php', data=urllib.parse.urlencode(
    {'log': 'admin', 'pwd': 'admin', 'wp-submit': 'Log In', 'testcookie': '1'}).encode()))

def admin_page():
    return admin.open(BASE + '/wp-admin/admin.php?page=lotro-death-tracker').read().decode()

def admin_do(do, **fields):
    page = admin_page()
    nonce = re.search(r'name="_wpnonce" value="([^"]+)"', page).group(1)
    data = {'action': 'lotro_dt', 'do': do, '_wpnonce': nonce, '_wp_http_referer': '/wp-admin/admin.php?page=lotro-death-tracker'}
    data.update(fields)
    # admin-post leitet auf die Admin-Seite um; die Meldung wird nur einmal angezeigt
    return admin.open(urllib.request.Request(BASE + '/wp-admin/admin-post.php', data=urllib.parse.urlencode(data).encode())).read().decode()

sql("INSERT INTO wp_lotro_characters (character_name) VALUES ('x&quot;);alert(1);//')")
page = admin_page()
check('Admin-Seite: kein Inline-JS mit Namen (XSS)', 'alert(1)' not in ''.join(re.findall(r'onsubmit="[^"]*"', page))
      and 'data-confirm="Charakter x&quot;);alert(1);//' in page, re.findall(r'onsubmit="[^"]*alert[^"]*"', page))
check('Admin-Seite lädt', 'LOTRO Death Tracker' in page and 'Streamer anlegen' in page, page[:200])
page = admin_do('add_streamer', twitch_username='TestStreamer', display_name='Test Streamer')
check('Streamer angelegt', 'TestStreamer' in page and 'offen bis' in page)
page = admin_do('add_streamer', twitch_username='TestStreamer')
check('Doppelter Streamer abgelehnt', 'existiert bereits' in page)
admin_do('add_streamer', twitch_username='Zweiter')
page = admin_do('add_character', character_name='Testchar', race='Hobbit', character_class='Jäger')
check('Charakter angelegt', 'Testchar' in page)
admin_do('add_character', character_name='Zweitchar')
sid = sql("SELECT id FROM wp_lotro_streamers WHERE twitch_username='TestStreamer'")
sid2 = sql("SELECT id FROM wp_lotro_streamers WHERE twitch_username='Zweiter'")
page = admin_do('assign', streamer_id=sid, character_name='Testchar')
check('Zuordnung gesetzt', 'jetzt' in page and sql("SELECT character_name FROM wp_lotro_streamer_mapping WHERE twitch_username='TestStreamer'") == 'Testchar')
page = admin_do('assign', streamer_id=sid2, character_name='Testchar')
check('Fremd-Charakter nicht zuordenbar', 'bereits' in page)
admin_do('assign', streamer_id=sid2, character_name='Zweitchar')
page = admin_do('delete_character', character_name='Testchar')
check('Zugeordneter Charakter nicht löschbar', 'erst Zuordnung lösen' in page)

code, js, _, _ = req('GET', API + '/streamers')
names = {s['characterName']: s for s in js['streamers']}
check('/streamers liefert Mapping + Anzeigename', 'Testchar' in names and names['Testchar']['displayName'] == 'Test Streamer'
      and names['Testchar']['race'] == 'Hobbit', js)

# ── Einreichen: Ablehnungen / Legacy / Token ──
code, js, _, _ = death('Fremder', client='3.1')
check('Nicht angemeldeter Charakter → 403', code == 403 and js['code'] == 'character_not_registered', (code, js))
code, js, _, _ = death('Testchar')
check('Alter Client ohne Token (Übergang) → 200, kein Token', code == 200 and 'authToken' not in js, (code, js))
code, js, _, _ = death('Testchar', client='3.1')
token = js.get('authToken') if js else None
check('Client 3.1 holt Token ab', code == 200 and token and len(token) == 64, (code, js))
check('Token nur als Hash gespeichert', sql("SELECT token_hash FROM wp_lotro_streamers WHERE id=%s" % sid) not in ('', 'NULL', token))
code, js, _, _ = death('Testchar', client='3.1')
check('Ohne Token nach Abholung → 401', code == 401 and js['code'] == 'invalid_token', (code, js))
code, js, _, _ = death('Testchar')
check('Alter Client nach Abholung → 401', code == 401, (code, js))
code, js, _, _ = death('Testchar', client='3.1', token='x' * 64)
check('Falscher Token → 401', code == 401, (code, js))
code, js, _, _ = death('Testchar', client='3.1', token=token)
check('Richtiger Token → 200, kein neuer Token', code == 200 and 'authToken' not in js, (code, js))
code, js, _, _ = death('testchar', client='3.1', token=token)
check('Charaktername case-insensitiv', code == 200, (code, js))
code, js, _, _ = death('Testchar', client='3.1', token=token, extra={'eventType': 'hack'})
check('Ungültiger eventType → 400', code == 400, (code, js))
code, js, _, _ = death('Testchar', client='3.1', token=token, extra={'level': 999})
check('Level außerhalb 0–200 → 400', code == 400, (code, js))
code, js, _, _ = death('Testchar', client='3.1', token=token, extra={'eventType': 'levelup', 'level': 43})
check('Level-up mit Token → 200', code == 200 and js['message'] == 'Level updated', (code, js))
code, js, _, _ = death('Testchar', client='3.1', token=token, extra={'region': 'R' * 500})
check('Überlange Region wird gekürzt', code == 200 and sql("SELECT MAX(CHAR_LENGTH(region)) FROM wp_lotro_deaths") == '100', (code, js))
reset_rate_limit()
code, js, _, _ = req('POST', API + '/death/silent', {'characterName': 'Testchar', 'count': 100000, 'level': 42},
                     {'X-LOTRO-Client': '3.1', 'X-LOTRO-Token': token})
check('/death/silent auf 20 begrenzt', code == 200 and js['inserted'] == 20, (code, js))
reset_rate_limit()
code, js, _, _ = req('POST', API + '/death/silent', {'characterName': 'Testchar', 'count': 1}, {'X-LOTRO-Client': '3.1'})
check('/death/silent ohne Token → 401', code == 401, (code, js))

# ── Sendeplan ──
code, js, _, hdrs = req('GET', API + '/death/current')
ups = js.get('upcoming') or []
gaps = [b['showAt'] - a['showAt'] for a, b in zip(ups, ups[1:])]
check('/death/current liefert Sendeplätze im 13-s-Abstand', js['success'] and len(ups) >= 3 and all(g == 13000 for g in gaps), js)
check('/death/current: serverTime + no-store', abs(js['serverTime'] - time.time() * 1000) < 5000 and 'no-store' in (hdrs.get('Cache-Control') or ''), hdrs.get('Cache-Control'))
check('Erster Sendeplatz mit Vorlauf in der Zukunft', ups[0]['showAt'] > js['serverTime'] - 13000, ups[0])
code, js, _, _ = req('POST', API + '/death/next', {'id': ups[0]['id']})
check('/death/next ist No-op', code == 200 and js['data'] is None
      and sql("SELECT processed FROM wp_lotro_deaths WHERE id=%d" % ups[0]['id']) == '0', js)
sql("UPDATE wp_lotro_deaths SET show_at_ms = show_at_ms - 600000")
code, js, _, _ = req('GET', API + '/history?limit=100')
check('Abgelaufene Sendeplätze landen in der History', js['total'] >= 25 and sql("SELECT COUNT(*) FROM wp_lotro_deaths WHERE processed=0") == '0', js.get('total'))
code, js, _, _ = req('GET', API + '/death/current')
check('Leerer Sendeplan → success false', js['success'] is False and js['data'] is None, js)
code, js, _, _ = req('GET', API + '/characters')
c = [x for x in js['characters'] if x['characterName'] == 'Testchar'][0]
check('Todeszähler korrekt (1+1+1+1+1+20)', c['totalDeaths'] == 25 and c['currentLevel'] == 42, c)

# ── Entfernte / Test-Routen ──
check('/queue entfernt', req('GET', API + '/queue')[0] == 404)
check('/test/health aus → 404', req('GET', API + '/test/health')[0] == 404)
check('/test/death aus → 404', death('Testchar', client='3.1', token=token, path='/test/death')[0] == 404)
admin_do('save_settings', test_mode='1', allow_legacy='1')
check('/test/health an → 200', req('GET', API + '/test/health')[0] == 200)
code, js, _, _ = death('Testchar', client='3.1', token=token, path='/test/death')
check('/test/death schreibt in Test-Tabelle', code == 200 and sql("SELECT COUNT(*) FROM wp_lotro_deaths_test") == '1', (code, js))
check('/test/death ohne Token → 401', death('Testchar', client='3.1', path='/test/death')[0] == 401)
code, js, _, _ = req('GET', API + '/test/death/current')
check('/test/death/current liefert Testtod', js['success'] and js['data']['characterName'] == 'Testchar', js)
check('/test/clear ohne Login → 401', req('DELETE', API + '/test/clear')[0] == 401)

# ── Token-Reset, Gleichzeitigkeit, Fenster, Legacy-Schalter ──
admin_do('reset_token', streamer_id=sid)
results = []
def worker():
    results.append(death('Testchar', client='3.1', token=token))
ts = [threading.Thread(target=worker) for _ in range(4)]
[t.start() for t in ts]; [t.join() for t in ts]
issued = [r[1].get('authToken') for r in results if r[0] == 200 and r[1].get('authToken')]
check('Nach Reset: genau ein neuer Token bei 4 parallelen Anfragen', len(issued) == 1 and issued[0] != token,
      [(r[0], r[1]) for r in results])
token2 = issued[0] if issued else None
check('Alter Token nach Reset ungültig', death('Testchar', client='3.1', token=token)[0] == 401)
check('Neuer Token gültig', death('Testchar', client='3.1', token=token2)[0] == 200)
par = []
ts = [threading.Thread(target=lambda: par.append(death('Testchar', client='3.1', token=token2, limit_reset=False))) for _ in range(5)]
reset_rate_limit(); [t.start() for t in ts]; [t.join() for t in ts]
counts = sorted(r[1]['deathCount'] for r in par if r[0] == 200)
check('Parallele Tode: eindeutige Todeszähler', len(counts) == 5 and len(set(counts)) == 5, [(r[0], r[1]) for r in par])

sql("UPDATE wp_lotro_streamers SET claim_until = '2000-01-01 00:00:00' WHERE id=%s" % sid2)
code, js, _, _ = death('Zweitchar', client='3.1')
check('Abgelaufenes Fenster, Legacy an → 200 ohne Token', code == 200 and 'authToken' not in js, (code, js))
check('Alter Client bei Legacy an → 200', death('Zweitchar')[0] == 200)
admin_do('save_settings', test_mode='1')
code, js, _, _ = death('Zweitchar', client='3.1')
check('Abgelaufenes Fenster, Legacy aus → 401 claim_expired', code == 401 and js['code'] == 'claim_expired', (code, js))
code, js, _, _ = death('Zweitchar')
check('Alter Client bei Legacy aus → 401 client_outdated', code == 401 and js['code'] == 'client_outdated', (code, js))
page = admin_do('reset_token', streamer_id=sid2)
check('Admin zeigt Fenster wieder offen', page.count('offen bis') >= 1)
code, js, _, _ = death('Zweitchar', client='3.1')
check('Nach Reset holt Zweiter Token ab', code == 200 and js.get('authToken'), (code, js))
admin_do('save_settings', allow_legacy='1')

# ── Overlay + CORS ──
code, _, raw, hdrs = req('GET', API + '/overlay')
check('/overlay liefert HTML', code == 200 and 'text/html' in hdrs.get('Content-Type', '') and b'LOTRO Death Overlay' in raw, (code, hdrs.get('Content-Type')))
code, _, _, hdrs = req('OPTIONS', API + '/death', headers={'Origin': 'https://example.com',
    'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-lotro-token'})
allow = (hdrs.get('Access-Control-Allow-Headers') or '')
check('CORS-Preflight erlaubt X-LOTRO-Token', code == 200 and 'X-LOTRO-Token' in allow, (code, allow))

# ── Admin: Zuordnung lösen, Streamer löschen ──
admin_do('unassign', streamer_id=sid2)
check('Nach Lösen der Zuordnung → 403', death('Zweitchar', client='3.1')[0] == 403)
admin_do('delete_streamer', streamer_id=sid2)
check('Streamer gelöscht', sql("SELECT COUNT(*) FROM wp_lotro_streamers WHERE twitch_username='Zweiter'") == '0')

# ── Rate-Limit (zuletzt, blockiert die IP für 60 s) ──
reset_rate_limit()
codes = [death('Testchar', client='3.1', token=token2, extra={'eventType': 'levelup'}, limit_reset=False)[0] for _ in range(35)]
check('Rate-Limit greift (429)', 429 in codes and codes.count(200) <= 30, codes)

# Sendeplan leeren, damit ein offenes Overlay nicht minutenlang Testtode abspielt
sql("UPDATE wp_lotro_deaths SET processed = 1, shown_at = NOW() WHERE processed = 0")
sql("UPDATE wp_lotro_deaths_test SET processed = 1, shown_at = NOW() WHERE processed = 0")

print('\n%s' % ('ALLE TESTS BESTANDEN' if fails == 0 else '%d TEST(S) FEHLGESCHLAGEN' % fails))
sys.exit(1 if fails else 0)
