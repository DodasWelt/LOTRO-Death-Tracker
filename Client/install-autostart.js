// LOTRO Event Tracker - Simple Startup Autostart
// Version: 3.1.0 - Nutzt Windows Startup-Ordner (funktioniert immer!)

const path = require('path');
const fs = require('fs');
const os = require('os');

const IS_LINUX = process.platform === 'linux';

const STARTUP_FOLDER = IS_LINUX ? '' : path.join(
    os.homedir(),
    'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'
);

const WATCHER_VBS = path.join(__dirname, 'start-lotro-watcher.vbs');
const WATCHER_JS = path.join(__dirname, 'lotro-watcher.js');
const CLIENT_PATH = path.join(__dirname, 'client.js');
const SHORTCUT_PATH = IS_LINUX
    ? path.join(os.homedir(), '.config', 'autostart', 'lotro-death-tracker.desktop')
    : path.join(STARTUP_FOLDER, 'LOTRO-Death-Tracker.vbs');

// Erstelle Watcher-Script
function createWatcherScript() {
    const watcherContent = `// LOTRO Watcher - Startet Client nur wenn LOTRO läuft
const { exec, spawn, spawnSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CLIENT_PATH      = '${CLIENT_PATH.replace(/\\/g, '\\\\')}';
const LOG_PATH         = path.join(__dirname, 'watcher.log');
const GITHUB_REPO      = 'DodasWelt/LOTRO-Death-Tracker';
const VERSION_FILE     = path.join(__dirname, 'version.json');
const UPDATER_PATH     = path.join(__dirname, 'updater.js');
const PID_FILE         = path.join(__dirname, 'watcher.pid');
const LOCAL_DEATHS_FILE = path.join(__dirname, 'deaths.local.json');
const WP_API           = 'https://www.dodaswelt.de/wp-json/lotro-deaths/v1';

// ── Sys-Tray ───────────────────────────────────────────────────────────────
// Eigene Icon-Dateipfade (absoluter Pfad oder leer fuer eingebettete Minimal-Icons).
// Zum Anpassen: Pfad zu einer 32x32 PNG-Datei eintragen.
const CUSTOM_ICON_RED    = '';
const CUSTOM_ICON_YELLOW = '';
const CUSTOM_ICON_GREEN  = '';
// Eingebettete Minimal-Icons: 32x32 PNG, einfarbige Kreise auf transparentem Hintergrund.
const ICON_RED_B64    = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAArklEQVR4Ae1S2wnAIAzsQu6/Rxdq8aMQJDkvjxYLCgWb3Mvocez19wmcrV2fnaGbsV95KNZY4kpCSMHoPhwkaqjx3CE0kWzNFSJrpvHpABq5qjYNUWWEdGAIRKzq7QDrTqDqjhkdcwoMOYsxzXsjK87wd4C1J/D2O4Cnl03mMXkxUn+694oz+KnpCGBEWcyoTf+zBghHmyEgMrB6SC/Us4y0esggQurmEd7mPBO4ASzbexgj/DOTAAAAAElFTkSuQmCC';
const ICON_YELLOW_B64 = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAArUlEQVR4Ae1S2wnAIAx0/1E6Thdq8aMQJDkvjxYLCgWb3Mtoa3v9fQLn0a7PztDN2K88FGsscSUhpGB0Hw4SNdR47hCaSLbmCpE10/h0AI1cVZuGqDJCOjAEIlb1doB1J1B1x4yOOQWGnMWY5r2RFWf4O8DaE3j7HcDTyybzmLwYqT/de8UZ/NR0BDCiLGbUpv9ZA4SjzRAQGVg9pBfqWUZaPWQQIXXzCG9zngncC90gdxQY2r4AAAAASUVORK5CYII=';
const ICON_GREEN_B64  = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAArklEQVR4Ae1S2wqAMAjth3rus/vEYg+BDD07U4sFDoKl5za3bav19wns53F9doZmxn7poVhjiUsJIQW9e3cQr6HGmw6hiURrUyGiZhqfDqCRs2rDEFlGSAeGQMSsXgVYdwJZd8zomFNgyFGMad4aUXGGXwHWnsDb7wCeXjaZxzSLkfrD/aw4gx+a9gBGlMX02vQ/a4BwtBkCIgOrh/RcPctIq7sMPKRm7uEV55nADXqDR2+GbZoRAAAAAElFTkSuQmCC';
var SysTrayPkg = null;
try { SysTrayPkg = require('node-systray-v2'); } catch (_) {}
var SysTray = SysTrayPkg ? (SysTrayPkg.default || SysTrayPkg) : null;
const TRAY_AVAILABLE = !!SysTray;

let clientProcess = null;
let checkInterval = null;
var prevLotroRunning = false;
var remindOnNextStart = false;
var trayInstance   = null;
var lastTrayState  = 'none';

function formatLocalTime(d) {
    var pad = function(n, w) { return String(n).padStart(w || 2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + 'T' +
           pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '.' +
           pad(d.getMilliseconds(), 3);
}

function log(message) {
    const timestamp = formatLocalTime(new Date());
    const logMessage = \`[\${timestamp}] \${message}\\n\`;
    try {
        fs.appendFileSync(LOG_PATH, logMessage, 'utf8');
    } catch (e) {}
}

// ── Singleton-Lock ─────────────────────────────────────────────────────────
// Stellt sicher, dass nur eine Watcher-Instanz gleichzeitig laeuft.
// Mehrere Instanzen wuerden mehrere Clients starten → doppelte Death-Events.

function acquireLock() {
    if (fs.existsSync(PID_FILE)) {
        try {
            var existingPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
            if (existingPid && existingPid !== process.pid) {
                try {
                    process.kill(existingPid, 0); // Signal 0: prueft nur ob Prozess lebt
                    // Pruefen ob der Prozess tatsaechlich node ist (PID-Wiederverwendungs-Schutz).
                    var isNodeProc = false;
                    try {
                        if (process.platform === 'linux') {
                            var tc = spawnSync('ps', ['-p', String(existingPid), '-o', 'comm='], { encoding: 'utf8' });
                            if (tc.stdout && tc.stdout.toLowerCase().indexOf('node') !== -1) isNodeProc = true;
                        } else {
                            var tc = spawnSync('tasklist', ['/FI', 'PID eq ' + existingPid, '/FO', 'CSV', '/NH'], { windowsHide: true, encoding: 'utf8' });
                            if (tc.stdout && tc.stdout.toLowerCase().indexOf('node.exe') !== -1) isNodeProc = true;
                        }
                    } catch (tce) {}
                    if (isNodeProc) {
                        log('Watcher bereits aktiv (PID ' + existingPid + ') – beende diese Instanz.');
                        process.exit(0);
                    } else {
                        log('PID ' + existingPid + ' gehoert nicht zu node.exe (PID-Wiederverwendung?) – Lock wird ueberschrieben.');
                    }
                } catch (e) {
                    // ESRCH: Prozess existiert nicht mehr → Stale-Lock
                    log('Stale PID-Lock (PID ' + existingPid + ') – wird ueberschrieben.');
                }
            }
        } catch (e) {
            log('PID-Lock lesen fehlgeschlagen: ' + e.message + ' – fahre fort.');
        }
    }
    try {
        fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');
        log('PID-Lock erstellt: ' + process.pid);
    } catch (e) {
        log('PID-Lock schreiben fehlgeschlagen: ' + e.message);
    }
}

function releaseLock() {
    try {
        if (fs.existsSync(PID_FILE)) {
            var pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
            if (pid === process.pid) {
                fs.unlinkSync(PID_FILE);
            }
        }
    } catch (e) {}
}

// ── Auto-Update ────────────────────────────────────────────────────────────

function getCurrentVersion() {
    try { return JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8')).version || '0'; }
    catch (e) { return '0'; }
}

function compareVersions(a, b) {
    const pa = String(a).split('.').map(Number);
    const pb = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d !== 0) return d;
    }
    return 0;
}

function downloadRaw(rawUrl, destPath, cb) {
    function get(url, redirects) {
        if (redirects > 5) { cb(new Error('Zu viele Weiterleitungen')); return; }
        const tmpPath = destPath + '.tmp' + (redirects > 0 ? '.' + redirects : '');
        const file = fs.createWriteStream(tmpPath);
        const req = https.get(url, { headers: { 'User-Agent': 'LOTRO-Death-Tracker-Watcher' } }, function(res) {
            if (res.statusCode === 301 || res.statusCode === 302) {
                file.destroy();
                try { fs.unlinkSync(tmpPath); } catch (_) {}
                get(res.headers.location, redirects + 1);
                return;
            }
            if (res.statusCode !== 200) {
                file.destroy();
                try { fs.unlinkSync(tmpPath); } catch (_) {}
                cb(new Error('HTTP ' + res.statusCode));
                return;
            }
            res.pipe(file);
            file.on('finish', function() {
                file.close(function() {
                    try {
                        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
                        fs.renameSync(tmpPath, destPath);
                        cb(null);
                    } catch (e) {
                        try { fs.unlinkSync(tmpPath); } catch (_) {}
                        cb(e);
                    }
                });
            });
        });
        req.on('error', function(e) {
            file.destroy();
            try { fs.unlinkSync(tmpPath); } catch (_) {}
            cb(e);
        });
        req.setTimeout(30000, function() { req.destroy(); cb(new Error('Timeout')); });
    }
    get(rawUrl, 0);
}

// ── Lokales Tod-Tracking & stiller DB-Abgleich ───────────────────────────────
// Laedt beim Watcher-Start persistente Todes-Zaehler aus den Lua-PluginData-Dateien
// und gleicht diese mit der Datenbank ab. Fehlende Tode (z.B. Client nicht gestartet)
// werden still nachgetragen (processed=1, kein Overlay).

function getLotroPath() {
    var lotroDir = 'The Lord of the Rings Online';
    if (process.env.LOTRO_PATH) return process.env.LOTRO_PATH;
    if (process.platform === 'linux') {
        var steamNative = path.join(os.homedir(), '.steam', 'steam', 'steamapps', 'compatdata', '212500', 'pfx', 'drive_c', 'users', 'steamuser', 'My Documents', lotroDir);
        if (fs.existsSync(steamNative)) return steamNative;
        var steamFlatpak = path.join(os.homedir(), '.var', 'app', 'com.valvesoftware.Steam', 'data', 'Steam', 'steamapps', 'compatdata', '212500', 'pfx', 'drive_c', 'users', 'steamuser', 'My Documents', lotroDir);
        if (fs.existsSync(steamFlatpak)) return steamFlatpak;
        var vdfLocations = [
            path.join(os.homedir(), '.steam', 'steam', 'config', 'libraryfolders.vdf'),
            path.join(os.homedir(), '.var', 'app', 'com.valvesoftware.Steam', 'data', 'Steam', 'config', 'libraryfolders.vdf')
        ];
        for (var vi = 0; vi < vdfLocations.length; vi++) {
            if (!fs.existsSync(vdfLocations[vi])) continue;
            try {
                var vdfContent = fs.readFileSync(vdfLocations[vi], 'utf8');
                var vdfRe = /"path"\\s+"([^"]+)"/g;
                var vm;
                while ((vm = vdfRe.exec(vdfContent)) !== null) {
                    var steamCand = path.join(vm[1].trim(), 'steamapps', 'compatdata', '212500', 'pfx', 'drive_c', 'users', 'steamuser', 'My Documents', lotroDir);
                    if (fs.existsSync(steamCand)) return steamCand;
                }
            } catch (_) {}
        }
        var lutrisDir = path.join(os.homedir(), '.config', 'lutris', 'games');
        if (fs.existsSync(lutrisDir)) {
            try {
                var lfiles = fs.readdirSync(lutrisDir).filter(function(f) { return (f.toLowerCase().indexOf('lord') !== -1 || f.toLowerCase().indexOf('lotro') !== -1) && f.endsWith('.yml'); });
                for (var li = 0; li < lfiles.length; li++) {
                    try {
                        var yml = fs.readFileSync(path.join(lutrisDir, lfiles[li]), 'utf8');
                        var lm = yml.match(/(?:wine_prefix|prefix):\\s*(.+)/);
                        if (lm) {
                            var uname = process.env.USER || 'user';
                            var candidate = path.join(lm[1].trim(), 'drive_c', 'users', uname, 'My Documents', lotroDir);
                            if (fs.existsSync(candidate)) return candidate;
                        }
                    } catch (_) {}
                }
            } catch (_) {}
        }
        // Standard Wine-Prefix (~/.wine)
        var wineUname = process.env.USER || 'user';
        var wineDefault = path.join(os.homedir(), '.wine', 'drive_c', 'users', wineUname, 'My Documents', lotroDir);
        if (fs.existsSync(wineDefault)) return wineDefault;
        return path.join(os.homedir(), 'Documents', lotroDir);
    }
    try {
        var r = spawnSync('reg', ['query', 'HKCU\\\\Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Explorer\\\\Shell Folders', '/v', 'Personal'], { windowsHide: true, encoding: 'utf8' });
        var m = (r.stdout || '').match(/Personal\\s+REG_SZ\\s+(.+)/);
        if (m) { var p = path.join(m[1].trim(), lotroDir); if (fs.existsSync(p)) return p; }
    } catch (_) {}
    var od = path.join(os.homedir(), 'OneDrive', 'Documents', lotroDir);
    if (fs.existsSync(od)) return od;
    return path.join(os.homedir(), 'Documents', lotroDir);
}

function findStateFiles(lotroPath) {
    var pluginDataDir = path.join(lotroPath, 'PluginData');
    if (!fs.existsSync(pluginDataDir)) return [];
    var results = [];
    try {
        fs.readdirSync(pluginDataDir).forEach(function(server) {
            try {
                fs.readdirSync(path.join(pluginDataDir, server)).forEach(function(charName) {
                    var stateFile = path.join(pluginDataDir, server, charName, 'DeathTracker_State.plugindata');
                    if (fs.existsSync(stateFile)) {
                        results.push({ file: stateFile, charName: charName });
                    }
                });
            } catch (_) {}
        });
    } catch (_) {}
    return results;
}

function parseStateFile(filePath) {
    try {
        var content = fs.readFileSync(filePath, 'utf8');
        var m = content.match(/\\["totalDeathsTrackedLocally"\\]\\s*=\\s*([\\d.]+)/);
        return m ? Math.floor(parseFloat(m[1])) : 0;
    } catch (_) { return 0; }
}

function loadLocalDeaths() {
    try { return JSON.parse(fs.readFileSync(LOCAL_DEATHS_FILE, 'utf8')); } catch (_) { return { characters: {} }; }
}

function saveLocalDeaths(data) {
    try { fs.writeFileSync(LOCAL_DEATHS_FILE, JSON.stringify(data, null, 2), 'utf8'); } catch (e) {
        log('deaths.local.json konnte nicht gespeichert werden: ' + e.message);
    }
}

function httpsPostJSON(urlStr, body, cb) {
    var bodyStr = JSON.stringify(body);
    var parsed = new URL(urlStr);
    var req = https.request({
        hostname: parsed.hostname,
        path: parsed.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr), 'User-Agent': 'LOTRO-Death-Tracker-Watcher' }
    }, function(res) {
        var data = '';
        var statusCode = res.statusCode;
        res.on('data', function(c) { data += c; });
        res.on('end', function() { try { cb(null, JSON.parse(data), statusCode); } catch (e) { cb(e, null, statusCode); } });
    });
    req.on('error', cb);
    req.setTimeout(15000, function() { req.destroy(); cb(new Error('Timeout')); });
    req.write(bodyStr);
    req.end();
}

function syncLocalDeaths() {
    var lotroPath = getLotroPath();
    if (!fs.existsSync(lotroPath)) {
        log('syncLocalDeaths: LOTRO-Pfad nicht gefunden – uebersprungen.');
        return;
    }
    var stateFiles = findStateFiles(lotroPath);
    if (stateFiles.length === 0) {
        log('syncLocalDeaths: Keine DeathTracker_State-Dateien gefunden (Plugin noch nicht gestartet?).');
        return;
    }
    log('syncLocalDeaths: ' + stateFiles.length + ' Charakter(e) gefunden – pruefe Datenbank...');

    var localDeaths = loadLocalDeaths();
    var idx = 0;

    function processNext() {
        if (idx >= stateFiles.length) return;
        var entry = stateFiles[idx++];
        var charName = entry.charName;
        var currentPlugin = parseStateFile(entry.file);

        https.get(WP_API + '/characters', { headers: { 'User-Agent': 'LOTRO-Death-Tracker-Watcher' } }, function(res) {
            var data = '';
            res.on('data', function(c) { data += c; });
            res.on('end', function() {
                var parsed;
                try { parsed = JSON.parse(data); } catch (e) {
                    log('syncLocalDeaths: Ungueltige API-Antwort – uebersprungen.');
                    processNext();
                    return;
                }
                if (!parsed || !parsed.success) {
                    log('syncLocalDeaths: API-Fehler – uebersprungen.');
                    processNext();
                    return;
                }
                var chars = parsed.characters || [];
                var charData = null;
                var charNameNorm = charName.toLowerCase().trim();
                for (var i = 0; i < chars.length; i++) {
                    if ((chars[i].characterName || '').toLowerCase().trim() === charNameNorm) { charData = chars[i]; break; }
                }
                var currentServer = charData ? parseInt(charData.totalDeaths, 10) : 0;

                if (!localDeaths.characters[charName]) {
                    localDeaths.characters[charName] = {
                        baselineServer: currentServer,
                        firstSeenAt: new Date().toISOString()
                    };
                    saveLocalDeaths(localDeaths);
                    log('syncLocalDeaths [' + charName + ']: Baseline gesetzt (Server: ' + currentServer + ', Plugin: ' + currentPlugin + ').');
                    processNext();
                    return;
                }

                var baselineServer = localDeaths.characters[charName].baselineServer;
                var missing = currentPlugin - (currentServer - baselineServer);
                if (missing <= 0) {
                    log('syncLocalDeaths [' + charName + ']: Alles synchron (Plugin: ' + currentPlugin + ', Server: ' + currentServer + ', Baseline: ' + baselineServer + ').');
                    processNext();
                    return;
                }

                log('syncLocalDeaths [' + charName + ']: ' + missing + ' fehlende Tode werden nachgetragen...');
                var postBody = {
                    characterName: charName,
                    count: missing,
                    level: charData ? parseInt(charData.currentLevel, 10) : 0,
                    race: charData ? (charData.race || '') : '',
                    characterClass: charData ? (charData.characterClass || '') : ''
                };
                httpsPostJSON(WP_API + '/death/silent', postBody, function(postErr, result, statusCode) {
                    if (postErr || !result || !result.success) {
                        var errMsg = postErr ? postErr.message : JSON.stringify(result);
                        if (statusCode === 404) errMsg += ' (WordPress-Plugin v2.4 benoetigt – bitte WP-Plugin aktualisieren)';
                        log('syncLocalDeaths [' + charName + ']: Nachtragen fehlgeschlagen: ' + errMsg);
                    } else {
                        log('syncLocalDeaths [' + charName + ']: ' + result.inserted + ' Tode nachgetragen.');
                    }
                    processNext();
                });
            });
        }).on('error', function(e) {
            log('syncLocalDeaths: Netzwerkfehler – uebersprungen: ' + e.message);
        });
    }

    processNext();
}

function checkAndApplyUpdate() {
    const currentVersion = getCurrentVersion();
    log('Update-Check (installiert: v' + currentVersion + ')...');

    // Altes Staging-Verzeichnis aufräumen (abgebrochener vorheriger Versuch)
    const stagingDir = path.join(__dirname, 'update-staging');
    try {
        if (fs.existsSync(stagingDir)) {
            fs.readdirSync(stagingDir).forEach(function(f) {
                try { fs.unlinkSync(path.join(stagingDir, f)); } catch (_) {}
            });
            fs.rmdirSync(stagingDir);
            log('Altes Staging-Verzeichnis bereinigt.');
        }
    } catch (e) { log('Staging-Bereinigung: ' + e.message); }

    const req = https.request({
        hostname: 'api.github.com',
        path: '/repos/' + GITHUB_REPO + '/releases/latest',
        method: 'GET',
        headers: {
            'User-Agent': 'LOTRO-Death-Tracker-Watcher',
            'Accept': 'application/vnd.github.v3+json'
        }
    }, function(res) {
        let data = '';
        res.on('data', function(d) { data += d; });
        res.on('end', function() {
            if (res.statusCode !== 200) {
                log('Update-Check: GitHub Status ' + res.statusCode + ' – uebersprungen');
                return;
            }
            let release;
            try { release = JSON.parse(data); } catch (e) {
                log('Update-Check: JSON-Fehler – uebersprungen');
                return;
            }

            const remoteVersion = (release.tag_name || '').replace(/^v/, '');
            if (!remoteVersion) return;

            log('Verfuegbare Version: v' + remoteVersion);

            if (compareVersions(remoteVersion, currentVersion) <= 0) {
                log('Kein Update erforderlich.');
                return;
            }

            const base = 'https://raw.githubusercontent.com/' + GITHUB_REPO + '/v' + remoteVersion + '/Client/';

            var lotroNowRunning = isLOTRORunningSync();
            if (lotroNowRunning) {
                handleUpdateDialog(base, remoteVersion, stagingDir);
            } else {
                applyUpdateNow(base, remoteVersion, stagingDir);
            }
        });
    });

    let reqTimedOut = false;
    req.on('error', function(e) { if (!reqTimedOut) log('Update-Check: ' + e.message + ' – uebersprungen'); });
    req.setTimeout(15000, function() { reqTimedOut = true; log('Update-Check: Timeout – uebersprungen'); req.destroy(); });
    req.end();
}

function applyUpdateNow(base, remoteVersion, stagingDir) {
    log('Validiere Update-URL...');
    const validationPath = '/' + GITHUB_REPO + '/v' + remoteVersion + '/Client/version.json.template';
    const headReq = https.request({
        hostname: 'raw.githubusercontent.com',
        path: validationPath,
        method: 'HEAD',
        headers: { 'User-Agent': 'LOTRO-Death-Tracker-Watcher' }
    }, function(headRes) {
        headRes.resume();
        if (headRes.statusCode !== 200) {
            log('URL-Validierung fehlgeschlagen (HTTP ' + headRes.statusCode + ') – Update abgebrochen');
            return;
        }
        startDownload(base, remoteVersion, stagingDir);
    });
    let headTimedOut = false;
    headReq.on('error', function(e) {
        if (!headTimedOut) log('URL-Validierung: ' + e.message + ' – Update abgebrochen');
    });
    headReq.setTimeout(10000, function() {
        headTimedOut = true;
        headReq.destroy();
        log('URL-Validierung: Timeout – Update abgebrochen');
    });
    headReq.end();
}

// Synchroner LOTRO-Check (nur fuer Update-Dialog – blockiert kurz den Event-Loop)
function isLOTRORunningSync() {
    if (process.platform === 'linux') {
        var r1 = spawnSync('pgrep', ['-f', 'lotroclient'], { encoding: 'utf8' });
        if (r1.status === 0) return true;
        var r2 = spawnSync('pgrep', ['-f', 'proton.*212500'], { encoding: 'utf8' });
        return r2.status === 0;
    }
    var exes = ['lotroclient64.exe', 'lotroclient.exe'];
    for (var i = 0; i < exes.length; i++) {
        try {
            var r = spawnSync('tasklist', ['/FI', 'IMAGENAME eq ' + exes[i], '/NH'], { windowsHide: true, encoding: 'utf8' });
            if (r.stdout && r.stdout.toLowerCase().indexOf(exes[i].toLowerCase().split('.')[0]) !== -1) return true;
        } catch (_) {}
    }
    return false;
}

// Zeigt einen Dialog auf Linux: zenity → kdialog → notify-send + Log.
// type: 'question' (Ja/Nein, returns bool) | 'info' | 'error'
function linuxDialog(type, title, message) {
    if (spawnSync('which', ['zenity'], { encoding: 'utf8' }).status === 0) {
        if (type === 'question')
            return spawnSync('zenity', ['--question', '--title', title, '--text', message]).status === 0;
        spawnSync('zenity', ['--' + (type === 'error' ? 'error' : 'info'), '--title', title, '--text', message]);
        return true;
    }
    if (spawnSync('which', ['kdialog'], { encoding: 'utf8' }).status === 0) {
        if (type === 'question')
            return spawnSync('kdialog', ['--yesno', message, '--title', title]).status === 0;
        spawnSync('kdialog', ['--msgbox', message, '--title', title]);
        return true;
    }
    try { spawnSync('notify-send', [title, message]); } catch (_) {}
    log('[DIALOG] ' + title + ': ' + message);
    return type !== 'question';
}

// Zeigt einen VBScript-Dialog (Windows) oder linuxDialog (Linux).
// buttons: 0=OK, 4=Ja/Nein. Rueckgabe: 6=Ja, 7=Nein, 1=OK, -1=Fehler.
function showVbsDialog(lines, title, buttons) {
    if (typeof lines === 'string') lines = [lines];
    if (process.platform === 'linux') {
        var type = (buttons === 4) ? 'question' : (buttons === 16 ? 'error' : 'info');
        var message = lines.join('\\n');
        var result = linuxDialog(type, title, message);
        return result ? 6 : 7;
    }
    var msgExpr = lines.map(function(l) { return '"' + l.replace(/"/g, '') + '"'; }).join(' & vbCrLf & ');
    var vbs = 'Dim r\\nr = MsgBox(' + msgExpr + ', ' + buttons + ', "' + title + '")\\nWScript.Quit r\\n';
    var tmp = path.join(__dirname, '_watcher_dlg.vbs');
    try { fs.writeFileSync(tmp, vbs, 'latin1'); } catch (e) { return -1; }
    var res = spawnSync('wscript.exe', [tmp], { windowsHide: false, stdio: 'ignore' });
    try { fs.unlinkSync(tmp); } catch (_) {}
    return res.status;
}

function handleUpdateDialog(base, remoteVersion, stagingDir) {
    var title = 'LOTRO Death Tracker Update';
    log('Update-Dialog: LOTRO laeuft – zeige Nutzer-Dialog...');
    var r1 = showVbsDialog([
        'LOTRO Death Tracker Update v' + remoteVersion + ' verfuegbar!',
        '',
        'Herr der Ringe Online wird automatisch beendet, wenn du das Update jetzt installierst (indem du unten auf Ja drueckst).',
        'Der Watcher pausiert kurz waehrend dieses Dialogs - Die Tode werden weiterhin aufgezeichnet.',
        '',
        '[Ja]  = Jetzt installieren',
        '[Nein] = Spaeter erinnern'
    ], title, 4);

    if (r1 === 6) {
        log('Nutzer: Jetzt installieren – beende LOTRO...');
        if (process.platform === 'linux') {
            spawnSync('pkill', ['-f', 'lotroclient']);
        } else {
            spawnSync('taskkill', ['/F', '/IM', 'lotroclient64.exe', '/T'], { windowsHide: true });
            spawnSync('taskkill', ['/F', '/IM', 'lotroclient.exe', '/T'], { windowsHide: true });
        }
        stopClient();
        applyUpdateNow(base, remoteVersion, stagingDir);
    } else {
        var r2 = showVbsDialog([
            'Wann soll an das Update erinnert werden?',
            '',
            '[Ja]  = In 3 Stunden (naechster 3h-Check)',
            '[Nein] = Beim naechsten LOTRO-Start'
        ], title + ' – Erinnerung', 4);

        if (r2 !== 6) {
            log('Nutzer: Erinnern beim naechsten LOTRO-Start.');
            remindOnNextStart = true;
        } else {
            log('Nutzer: Erinnern beim naechsten 3h-Check.');
            // Kein Flag noetig – der 3h-Scheduler ruft checkAndApplyUpdate() sowieso auf
        }
    }
}

function scheduleNext3hCheck() {
    var now = new Date();
    var hours = now.getHours();
    var nextHour = Math.ceil((hours + 1) / 3) * 3;
    var next = new Date(now);
    next.setMinutes(0, 0, 0);
    if (nextHour >= 24) {
        next.setDate(next.getDate() + 1);
        next.setHours(0);
    } else {
        next.setHours(nextHour);
    }
    var delay = next.getTime() - now.getTime();
    log('Naechster periodischer Update-Check in ' + Math.round(delay / 60000) + ' Min. (um ' + next.getHours() + ':00 Uhr).');
    setTimeout(function() {
        checkAndApplyUpdate();
        scheduleNext3hCheck();
    }, delay);
}

function startDownload(base, remoteVersion, stagingDir) {
    try {
        fs.mkdirSync(stagingDir);
    } catch (e) {
        log('Staging-Verzeichnis konnte nicht erstellt werden: ' + e.message + ' – Update abgebrochen');
        return;
    }

    log('Update auf v' + remoteVersion + ' wird heruntergeladen...');

    const filesToDownload = [
        { name: 'client.js',            dest: path.join(__dirname, 'client.js') },
        { name: 'install-autostart.js', dest: path.join(__dirname, 'install-autostart.js') },
        { name: 'package.json',         dest: path.join(__dirname, 'package.json') },
        { name: 'updater.js',           dest: UPDATER_PATH },
    ];

    function cleanupStaging() {
        try {
            fs.readdirSync(stagingDir).forEach(function(sf) {
                try { fs.unlinkSync(path.join(stagingDir, sf)); } catch (_) {}
            });
            fs.rmdirSync(stagingDir);
        } catch (_) {}
    }

    let idx = 0;
    function downloadNext() {
        if (idx >= filesToDownload.length) {
            // Alle Dateien im Staging – jetzt atomar in Produktion umbenennen
            log('Alle Downloads erfolgreich – ersetze Produktionsdateien...');
            let renameErr = null;
            filesToDownload.forEach(function(f) {
                if (renameErr) return;
                const stagingPath = path.join(stagingDir, f.name);
                const backupPath = f.dest + '.bak';
                try {
                    if (fs.existsSync(f.dest)) fs.renameSync(f.dest, backupPath);
                    fs.renameSync(stagingPath, f.dest);
                    try { fs.unlinkSync(backupPath); } catch (_) {}
                } catch (e) {
                    renameErr = e;
                    if (fs.existsSync(backupPath) && !fs.existsSync(f.dest)) {
                        try { fs.renameSync(backupPath, f.dest); } catch (_) {}
                    }
                    log('Rename fehlgeschlagen (' + f.name + '): ' + e.message);
                }
            });

            cleanupStaging();

            if (renameErr) {
                log('Update fehlgeschlagen – Produktionsdateien konnten nicht ersetzt werden.');
                return;
            }

            // Updater spawnen und Watcher beenden
            log('Download abgeschlossen – starte Updater...');
            const updater = spawn(process.execPath, [UPDATER_PATH, remoteVersion], {
                detached: true,
                stdio: 'ignore',
                windowsHide: process.platform === 'win32'
            });
            updater.unref();

            if (clientProcess && !clientProcess.killed) {
                try { process.kill(clientProcess.pid); } catch (e) {}
            }
            if (checkInterval) clearInterval(checkInterval);
            log('Watcher beendet sich fuer Update auf v' + remoteVersion + '...');
            process.exit(0);
            return;
        }
        const f = filesToDownload[idx++];
        log('Lade: ' + f.name);
        const stagingPath = path.join(stagingDir, f.name);
        downloadRaw(base + f.name, stagingPath, function(err) {
            if (err) {
                log('Download-Fehler (' + f.name + '): ' + err.message + ' – Update abgebrochen');
                cleanupStaging();
                return;
            }
            downloadNext();
        });
    }
    downloadNext();
}

// ── Ende Auto-Update ───────────────────────────────────────────────────────

function isLOTRORunning(callback) {
    if (process.platform === 'linux') {
        var r = spawnSync('pgrep', ['-f', 'lotroclient'], { encoding: 'utf8' });
        if (r.status === 0) { callback(true); return; }
        var r2 = spawnSync('pgrep', ['-f', 'proton.*212500'], { encoding: 'utf8' });
        callback(r2.status === 0);
        return;
    }
    // WICHTIG: windowsHide verhindert aufpoppende CMD-Fenster!
    exec('tasklist /FI "IMAGENAME eq lotroclient64.exe"', { windowsHide: true }, (error1, stdout1) => {
        if (!error1 && stdout1.includes('lotroclient64.exe')) {
            callback(true);
            return;
        }
        exec('tasklist /FI "IMAGENAME eq lotroclient.exe"', { windowsHide: true }, (error2, stdout2) => {
            if (!error2 && stdout2.includes('lotroclient.exe')) {
                callback(true);
                return;
            }
            callback(false);
        });
    });
}

function startClient() {
    // checkLOTRO() prueft bereits via Signal-0 ob der Prozess lebt und setzt clientProcess = null
    // wenn er tot ist. Hier genuegt daher ein einfacher Null-Check als Sicherheitsnetz.
    if (clientProcess) return;

    log('LOTRO erkannt - starte Client...');
    
    clientProcess = spawn(process.execPath, [CLIENT_PATH], {
        detached: false,
        stdio: 'ignore',
        windowsHide: process.platform === 'win32'
    });
    
    clientProcess.unref();
    log('Client gestartet (PID: ' + clientProcess.pid + ')');
    clientProcess.on('exit', function(code) {
        log('Client beendet (Code: ' + code + ') – Watcher startet ihn neu sobald LOTRO laeuft.');
        clientProcess = null;
    });
}

function stopClient() {
    if (!clientProcess || clientProcess.killed) {
        return;
    }

    log('LOTRO beendet - stoppe Client...');

    try {
        process.kill(clientProcess.pid);
        log('Client gestoppt');
    } catch (error) {
        log('Fehler beim Stoppen: ' + error.message);
    }
    // clientProcess immer loeschen – auch wenn kill() fehlschlaegt (ESRCH = bereits tot)
    clientProcess = null;
}

// ── Sys-Tray Hilfsfunktionen ───────────────────────────────────────────────

function isPluginActive() {
    try {
        var lotroPath = getLotroPath();
        if (!fs.existsSync(lotroPath)) return false;
        var pluginDataDir = path.join(lotroPath, 'PluginData');
        if (!fs.existsSync(pluginDataDir)) return false;
        var cutoff = Date.now() - 5 * 60 * 1000;
        var servers = fs.readdirSync(pluginDataDir);
        for (var si = 0; si < servers.length; si++) {
            var serverDir = path.join(pluginDataDir, servers[si]);
            try {
                var chars = fs.readdirSync(serverDir);
                for (var ci = 0; ci < chars.length; ci++) {
                    var syncFile = path.join(serverDir, chars[ci], 'DeathTracker_Sync.plugindata');
                    try {
                        if (fs.existsSync(syncFile) && fs.statSync(syncFile).mtimeMs > cutoff) return true;
                    } catch (_) {}
                }
            } catch (_) {}
        }
    } catch (_) {}
    return false;
}

function getTrayState(lotroRunning, clientRunning, pluginActive) {
    if (!lotroRunning) return 'none';
    if (clientRunning && pluginActive) return 'green';
    if (clientRunning || pluginActive) return 'yellow';
    return 'red';
}

function getIconData(color) {
    var custom = color === 'red' ? CUSTOM_ICON_RED : (color === 'yellow' ? CUSTOM_ICON_YELLOW : CUSTOM_ICON_GREEN);
    if (custom) {
        try { if (fs.existsSync(custom)) return fs.readFileSync(custom).toString('base64'); } catch (_) {}
    }
    if (color === 'red')    return ICON_RED_B64;
    if (color === 'yellow') return ICON_YELLOW_B64;
    return ICON_GREEN_B64;
}

function getTrayTooltip(clientRunning, pluginActive) {
    return 'LOTRO Death Tracker\n' +
        'Watcher:  laeuft\n' +
        'Client:   ' + (clientRunning ? 'laeuft' : 'nicht gestartet') + '\n' +
        'Plugin:   ' + (pluginActive  ? 'erkannt' : 'nicht erkannt');
}

function destroyTray() {
    if (trayInstance) {
        try { trayInstance.kill(); } catch (_) {}
        trayInstance = null;
        log('[TRAY] Icon entfernt.');
    }
}

function updateTray(newState, lotroRunning, clientRunning, pluginActive) {
    if (newState === lastTrayState) return;
    var oldState = lastTrayState;
    lastTrayState = newState;
    log('[TRAY] Status: ' + oldState.toUpperCase() + ' \u2192 ' + newState.toUpperCase() +
        '  (LOTRO: ' + (lotroRunning    ? '\u2713' : '\u2717') +
        '  Client: ' + (clientRunning   ? '\u2713' : '\u2717') +
        '  Plugin: ' + (pluginActive    ? '\u2713' : '\u2717') + ')');

    if (!TRAY_AVAILABLE) {
        // Linux-Fallback ohne Tray-Bibliothek: notify-send bei Zustandswechseln
        if (process.platform === 'linux' && newState !== 'none') {
            try { spawnSync('notify-send', ['LOTRO Death Tracker', getTrayTooltip(clientRunning, pluginActive)]); } catch (_) {}
        }
        return;
    }

    destroyTray();
    if (newState === 'none') return;

    try {
        var st = new SysTray({
            menu: {
                icon: getIconData(newState),
                title: '',
                tooltip: getTrayTooltip(clientRunning, pluginActive),
                // Mindestens ein Eintrag erforderlich – die Go-Binary erwartet ein nichtleeres items-Array.
                items: [{ title: 'LOTRO Death Tracker', tooltip: '', checked: false, enabled: false }]
            },
            debug: false,
            copyDir: true
        });
        st.onClick(function() {});
        trayInstance = st;
    } catch (e) {
        log('[TRAY] Fehler beim Erstellen: ' + e.message);
    }
}

// ── Ende Sys-Tray ──────────────────────────────────────────────────────────

function checkLOTRO() {
    isLOTRORunning((lotroRunning) => {
        // H3: Signal-0-Check statt unzuverlaessigem .killed-Flag.
        // .killed ist false wenn der Prozess extern getoetet wurde (Antivirus, OOM-Killer).
        // process.kill(pid, 0) wirft ESRCH wenn der OS-Prozess nicht mehr existiert.
        var clientRunning = false;
        if (clientProcess) {
            try { process.kill(clientProcess.pid, 0); clientRunning = true; }
            catch (e) {
                log('Client (PID ' + clientProcess.pid + ') nicht mehr erreichbar (Signal-0: ' + e.code + ') – starte neu sobald LOTRO laeuft.');
                clientProcess = null;
            }
        }

        // Uebergang: LOTRO gerade gestartet (nicht laufend → laufend)
        if (lotroRunning && !prevLotroRunning) {
            if (remindOnNextStart) {
                remindOnNextStart = false;
                log('LOTRO gestartet – pruefe Update (Erinnerung)...');
                checkAndApplyUpdate();
            }
        }
        prevLotroRunning = lotroRunning;

        if (lotroRunning && !clientRunning) {
            startClient();
        } else if (!lotroRunning && clientRunning) {
            stopClient();
        }

        // Tray-Status aktualisieren (alle 5s, aber nur bei Aenderung wirksam)
        var pluginActive = isPluginActive();
        updateTray(getTrayState(lotroRunning, clientRunning, pluginActive), lotroRunning, clientRunning, pluginActive);
    });
}

log('=================================');
log('LOTRO Watcher gestartet');
log('Ueberwacht: ' + (process.platform === 'linux' ? 'lotroclient (pgrep) + proton/212500' : 'lotroclient64.exe & lotroclient.exe'));
log('Sys-Tray: ' + (TRAY_AVAILABLE ? 'verfuegbar' : 'nicht verfuegbar' + (process.platform === 'linux' ? ' (notify-send Fallback)' : ' – node-systray-v2 nicht geladen')));
log('=================================');

// Singleton-Lock: verhindert mehrfachen Start (wuerde mehrere Clients → doppelte Events erzeugen)
acquireLock();

// Stale .bak-Dateien bereinigen: koennen nach abruptem Prozessende im Rename-Fenster verbleiben.
// Szenario A: .bak vorhanden, Original fehlt → Original wiederherstellen (kritisch).
// Szenario B: Beide vorhanden → .bak ist Datenmüll, loeschen (harmlos).
['client.js', 'install-autostart.js', 'package.json', 'updater.js'].forEach(function(name) {
    var bakPath = path.join(__dirname, name + '.bak');
    if (!fs.existsSync(bakPath)) return;
    var destPath = path.join(__dirname, name);
    if (!fs.existsSync(destPath)) {
        try { fs.renameSync(bakPath, destPath); log('Backup wiederhergestellt: ' + name + ' (fehlte nach abgebrochenem Update)'); }
        catch (e) { log('Backup-Wiederherstellung fehlgeschlagen (' + name + '): ' + e.message); }
    } else {
        try { fs.unlinkSync(bakPath); log('Stale-Backup geloescht: ' + name + '.bak'); }
        catch (e) { log('Stale-Backup konnte nicht geloescht werden (' + name + '.bak): ' + e.message); }
    }
});

// Update-Check einmalig beim Start (laeuft asynchron im Hintergrund)
checkAndApplyUpdate();

// Periodische Update-Checks alle 3h (0:00, 3:00, 6:00 usw.)
scheduleNext3hCheck();

// Lokalen Tod-Abgleich einmalig beim Start durchfuehren (laeuft asynchron)
syncLocalDeaths();

checkInterval = setInterval(checkLOTRO, 5000);
checkLOTRO();

process.on('SIGINT', () => {
    log('Watcher wird beendet...');
    if (checkInterval) clearInterval(checkInterval);
    stopClient();
    destroyTray();
    releaseLock();
    process.exit(0);
});

process.on('SIGTERM', () => {
    log('Watcher wird beendet...');
    if (checkInterval) clearInterval(checkInterval);
    stopClient();
    destroyTray();
    releaseLock();
    process.exit(0);
});

process.on('exit', function() { try { destroyTray(); } catch (_) {} releaseLock(); });
`;
    
    fs.writeFileSync(WATCHER_JS, watcherContent, 'utf8');
    console.log('✅ Watcher-Script erstellt:', WATCHER_JS);
}

