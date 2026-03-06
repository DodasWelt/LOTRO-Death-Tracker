// LOTRO Death Tracker - Updater
// Wird vom Watcher nach einem erkannten Update gespawnt.
// Argument 1: neue Versionsnummer (z.B. "2.1")
// Der Watcher beendet sich direkt danach; dieser Prozess wartet kurz,
// fuehrt npm install + install-autostart.js install aus und loescht sich selbst.

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const dir = __dirname;
const newVersion = process.argv[2] || '0';

// npm-Pfad aus node.exe-Verzeichnis ableiten (laeuft auch wenn node nicht im Admin-PATH ist)
const npmCmd = (function() {
    const c = path.join(path.dirname(process.execPath), 'npm.cmd');
    return fs.existsSync(c) ? c : 'npm';
})();

function log(msg) {
    try {
        fs.appendFileSync(
            path.join(dir, 'watcher.log'),
            '[' + new Date().toISOString() + '] [Updater] ' + msg + '\n'
        );
    } catch (e) {}
}

log('Updater gestartet (Ziel: v' + newVersion + ')');

// --- LOTRO-Prozess-Erkennung ---

function isLotroRunning() {
    const exes = ['lotroclient64.exe', 'lotroclient.exe'];
    for (const exe of exes) {
        try {
            const r = spawnSync('tasklist', ['/FI', 'IMAGENAME eq ' + exe, '/NH'], {
                windowsHide: true, encoding: 'utf8'
            });
            if (r.stdout && r.stdout.toLowerCase().includes(exe.toLowerCase().split('.')[0])) {
                return true;
            }
        } catch (e) {}
    }
    return false;
}

function killLotro() {
    for (const exe of ['lotroclient64.exe', 'lotroclient.exe']) {
        try { spawnSync('taskkill', ['/F', '/IM', exe, '/T'], { windowsHide: true }); } catch (e) {}
    }
}

