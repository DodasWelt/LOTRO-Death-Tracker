// LOTRO Death Tracker - Updater
// Wird vom Watcher nach einem erkannten Update gespawnt.
// Argument 1: neue Versionsnummer (z.B. "2.1")
// Der Watcher beendet sich direkt danach; dieser Prozess wartet kurz,
// fuehrt npm install + install-autostart.js install aus und loescht sich selbst.

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const dir = __dirname;
const newVersion = process.argv[2] || '0';

function log(msg) {
    try {
        fs.appendFileSync(
            path.join(dir, 'watcher.log'),
            '[' + new Date().toISOString() + '] [Updater] ' + msg + '\n'
        );
    } catch (e) {}
}

log('Updater gestartet (Ziel: v' + newVersion + ')');

// 3 Sekunden warten bis der Watcher-Prozess vollstaendig beendet ist
setTimeout(function() {

    // Schritt 1: npm-Pakete aktualisieren
    log('Installiere Pakete...');
    try {
        execSync('npm install --silent --no-progress', { cwd: dir, windowsHide: true });
        log('Pakete installiert.');
    } catch (e) {
        log('npm install Fehler: ' + e.message);
        // Nicht abbrechen – install-autostart koennte trotzdem funktionieren
    }

    // Schritt 2: Watcher + Autostart neu generieren und starten
    log('Konfiguriere Autostart neu...');
    try {
        execSync('node install-autostart.js install', { cwd: dir, windowsHide: true });
        log('Autostart konfiguriert und Watcher gestartet.');
    } catch (e) {
        log('install-autostart Fehler: ' + e.message);
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
    }

    log('Update auf v' + newVersion + ' abgeschlossen!');

    // Selbst loeschen
    try {
        fs.unlinkSync(path.join(dir, 'updater.js'));
    } catch (e) {}

}, 3000);