// Erstelle VBS-Script zum unsichtbaren Start (nur Windows)
function createVBSScript() {
    if (IS_LINUX) return;
    const vbsContent = `Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """${process.execPath.replace(/\\/g, '\\\\')}"" ""${WATCHER_JS.replace(/\\/g, '\\\\')}"" ", 0, False
Set WshShell = Nothing`;
    
    fs.writeFileSync(WATCHER_VBS, vbsContent, 'utf8');
    console.log('✅ VBS-Start-Script erstellt:', WATCHER_VBS);
}

// Installiere XDG Autostart (Linux)
function installLinux() {
    try {
        console.log('LOTRO Death Tracker - Autostart einrichten (Linux)');
        console.log('');

        const xdgDir = path.join(os.homedir(), '.config', 'autostart');
        if (!fs.existsSync(xdgDir)) fs.mkdirSync(xdgDir, { recursive: true });

        createWatcherScript();

        const desktopContent = '[Desktop Entry]\nType=Application\nName=LOTRO Death Tracker\nExec="' + process.execPath + '" "' + WATCHER_JS + '"\nHidden=false\nNoDisplay=false\nX-GNOME-Autostart-enabled=true\n';
        fs.writeFileSync(SHORTCUT_PATH, desktopContent, 'utf8');
        console.log('XDG Autostart erstellt: ' + SHORTCUT_PATH);
        console.log('');

        const pidFilePath = path.join(__dirname, 'watcher.pid');
        if (fs.existsSync(pidFilePath)) { try { fs.unlinkSync(pidFilePath); } catch (e) {} }

        const { spawn } = require('child_process');
        const watcher = spawn(process.execPath, [WATCHER_JS], { detached: true, stdio: 'ignore' });
        watcher.unref();

        console.log('Watcher gestartet!');
        console.log('');
        console.log('Logs: ' + path.join(__dirname, 'watcher.log'));
        process.exit(0);
    } catch (error) {
        console.error('Fehler:', error.message);
        process.exit(1);
    }
}