// Zeigt einen VBScript-Dialog. buttons: 0=OK, 4=Ja/Nein.
// Rueckgabe: 6=Ja, 7=Nein, 1=OK, -1=Fehler.
// Hinweis: windowsHide: false ist hier absichtlich – der Dialog soll sichtbar sein.
function vbsDialog(lines, title, buttons) {
    if (typeof lines === 'string') lines = [lines];
    const msgExpr = lines
        .map(function(l) { return '"' + l.replace(/"/g, '') + '"'; })
        .join(' & vbCrLf & ');
    const vbs = 'Dim r\nr = MsgBox(' + msgExpr + ', ' + buttons + ', "' + title + '")\nWScript.Quit r\n';
    const tmp = path.join(dir, '_upd_dlg.vbs');
    try { fs.writeFileSync(tmp, vbs, 'latin1'); } catch (e) { return -1; }
    const res = spawnSync('wscript.exe', [tmp], { windowsHide: false, stdio: 'ignore' });
    try { fs.unlinkSync(tmp); } catch (e) {}
    return res.status;
}

// --- LOTRO-Check vor dem Update ---

const TITLE = 'LOTRO Death Tracker Update';
const VBS_YES = 6;

let proceedWithUpdate = true;

if (isLotroRunning()) {
    log('LOTRO-Prozess erkannt – Nutzerdialog wird angezeigt');

    // Frage 1: Wurde LOTRO bereits beendet?
    const r1 = vbsDialog([
        'Herr der Ringe Online muss geschlossen sein, damit das Update funktioniert.',
        '',
        'Wurde Herr der Ringe Online bereits beendet?'
    ], TITLE, 4); // 4 = vbYesNo

    if (r1 === VBS_YES) {
        log('Nutzer: LOTRO beendet – Update wird gestartet');
    } else {
        // Frage 2: Soll das Spiel jetzt beendet werden?
        const r2 = vbsDialog(
            'Soll Herr der Ringe Online jetzt automatisch beendet werden?',
            TITLE, 4
        );

        if (r2 === VBS_YES) {
            log('Beende LOTRO-Prozesse...');
            killLotro();
            log('LOTRO-Prozesse beendet – Update wird gestartet');
        } else {
            log('Nutzer: Update abgelehnt (LOTRO soll nicht beendet werden)');
            // Abschluss-Hinweis – mit OK-Klick bestätigen
            vbsDialog([
                'Das Update kann gerade nicht durchgeführt werden.',
                '',
                'Bitte beende Herr der Ringe Online.',
                'Das Update wird beim nächsten Start des Watchers automatisch erneut versucht.'
            ], TITLE, 0); // 0 = vbOK
            proceedWithUpdate = false;
        }
    }
}

if (!proceedWithUpdate) {
    log('Updater ohne Update beendet');
    process.exit(0);
}

// Prueft periodisch ob eine Datei lesbar ist, maximal maxWaitMs lang.
function waitForFile(filePath, maxWaitMs, cb) {
    const start = Date.now();
    function check() {
        try {
            fs.accessSync(filePath, fs.constants.R_OK);
            cb(null);
        } catch (e) {
            if (Date.now() - start > maxWaitMs) { cb(e); return; }
            setTimeout(check, 200);
        }
    }
    check();
}

const installAutostartPath = path.join(dir, 'install-autostart.js');

// Kurz warten bis der Watcher-Prozess vollstaendig beendet ist
setTimeout(function() {

    // Readiness-Check: warte bis install-autostart.js lesbar ist (max 10s)
    waitForFile(installAutostartPath, 10000, function(err) {
        const errors = [];

        if (err) {
            log('install-autostart.js nicht lesbar nach 10s: ' + err.message + ' – versuche trotzdem...');
            errors.push('Datei install-autostart.js war nach 10s nicht lesbar: ' + err.message.trim().split('\n')[0]);
        }

        // Schritt 1: npm-Pakete aktualisieren
        log('Installiere Pakete...');
        try {
            execSync('"' + npmCmd + '" install --silent --no-progress', { cwd: dir, windowsHide: true });
            log('Pakete installiert.');
        } catch (e) {
            log('npm install Fehler: ' + e.message);
            errors.push('npm install fehlgeschlagen: ' + e.message.trim().split('\n')[0]);
            // Nicht abbrechen – install-autostart koennte trotzdem funktionieren
        }

        // Schritt 2: Watcher + Autostart neu generieren und starten
        log('Konfiguriere Autostart neu...');
        try {
            execSync('"' + process.execPath + '" install-autostart.js install', { cwd: dir, windowsHide: true });
            log('Autostart konfiguriert und Watcher gestartet.');
            // Verifizieren dass lotro-watcher.js erzeugt wurde
            if (!fs.existsSync(path.join(dir, 'lotro-watcher.js'))) {
                log('Warnung: lotro-watcher.js fehlt nach install-autostart.js install');
                errors.push('lotro-watcher.js nicht erstellt – Autostart moeglicherweise unvollstaendig');
            }
        } catch (e) {
            log('install-autostart Fehler: ' + e.message);
            errors.push('Autostart-Konfiguration fehlgeschlagen: ' + e.message.trim().split('\n')[0]);
        }

        // Schritt 3: version.json auf neue Version setzen
        try {
            fs.writeFileSync(
                path.join(dir, 'version.json'),
                JSON.stringify({ version: newVersion }, null, 2)
            );
            log('version.json aktualisiert auf v' + newVersion);
        } catch (e) {
            log('version.json Fehler: ' + e.message);
            errors.push('version.json konnte nicht geschrieben werden: ' + e.message.trim().split('\n')[0]);
        }

        // Schritt 4: LOTRO Plugin-Dateien aktualisieren
        (function() {
            function getLOTROPath() {
                if (process.env.LOTRO_PATH) return process.env.LOTRO_PATH;
                try {
                    var out = execSync(
                        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders" /v Personal',
                        { windowsHide: true, encoding: 'utf8' }
                    );
                    var m = out.match(/Personal\s+REG_SZ\s+(.+)/);
                    if (m) {
                        var p = path.join(m[1].trim(), 'The Lord of the Rings Online');
                        if (fs.existsSync(p)) return p;
                    }
                } catch (_) {}
                var od = path.join(os.homedir(), 'OneDrive', 'Documents', 'The Lord of the Rings Online');
                if (fs.existsSync(od)) return od;
                return path.join(os.homedir(), 'Documents', 'The Lord of the Rings Online');
            }

            function downloadFileSync(url, dest) {
                var r = spawnSync('powershell.exe', [
                    '-NoProfile', '-NonInteractive', '-Command',
                    'Invoke-WebRequest -Uri \'' + url + '\' -OutFile \'' + dest + '\' -UseBasicParsing'
                ], { windowsHide: true, timeout: 30000 });
                if (r.status !== 0) {
                    throw new Error('HTTP-Fehler' + (r.stderr ? ': ' + r.stderr.toString().trim().split('\n')[0] : ''));
                }
            }

            log('Aktualisiere LOTRO-Plugin-Dateien...');
            var lotroPath = getLOTROPath();
            if (!fs.existsSync(lotroPath)) {
                log('LOTRO-Pfad nicht gefunden (' + lotroPath + ') – Plugin-Update uebersprungen.');
                errors.push('LOTRO-Plugin nicht aktualisiert: Installationspfad nicht gefunden');
                return;
            }

            var pluginDir = path.join(lotroPath, 'Plugins', 'DodasWelt', 'DeathTracker');
            var pluginRootDir = path.join(lotroPath, 'Plugins', 'DodasWelt');
            try { fs.mkdirSync(pluginDir, { recursive: true }); } catch (_) {}

            var base = 'https://raw.githubusercontent.com/DodasWelt/LOTRO-Death-Tracker/v' + newVersion;
            var pluginFiles = [
                { url: base + '/LOTRO-Plugin/DodasWelt/DeathTracker/Main.lua',
                  dest: path.join(pluginDir, 'Main.lua') },
                { url: base + '/LOTRO-Plugin/DodasWelt/DeathTracker.plugin',
                  dest: path.join(pluginRootDir, 'DeathTracker.plugin') }
            ];

            var pluginErr = null;
            pluginFiles.forEach(function(f) {
                if (pluginErr) return;
                try {
                    downloadFileSync(f.url, f.dest);
                    log('Plugin-Datei aktualisiert: ' + path.basename(f.dest));
                } catch (e) {
                    pluginErr = e;
                    log('Plugin-Download fehlgeschlagen (' + path.basename(f.dest) + '): ' + e.message);
                    errors.push('LOTRO-Plugin nicht aktualisiert (' + path.basename(f.dest) + '): ' + e.message.trim().split('\n')[0]);
                }
            });

            if (!pluginErr) {
                log('LOTRO-Plugin-Dateien erfolgreich aktualisiert.');
            }
        })();

        log('Update auf v' + newVersion + (errors.length ? ' mit Fehlern' : '') + ' abgeschlossen!');

        // Abschluss-Dialog
        if (errors.length > 0) {
            const lines = [
                'Das Update auf v' + newVersion + ' wurde mit Fehlern abgeschlossen.',
                ''
            ].concat(errors.map(function(msg, i) { return (i + 1) + '. ' + msg; })).concat([
                '',
                'Details: ' + path.join(dir, 'watcher.log')
            ]);
            vbsDialog(lines, TITLE, 16); // 16 = OK + Critical-Icon
        } else {
            vbsDialog([
                'Update auf v' + newVersion + ' erfolgreich installiert!',
                '',
                'Der Watcher wurde neu gestartet und überwacht LOTRO ab sofort wieder.'
            ], TITLE, 64); // 64 = OK + Information-Icon
        }

        // Selbst loeschen
        try {
            fs.unlinkSync(path.join(dir, 'updater.js'));
        } catch (e) {}
    });

}, 1000);
