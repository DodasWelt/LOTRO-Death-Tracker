// LOTRO Event Tracker - Simple Startup Autostart
// Version: 3.1.0 - Nutzt Windows Startup-Ordner (funktioniert immer!)

const path = require('path');
const fs = require('fs');
const os = require('os');

const STARTUP_FOLDER = path.join(
    os.homedir(),
    'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'
);

const WATCHER_VBS = path.join(__dirname, 'start-lotro-watcher.vbs');
const WATCHER_JS = path.join(__dirname, 'lotro-watcher.js');
const CLIENT_PATH = path.join(__dirname, 'client.js');
const SHORTCUT_PATH = path.join(STARTUP_FOLDER, 'LOTRO-Death-Tracker.vbs');

// Erstelle Watcher-Script
function createWatcherScript() {
    const watcherContent = `// LOTRO Watcher - Startet Client nur wenn LOTRO läuft
const { exec, spawn } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');

const CLIENT_PATH = '${CLIENT_PATH.replace(/\\/g, '\\\\')}';
const LOG_PATH    = path.join(__dirname, 'watcher.log');
const GITHUB_REPO = 'DodasWelt/LOTRO-Death-Tracker';
const VERSION_FILE = path.join(__dirname, 'version.json');
const UPDATER_PATH = path.join(__dirname, 'updater.js');

let clientProcess = null;
let checkInterval = null;

function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = \`[\${timestamp}] \${message}\\n\`;
    try {
        fs.appendFileSync(LOG_PATH, logMessage, 'utf8');
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

            // URL-Vorab-Validierung: prüfe ob der Tag auf raw.githubusercontent.com erreichbar ist
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
        });
    });

    let reqTimedOut = false;
    req.on('error', function(e) { if (!reqTimedOut) log('Update-Check: ' + e.message + ' – uebersprungen'); });
    req.setTimeout(15000, function() { reqTimedOut = true; log('Update-Check: Timeout – uebersprungen'); req.destroy(); });
    req.end();
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
                try {
                    if (fs.existsSync(f.dest)) fs.unlinkSync(f.dest);
                    fs.renameSync(stagingPath, f.dest);
                } catch (e) {
                    renameErr = e;
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
                windowsHide: true
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
    // Prüfe beide Versionen separat (tasklist unterstützt kein OR)
    // WICHTIG: windowsHide verhindert aufpoppende CMD-Fenster!
    exec('tasklist /FI "IMAGENAME eq lotroclient64.exe"', { windowsHide: true }, (error1, stdout1) => {
        if (!error1 && stdout1.includes('lotroclient64.exe')) {
            callback(true);
            return;
        }
        
        // Wenn 64-bit nicht läuft, prüfe 32-bit
        exec('tasklist /FI "IMAGENAME eq lotroclient.exe"', { windowsHide: true }, (error2, stdout2) => {
            if (!error2 && stdout2.includes('lotroclient.exe')) {
                callback(true);
                return;
            }
            
            // Beide nicht gefunden
            callback(false);
        });
    });
}

function startClient() {
    if (clientProcess && !clientProcess.killed) {
        return;
    }
    
    log('LOTRO erkannt - starte Client...');
    
    clientProcess = spawn(process.execPath, [CLIENT_PATH], {
        detached: false,
        stdio: 'ignore',
        windowsHide: true
    });
    
    clientProcess.unref();
    log('Client gestartet (PID: ' + clientProcess.pid + ')');
}

function stopClient() {
    if (!clientProcess || clientProcess.killed) {
        return;
    }
    
    log('LOTRO beendet - stoppe Client...');
    
    try {
        process.kill(clientProcess.pid);
        clientProcess = null;
        log('Client gestoppt');
    } catch (error) {
        log('Fehler beim Stoppen: ' + error.message);
    }
}

function checkLOTRO() {
    isLOTRORunning((lotroRunning) => {
        const clientRunning = clientProcess && !clientProcess.killed;
        
        if (lotroRunning && !clientRunning) {
            startClient();
        } else if (!lotroRunning && clientRunning) {
            stopClient();
        }
    });
}

log('=================================');
log('LOTRO Watcher gestartet');
log('Ueberwacht: lotroclient64.exe & lotroclient.exe');
log('=================================');

// Update-Check einmalig beim Start (laeuft asynchron im Hintergrund)
checkAndApplyUpdate();

checkInterval = setInterval(checkLOTRO, 5000);
checkLOTRO();

process.on('SIGINT', () => {
    log('Watcher wird beendet...');
    if (checkInterval) clearInterval(checkInterval);
    stopClient();
    process.exit(0);
});

process.on('SIGTERM', () => {
    log('Watcher wird beendet...');
    if (checkInterval) clearInterval(checkInterval);
    stopClient();
    process.exit(0);
});
`;
    
    fs.writeFileSync(WATCHER_JS, watcherContent, 'utf8');
    console.log('✅ Watcher-Script erstellt:', WATCHER_JS);
}

// Erstelle VBS-Script zum unsichtbaren Start
function createVBSScript() {
    const vbsContent = `Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """${process.execPath.replace(/\\/g, '\\\\')}"" ""${WATCHER_JS.replace(/\\/g, '\\\\')}"" ", 0, False
Set WshShell = Nothing`;
    
    fs.writeFileSync(WATCHER_VBS, vbsContent, 'utf8');
    console.log('✅ VBS-Start-Script erstellt:', WATCHER_VBS);
}

// Installiere in Startup-Ordner
function install() {
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

// Deinstalliere
function uninstall() {
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
        console.log('Startup-Datei:', SHORTCUT_PATH);
        console.log('');
        console.log('Der Watcher startet automatisch beim Windows-Start.');
        console.log('');
        console.log('🔍 Prüfen:');
        console.log('  1. Starte LOTRO');
        console.log('  2. Warte 5-10 Sekunden');
        console.log('  3. Task-Manager → Details → node.exe');
        console.log('  4. Sollte 2x laufen (Watcher + Client)');
        console.log('');
        console.log('📝 Logs:');
        console.log('  notepad "' + path.join(__dirname, 'watcher.log') + '"');
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
    
    if (!fs.existsSync(WATCHER_VBS)) {
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