// Installiere in Startup-Ordner (Windows) oder XDG Autostart (Linux)
function install() {
    if (IS_LINUX) { installLinux(); return; }
    try {
        console.log('═════════════════════════════════════════════════');
        console.log('🎮 LOTRO Death Tracker - Smart Autostart');
        console.log('═════════════════════════════════════════════════');
        console.log('');
        console.log('Installation über Windows Startup-Ordner...');
        console.log('(Funktioniert auf jedem Windows-PC!)');
        console.log('');
        
        // Prüfe ob Startup-Ordner existiert
        if (!fs.existsSync(STARTUP_FOLDER)) {
            console.error('❌ Startup-Ordner nicht gefunden:', STARTUP_FOLDER);
            console.error('');
            console.error('Das ist sehr ungewöhnlich. Bitte prüfe deine Windows-Installation.');
            process.exit(1);
        }
        
        console.log('📁 Startup-Ordner:', STARTUP_FOLDER);
        console.log('');
        
        // Erstelle Scripts
        console.log('Erstelle Watcher-Script...');
        createWatcherScript();
        
        console.log('Erstelle VBS-Start-Script...');
        createVBSScript();
        
        console.log('');
        console.log('Kopiere in Startup-Ordner...');
        
        // Kopiere VBS in Startup-Ordner
        fs.copyFileSync(WATCHER_VBS, SHORTCUT_PATH);
        
        console.log('✅ VBS kopiert nach:', SHORTCUT_PATH);
        console.log('');
        
        console.log('═════════════════════════════════════════════════');
        console.log('✅ Smart Autostart erfolgreich installiert!');
        console.log('═════════════════════════════════════════════════');
        console.log('');
        console.log('✨ Wie es funktioniert:');
        console.log('  1. Windows startet → Watcher startet (unsichtbar)');
        console.log('  2. Du startest LOTRO → Client startet automatisch');
        console.log('  3. Du beendest LOTRO → Client stoppt automatisch');
        console.log('');
        console.log('🎯 Vorteile:');
        console.log('  ✅ Komplett unsichtbar');
        console.log('  ✅ Läuft nur wenn LOTRO läuft');
        console.log('  ✅ Kein Task Scheduler nötig');
        console.log('  ✅ Funktioniert auf jedem Windows');
        console.log('');
        console.log('🚀 Starte Watcher JETZT im Hintergrund...');
        console.log('');

        // Stale PID-Lock entfernen – verhindert sofortigen Exit des neuen Watchers
        // bei Mehrfachaufruf ohne vorheriges taskkill (P2-E)
        const pidFilePath = path.join(__dirname, 'watcher.pid');
        if (fs.existsSync(pidFilePath)) {
            try { fs.unlinkSync(pidFilePath); } catch (e) {}
        }

        // Starte Watcher sofort im Hintergrund
        const { spawn } = require('child_process');
        const watcher = spawn(process.execPath, [WATCHER_JS], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        });
        watcher.unref(); // Erlaubt diesem Prozess zu beenden ohne Watcher zu killen
        
        console.log('✅ Watcher läuft jetzt im Hintergrund!');
        console.log('');
        console.log('🎮 Du kannst jetzt sofort LOTRO starten:');
        console.log('   → Watcher erkennt LOTRO automatisch');
        console.log('   → Client startet automatisch');
        console.log('   → Keine weitere Aktion nötig!');
        console.log('');
        console.log('📊 Prüfen ob es funktioniert:');
        console.log('  1. Starte LOTRO');
        console.log('  2. Warte 5-10 Sekunden');
        console.log('  3. Task-Manager → Details → node.exe');
        console.log('  4. Sollte 2x laufen (Watcher + Client)');
        console.log('');
        console.log('📝 Logs:');
        console.log('  Watcher: ' + path.join(__dirname, 'watcher.log'));
        console.log('  Client:  ' + path.join(__dirname, 'client.log'));
        console.log('');
        console.log('═════════════════════════════════════════════════');
        process.exit(0); // Explizit mit Code 0 beenden – verhindert unhandled-error durch AV-Kill des Watcher-Spawns

    } catch (error) {
        console.error('');
        console.error('═════════════════════════════════════════════════');
        console.error('❌ Fehler bei der Installation!');
        console.error('═════════════════════════════════════════════════');
        console.error('');
        console.error('Fehler:', error.message);
        console.error('');
        console.error('Stack:', error.stack);
        console.error('');
        process.exit(1);
    }
}

