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

// npm-Pfad: auf Windows aus node.exe-Verzeichnis ableiten (Admin-PATH-Problem), auf Linux direkt
const npmCmd = (function() {
    if (process.platform !== 'win32') return 'npm';
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
    if (process.platform === 'linux') {
        var r1 = spawnSync('pgrep', ['-f', 'lotroclient'], { encoding: 'utf8' });
        if (r1.status === 0) return true;
        var r2 = spawnSync('pgrep', ['-f', 'proton.*212500'], { encoding: 'utf8' });
        return r2.status === 0;
    }
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
    if (process.platform === 'linux') {
        try { spawnSync('pkill', ['-f', 'lotroclient']); } catch (e) {}
        return;
    }
    for (const exe of ['lotroclient64.exe', 'lotroclient.exe']) {
        try { spawnSync('taskkill', ['/F', '/IM', exe, '/T'], { windowsHide: true }); } catch (e) {}
    }
}

// Zeigt einen Dialog. Auf Linux: zenity → kdialog → notify-send + Log.
// buttons: 0=OK, 4=Ja/Nein. Rueckgabe: 6=Ja, 7=Nein, 1=OK, -1=Fehler.
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
// Hinweis: windowsHide: false ist hier absichtlich – der Dialog soll sichtbar sein.
function vbsDialog(lines, title, buttons) {
    if (typeof lines === 'string') lines = [lines];
    if (process.platform === 'linux') {
        const type = (buttons === 4) ? 'question' : (buttons === 16 ? 'error' : 'info');
        const message = lines.join('\n');
        const result = linuxDialog(type, title, message);
        return result ? 6 : 7;
    }
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
        var npmInstallOk = false;
        try {
            const npmOpts = { cwd: dir };
            if (process.platform === 'win32') npmOpts.windowsHide = true;
            execSync('"' + npmCmd + '" install --silent --no-progress', npmOpts);
            log('Pakete installiert.');
            npmInstallOk = true;
        } catch (e) {
            log('npm install Fehler: ' + e.message);
            // Pruefen ob essentielle Pakete trotzdem vorhanden sind.
            // Wenn ja, scheiterte wahrscheinlich nur das optionale node-systray-v2 (z.B. Netzwerk,
            // Antivirus) – kein Einfluss auf Kernfunktionen. Kein Fehler-Dialog in diesem Fall.
            var essentialOk = ['chokidar', 'axios'].every(function(m) {
                return fs.existsSync(path.join(dir, 'node_modules', m));
            });
            if (essentialOk) {
                log('Essentielle Pakete vorhanden – Watcher laeuft ohne Sys-Tray-Icon (node-systray-v2 nicht installiert).');
            } else {
                errors.push('npm install fehlgeschlagen: ' + e.message.trim().split('\n')[0]);
            }
        }

        // Pruefen ob kritische npm-Pakete vorhanden sind (Antivirus kann npm install partiell blockieren)
        // Nur pruefen wenn npm install zuvor erfolgreich war (sonst bereits oben behandelt).
        if (npmInstallOk) {
            var missingMods = ['chokidar', 'axios'].filter(function(m) {
                return !fs.existsSync(path.join(dir, 'node_modules', m));
            });
            if (missingMods.length > 0) {
                log('Fehlende npm-Pakete nach install: ' + missingMods.join(', '));
                errors.push('npm-Pakete fehlen (' + missingMods.join(', ') + ') – bitte "npm install" manuell ausfuehren in: ' + dir);
            }
        }

        // Schritt 2: version.json VOR dem Watcher-Start schreiben.
        // Kritisch: der neue Watcher liest version.json beim Start in checkAndApplyUpdate().
        // Steht dort noch die alte Version, erkennt er dasselbe Update erneut und beendet
        // sich sofort wieder → Watcher laeuft nie. version.json muss aktuell sein bevor
        // install-autostart.js den Watcher spawnt.
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

        // Schritt 3: Watcher + Autostart neu generieren und starten
        log('Konfiguriere Autostart neu...');
        try {
            const iaOpts = { cwd: dir };
            if (process.platform === 'win32') iaOpts.windowsHide = true;
            execSync('"' + process.execPath + '" install-autostart.js install', iaOpts);
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

        // Schritt 4: LOTRO Plugin-Dateien aktualisieren
        (function() {
            function getLOTROPath() {
                if (process.env.LOTRO_PATH) return process.env.LOTRO_PATH;
                var LOTRO_SUBDIR = 'The Lord of the Rings Online';
                if (process.platform === 'linux') {
                    var steamNative = path.join(os.homedir(), '.steam', 'steam', 'steamapps', 'compatdata', '212500', 'pfx', 'drive_c', 'users', 'steamuser', 'My Documents', LOTRO_SUBDIR);
                    if (fs.existsSync(steamNative)) return steamNative;
                    var steamFlatpak = path.join(os.homedir(), '.var', 'app', 'com.valvesoftware.Steam', 'data', 'Steam', 'steamapps', 'compatdata', '212500', 'pfx', 'drive_c', 'users', 'steamuser', 'My Documents', LOTRO_SUBDIR);
                    if (fs.existsSync(steamFlatpak)) return steamFlatpak;
                    var vdfLocations = [
                        path.join(os.homedir(), '.steam', 'steam', 'config', 'libraryfolders.vdf'),
                        path.join(os.homedir(), '.var', 'app', 'com.valvesoftware.Steam', 'data', 'Steam', 'config', 'libraryfolders.vdf')
                    ];
                    for (var vi = 0; vi < vdfLocations.length; vi++) {
                        if (!fs.existsSync(vdfLocations[vi])) continue;
                        try {
                            var vdfContent = fs.readFileSync(vdfLocations[vi], 'utf8');
                            var vdfRe = /"path"\s+"([^"]+)"/g;
                            var vm;
                            while ((vm = vdfRe.exec(vdfContent)) !== null) {
                                var steamCand = path.join(vm[1].trim(), 'steamapps', 'compatdata', '212500', 'pfx', 'drive_c', 'users', 'steamuser', 'My Documents', LOTRO_SUBDIR);
                                if (fs.existsSync(steamCand)) return steamCand;
                            }
                        } catch (_) {}
                    }
                    var lutrisDir = path.join(os.homedir(), '.config', 'lutris', 'games');
                    if (fs.existsSync(lutrisDir)) {
                        try {
                            var files = fs.readdirSync(lutrisDir).filter(function(f) { return (f.toLowerCase().indexOf('lord') !== -1 || f.toLowerCase().indexOf('lotro') !== -1) && f.endsWith('.yml'); });
                            for (var fi = 0; fi < files.length; fi++) {
                                try {
                                    var yml = fs.readFileSync(path.join(lutrisDir, files[fi]), 'utf8');
                                    var lm = yml.match(/(?:wine_prefix|prefix):\s*(.+)/);
                                    if (lm) {
                                        var uname = process.env.USER || 'user';
                                        var candidate = path.join(lm[1].trim(), 'drive_c', 'users', uname, 'My Documents', LOTRO_SUBDIR);
                                        if (fs.existsSync(candidate)) return candidate;
                                    }
                                } catch (_) {}
                            }
                        } catch (_) {}
                    }
                    // Standard Wine-Prefix (~/.wine)
                    var wineUname = process.env.USER || 'user';
                    var wineDefault = path.join(os.homedir(), '.wine', 'drive_c', 'users', wineUname, 'My Documents', LOTRO_SUBDIR);
                    if (fs.existsSync(wineDefault)) return wineDefault;
                    return path.join(os.homedir(), 'Documents', LOTRO_SUBDIR);
                }
                try {
                    var out = execSync(
                        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders" /v Personal',
                        { windowsHide: true, encoding: 'utf8' }
                    );
                    var m = out.match(/Personal\s+REG_SZ\s+(.+)/);
                    if (m) {
                        var p = path.join(m[1].trim(), LOTRO_SUBDIR);
                        if (fs.existsSync(p)) return p;
                    }
                } catch (_) {}
                var od = path.join(os.homedir(), 'OneDrive', 'Documents', LOTRO_SUBDIR);
                if (fs.existsSync(od)) return od;
                return path.join(os.homedir(), 'Documents', LOTRO_SUBDIR);
            }

            function downloadFileSync(url, dest) {
                // Staging: erst in .tmp schreiben, dann umbenennen.
                // Verhindert korrumpierte Zieldateien bei Abbruch (Netzwerkfehler, Antivirus-Interrupt).
                var tmp = dest + '.tmp';
                if (process.platform === 'linux') {
                    var r = spawnSync('curl', ['-fsSL', '-o', tmp, url], { encoding: 'utf8', timeout: 30000 });
                    if (r.status !== 0) {
                        try { fs.unlinkSync(tmp); } catch (_) {}
                        throw new Error('curl-Fehler' + (r.stderr ? ': ' + r.stderr.trim().split('\n')[0] : ''));
                    }
                    try { fs.renameSync(tmp, dest); } catch (e) { try { fs.unlinkSync(tmp); } catch (_) {} throw e; }
                    return;
                }
                var r = spawnSync('powershell.exe', [
                    '-NoProfile', '-NonInteractive', '-Command',
                    'Invoke-WebRequest -Uri \'' + url + '\' -OutFile \'' + tmp + '\' -UseBasicParsing; if ($?) { Move-Item -Force \'' + tmp + '\' \'' + dest + '\' }'
                ], { windowsHide: true, timeout: 30000 });
                if (r.status !== 0) {
                    try { fs.unlinkSync(tmp); } catch (_) {}
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