// Deinstalliere XDG Autostart (Linux)
function uninstallLinux() {
    console.log('LOTRO Death Tracker - Autostart entfernen (Linux)');
    if (fs.existsSync(SHORTCUT_PATH)) {
        fs.unlinkSync(SHORTCUT_PATH);
        console.log('XDG Autostart entfernt: ' + SHORTCUT_PATH);
    } else {
        console.log('XDG Autostart nicht gefunden.');
    }
    if (fs.existsSync(WATCHER_JS)) {
        fs.unlinkSync(WATCHER_JS);
        console.log('Watcher-Script geloescht.');
    }
    console.log('Autostart entfernt.');
}

// Deinstalliere
function uninstall() {
    if (IS_LINUX) { uninstallLinux(); return; }
    try {
        console.log('═════════════════════════════════════════════════');
        console.log('🔧 Entferne Smart Autostart...');
        console.log('═════════════════════════════════════════════════');
        console.log('');
        
        // Lösche aus Startup-Ordner
        if (fs.existsSync(SHORTCUT_PATH)) {
            fs.unlinkSync(SHORTCUT_PATH);
            console.log('✅ Aus Startup-Ordner entfernt');
        } else {
            console.log('ℹ️  Nicht im Startup-Ordner gefunden');
        }
        
        // Lösche lokale Scripts
        if (fs.existsSync(WATCHER_VBS)) {
            fs.unlinkSync(WATCHER_VBS);
            console.log('✅ VBS-Script gelöscht');
        }
        
        if (fs.existsSync(WATCHER_JS)) {
            fs.unlinkSync(WATCHER_JS);
            console.log('✅ Watcher-Script gelöscht');
        }
        
        console.log('');
        console.log('═════════════════════════════════════════════════');
        console.log('✅ Smart Autostart entfernt!');
        console.log('═════════════════════════════════════════════════');
        console.log('');
        console.log('Watcher startet nicht mehr automatisch.');
        console.log('');
        console.log('🔧 Erneut aktivieren:');
        console.log('  npm run install-service');
        console.log('═════════════════════════════════════════════════');
        
    } catch (error) {
        console.error('❌ Fehler beim Entfernen:', error.message);
        process.exit(1);
    }
}

// Status
function status() {
    console.log('═════════════════════════════════════════════════');
    console.log('📊 Smart Autostart Status');
    console.log('═════════════════════════════════════════════════');
    console.log('');
    
    const installed = fs.existsSync(SHORTCUT_PATH);
    
    if (installed) {
        console.log('Status: ✅ INSTALLIERT');
        console.log('');
        console.log('Autostart-Datei:', SHORTCUT_PATH);
        console.log('');
        if (IS_LINUX) {
            console.log('Der Watcher startet automatisch beim Anmelden (XDG Autostart).');
        } else {
            console.log('Der Watcher startet automatisch beim Windows-Start.');
        }
        console.log('');
        console.log('📝 Logs:');
        console.log('  ' + path.join(__dirname, 'watcher.log'));
    } else {
        console.log('Status: ❌ NICHT INSTALLIERT');
        console.log('');
        console.log('🔧 Installieren:');
        console.log('  npm run install-service');
    }
    
    console.log('');
    console.log('═════════════════════════════════════════════════');
}

// Test
function test() {
    console.log('═════════════════════════════════════════════════');
    console.log('🧪 Teste Watcher');
    console.log('═════════════════════════════════════════════════');
    console.log('');
    
    if (!fs.existsSync(WATCHER_JS)) {
        console.log('❌ Watcher-Script nicht gefunden!');
        console.log('');
        console.log('Installiere zuerst:');
        console.log('  npm run install-service');
        console.log('');
        return;
    }
    
    console.log('Starte Watcher manuell...');
    console.log('');
    
    const { spawn } = require('child_process');
    
    // Starte Watcher sichtbar zum Testen
    const watcher = spawn(process.execPath, [WATCHER_JS], {
        stdio: 'inherit'
    });
    
    console.log('✅ Watcher gestartet (PID: ' + watcher.pid + ')');
    console.log('');
    console.log('Der Watcher läuft jetzt im Vordergrund.');
    console.log('Du siehst alle Ausgaben hier.');
    console.log('');
    console.log('🎮 TEST:');
    console.log('  1. Starte LOTRO');
    console.log('  2. Watcher sollte "LOTRO erkannt" melden');
    console.log('  3. Client startet automatisch');
    console.log('  4. Beende LOTRO');
    console.log('  5. Watcher sollte "LOTRO beendet" melden');
    console.log('  6. Client stoppt automatisch');
    console.log('');
    console.log('Drücke Strg+C zum Beenden');
    console.log('═════════════════════════════════════════════════');
    
    process.on('SIGINT', () => {
        console.log('\n\nBeende Watcher...');
        watcher.kill();
        process.exit(0);
    });
}

// CLI
const command = process.argv[2];

switch (command) {
    case 'install':
        install();
        break;
    case 'uninstall':
        uninstall();
        break;
    case 'status':
        status();
        break;
    case 'test':
        test();
        break;
    default:
        console.log('═════════════════════════════════════════════════');
        console.log('LOTRO Death Tracker - Smart Autostart');
        console.log('Version 3.1.0');
        console.log('═════════════════════════════════════════════════');
        console.log('');
        console.log('Befehle:');
        console.log('  npm run install-service   - Installieren');
        console.log('  npm run uninstall-service - Deinstallieren');
        console.log('  npm run status            - Status prüfen');
        console.log('  npm run test-service      - Watcher testen');
        console.log('═════════════════════════════════════════════════');
}
