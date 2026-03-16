// LOTRO Death Tracker - Autostart-Installation und Watcher/Status-Server-Setup
// Version: 3.0

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

const STATUS_SERVER_JS  = path.join(__dirname, 'lotro-status-server.js');
const STATUS_SERVER_VBS = path.join(__dirname, 'start-lotro-status-server.vbs');
const STATUS_SHORTCUT_PATH = IS_LINUX
    ? path.join(os.homedir(), '.config', 'autostart', 'lotro-death-tracker-status.desktop')
    : path.join(STARTUP_FOLDER, 'LOTRO-Death-Tracker-Status.vbs');

// Erstelle Status-Server-Script
function createStatusServerScript() {
    const CLIENT_PATH_ESC = CLIENT_PATH.replace(/\\/g, '\\\\');
    const DIR_ESC = __dirname.replace(/\\/g, '\\\\');

    const content = '// LOTRO Death Tracker - Status-Server v3.0\n' +
'// Separater Prozess: laeuft unabhaengig vom Watcher.\n' +
'// OBS Browser-Dock: http://localhost:7890\n' +
'const http = require(\'http\');\n' +
'const fs = require(\'fs\');\n' +
'const path = require(\'path\');\n' +
'const os = require(\'os\');\n' +
'const { spawn, spawnSync } = require(\'child_process\');\n' +
'\n' +
'var PORTS     = [7890,7891,7892,7893,7894];\n' +
'var portIndex = 0;\n' +
'var PORT      = PORTS[portIndex];\n' +
'const DIR         = \'' + DIR_ESC + '\';\n' +
'const PID_FILE    = path.join(DIR, \'status-server.pid\');\n' +
'const WATCHER_PID = path.join(DIR, \'watcher.pid\');\n' +
'const CLIENT_PID  = path.join(DIR, \'client.pid\');\n' +
'const WATCHER_JS  = path.join(DIR, \'lotro-watcher.js\');\n' +
'const AUTOSTART_JS = path.join(DIR, \'install-autostart.js\');\n' +
'const LOG_PATH    = path.join(DIR, \'status-server.log\');\n' +
'\n' +
'var cachedLotroPath = null;\n' +
'\n' +
'function log(msg) {\n' +
'    var ts = new Date().toISOString();\n' +
'    try { fs.appendFileSync(LOG_PATH, \'[\' + ts + \'] \' + msg + \'\\n\', \'utf8\'); } catch (e) {}\n' +
'}\n' +
'\n' +
'function acquireLock() {\n' +
'    if (fs.existsSync(PID_FILE)) {\n' +
'        try {\n' +
'            var existingPid = parseInt(fs.readFileSync(PID_FILE, \'utf8\').trim(), 10);\n' +
'            if (existingPid && existingPid !== process.pid) {\n' +
'                try {\n' +
'                    process.kill(existingPid, 0);\n' +
'                    var isNode = false;\n' +
'                    try {\n' +
'                        if (process.platform === \'linux\') {\n' +
'                            var tc = spawnSync(\'ps\', [\'-p\', String(existingPid), \'-o\', \'comm=\'], { encoding: \'utf8\' });\n' +
'                            if (tc.stdout && tc.stdout.toLowerCase().indexOf(\'node\') !== -1) isNode = true;\n' +
'                        } else {\n' +
'                            var tc = spawnSync(\'tasklist\', [\'/FI\', \'PID eq \' + existingPid, \'/FO\', \'CSV\', \'/NH\'], { windowsHide: true, encoding: \'utf8\' });\n' +
'                            if (tc.stdout && tc.stdout.toLowerCase().indexOf(\'node.exe\') !== -1) isNode = true;\n' +
'                        }\n' +
'                    } catch (_) {}\n' +
'                    if (isNode) { log(\'Status-Server bereits aktiv (PID \' + existingPid + \') – beende diese Instanz.\'); process.exit(0); }\n' +
'                } catch (e) { log(\'Stale PID-Lock – wird ueberschrieben.\'); }\n' +
'            }\n' +
'        } catch (e) {}\n' +
'    }\n' +
'    try { fs.writeFileSync(PID_FILE, String(process.pid), \'utf8\'); } catch (e) {}\n' +
'}\n' +
'\n' +
'function releaseLock() {\n' +
'    try {\n' +
'        if (fs.existsSync(PID_FILE)) {\n' +
'            var pid = parseInt(fs.readFileSync(PID_FILE, \'utf8\').trim(), 10);\n' +
'            if (pid === process.pid) fs.unlinkSync(PID_FILE);\n' +
'        }\n' +
'    } catch (e) {}\n' +
'}\n' +
'\n' +
'function isProcessAlive(pidFile) {\n' +
'    try {\n' +
'        if (!fs.existsSync(pidFile)) return false;\n' +
'        var pid = parseInt(fs.readFileSync(pidFile, \'utf8\').trim(), 10);\n' +
'        if (!pid) return false;\n' +
'        process.kill(pid, 0);\n' +
'        return true;\n' +
'    } catch (e) { return false; }\n' +
'}\n' +
'\n' +
'// SYNC: getLotroPath ist 4x implementiert (client.js, updater.js, Watcher-Template, Status-Server-Template).\n' +
'// Bei Aenderungen ALLE 4 Stellen synchron halten!\n' +
'function getLotroPathCached() {\n' +
'    if (cachedLotroPath) return cachedLotroPath;\n' +
'    var lotroDir = \'The Lord of the Rings Online\';\n' +
'    if (process.env.LOTRO_PATH) { cachedLotroPath = process.env.LOTRO_PATH; return cachedLotroPath; }\n' +
'    if (process.platform === \'linux\') {\n' +
'        var steamNative = path.join(os.homedir(), \'.steam\', \'steam\', \'steamapps\', \'compatdata\', \'212500\', \'pfx\', \'drive_c\', \'users\', \'steamuser\', \'My Documents\', lotroDir);\n' +
'        if (fs.existsSync(steamNative)) { cachedLotroPath = steamNative; return cachedLotroPath; }\n' +
'        var steamFlatpak = path.join(os.homedir(), \'.var\', \'app\', \'com.valvesoftware.Steam\', \'data\', \'Steam\', \'steamapps\', \'compatdata\', \'212500\', \'pfx\', \'drive_c\', \'users\', \'steamuser\', \'My Documents\', lotroDir);\n' +
'        if (fs.existsSync(steamFlatpak)) { cachedLotroPath = steamFlatpak; return cachedLotroPath; }\n' +
'        var vdfLocs = [path.join(os.homedir(), \'.steam\', \'steam\', \'config\', \'libraryfolders.vdf\'), path.join(os.homedir(), \'.var\', \'app\', \'com.valvesoftware.Steam\', \'data\', \'Steam\', \'config\', \'libraryfolders.vdf\')];\n' +
'        for (var vi = 0; vi < vdfLocs.length; vi++) {\n' +
'            if (!fs.existsSync(vdfLocs[vi])) continue;\n' +
'            try {\n' +
'                var vdfContent = fs.readFileSync(vdfLocs[vi], \'utf8\');\n' +
'                var vdfRe = /"path"\\s+"([^"]+)"/g; var vm;\n' +
'                while ((vm = vdfRe.exec(vdfContent)) !== null) {\n' +
'                    var sc = path.join(vm[1].trim(), \'steamapps\', \'compatdata\', \'212500\', \'pfx\', \'drive_c\', \'users\', \'steamuser\', \'My Documents\', lotroDir);\n' +
'                    if (fs.existsSync(sc)) { cachedLotroPath = sc; return cachedLotroPath; }\n' +
'                }\n' +
'            } catch (_) {}\n' +
'        }\n' +
'        var lutrisDir = path.join(os.homedir(), \'.config\', \'lutris\', \'games\');\n' +
'        if (fs.existsSync(lutrisDir)) {\n' +
'            try {\n' +
'                var lfiles = fs.readdirSync(lutrisDir).filter(function(f) { return (f.toLowerCase().indexOf(\'lord\') !== -1 || f.toLowerCase().indexOf(\'lotro\') !== -1) && f.endsWith(\'.yml\'); });\n' +
'                for (var li = 0; li < lfiles.length; li++) {\n' +
'                    try {\n' +
'                        var yml = fs.readFileSync(path.join(lutrisDir, lfiles[li]), \'utf8\');\n' +
'                        var lm = yml.match(/(?:wine_prefix|prefix):\\s*(.+)/);\n' +
'                        if (lm) {\n' +
'                            var uname = process.env.USER || \'user\';\n' +
'                            var lc = path.join(lm[1].trim(), \'drive_c\', \'users\', uname, \'My Documents\', lotroDir);\n' +
'                            if (fs.existsSync(lc)) { cachedLotroPath = lc; return cachedLotroPath; }\n' +
'                        }\n' +
'                    } catch (_) {}\n' +
'                }\n' +
'            } catch (_) {}\n' +
'        }\n' +
'        var wineUname = process.env.USER || \'user\';\n' +
'        var wineDefault = path.join(os.homedir(), \'.wine\', \'drive_c\', \'users\', wineUname, \'My Documents\', lotroDir);\n' +
'        if (fs.existsSync(wineDefault)) { cachedLotroPath = wineDefault; return cachedLotroPath; }\n' +
'        cachedLotroPath = path.join(os.homedir(), \'Documents\', lotroDir);\n' +
'        return cachedLotroPath;\n' +
'    }\n' +
'    try {\n' +
'        var r = spawnSync(\'reg\', [\'query\', \'HKCU\\\\Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Explorer\\\\Shell Folders\', \'/v\', \'Personal\'], { windowsHide: true, encoding: \'utf8\' });\n' +
'        var m = (r.stdout || \'\').match(/Personal\\s+REG_SZ\\s+(.+)/);\n' +
'        if (m) { var p = path.join(m[1].trim(), lotroDir); if (fs.existsSync(p)) { cachedLotroPath = p; return cachedLotroPath; } }\n' +
'    } catch (_) {}\n' +
'    var od = path.join(os.homedir(), \'OneDrive\', \'Documents\', lotroDir);\n' +
'    if (fs.existsSync(od)) { cachedLotroPath = od; return cachedLotroPath; }\n' +
'    cachedLotroPath = path.join(os.homedir(), \'Documents\', lotroDir);\n' +
'    return cachedLotroPath;\n' +
'}\n' +
'\n' +
'function isPluginActive() {\n' +
'    try {\n' +
'        var lotroPath = getLotroPathCached();\n' +
'        var pluginFile = path.join(lotroPath, \'Plugins\', \'DodasWelt\', \'DeathTracker.plugin\');\n' +
'        return fs.existsSync(pluginFile);\n' +
'    } catch (_) { return false; }\n' +
'}\n' +
'\n' +
'function getStatus() {\n' +
'    return {\n' +
'        watcher: isProcessAlive(WATCHER_PID),\n' +
'        client:  isProcessAlive(CLIENT_PID),\n' +
'        plugin:  isPluginActive(),\n' +
'        lastCheck: new Date().toISOString()\n' +
'    };\n' +
'}\n' +
'\n' +
'function doRestart(res) {\n' +
'    res.writeHead(200, { \'Content-Type\': \'application/json\' });\n' +
'    res.end(\'{"ok":true}\');\n' +
'    log(\'Restart angefordert – schreibe Restart-Script...\');\n' +
'\n' +
'    var nodeExe = process.execPath.replace(/\\\\/g, \'\\\\\\\\\');\n' +
'    var autostartPath = AUTOSTART_JS.replace(/\\\\/g, \'\\\\\\\\\');\n' +
'\n' +
'    if (process.platform === \'linux\') {\n' +
'        var shPath = path.join(DIR, \'_lotro_restart.sh\');\n' +
'        var shContent =\n' +
'            \'#!/bin/bash\\n\' +\n' +
'            \'sleep 2\\n\' +\n' +
'            \'SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"\\n\' +\n' +
'            \'if [ -f "$SCRIPT_DIR/watcher.pid" ]; then\\n\' +\n' +
'            \'  wPid=$(cat "$SCRIPT_DIR/watcher.pid" 2>/dev/null)\\n\' +\n' +
'            \'  [ -n "$wPid" ] && kill -TERM "$wPid" 2>/dev/null\\n\' +\n' +
'            \'fi\\n\' +\n' +
'            \'if [ -f "$SCRIPT_DIR/client.pid" ]; then\\n\' +\n' +
'            \'  cPid=$(cat "$SCRIPT_DIR/client.pid" 2>/dev/null)\\n\' +\n' +
'            \'  [ -n "$cPid" ] && kill -TERM "$cPid" 2>/dev/null\\n\' +\n' +
'            \'fi\\n\' +\n' +
'            \'"\' + process.execPath + \'" "\' + AUTOSTART_JS + \'" install\\n\' +\n' +
'            \'rm -f "$0"\\n\';\n' +
'        try { fs.writeFileSync(shPath, shContent, \'utf8\'); } catch (e) { log(\'Restart-Script schreiben fehlgeschlagen: \' + e.message); return; }\n' +
'        try { fs.chmodSync(shPath, 0o755); } catch (_) {}\n' +
'        var child = spawn(\'sh\', [shPath], { detached: true, stdio: \'ignore\' });\n' +
'        child.unref();\n' +
'    } else {\n' +
'        var vbsPath = path.join(DIR, \'_lotro_restart.vbs\');\n' +
'        var vbsContent =\n' +
'            \'Set fso = CreateObject("Scripting.FileSystemObject")\\r\\n\' +\n' +
'            \'Set oShell = CreateObject("WScript.Shell")\\r\\n\' +\n' +
'            \'WScript.Sleep 2000\\r\\n\' +\n' +
'            \'Dim scriptDir : scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)\\r\\n\' +\n' +
'            \'Dim wPid, cPid, subPath, wStream, cStream, pluginFolder, subName, sdBase, wmiSvc, wmiProcs, wmiProc\\r\\n\' +\n' +
'            \'Dim watcherPidFile : watcherPidFile = scriptDir & "\\\\watcher.pid"\\r\\n\' +\n' +
'            \'If fso.FileExists(watcherPidFile) Then\\r\\n\' +\n' +
'            \'  On Error Resume Next\\r\\n\' +\n' +
'            \'  Set wStream = fso.OpenTextFile(watcherPidFile, 1)\\r\\n\' +\n' +
'            \'  wPid = Trim(wStream.ReadAll) : wStream.Close\\r\\n\' +\n' +
'            \'  If wPid <> "" Then oShell.Run "taskkill /F /PID " & wPid, 0, True\\r\\n\' +\n' +
'            \'  On Error GoTo 0\\r\\n\' +\n' +
'            \'End If\\r\\n\' +\n' +
'            \'Dim clientPidFile : clientPidFile = scriptDir & "\\\\client.pid"\\r\\n\' +\n' +
'            \'If fso.FileExists(clientPidFile) Then\\r\\n\' +\n' +
'            \'  On Error Resume Next\\r\\n\' +\n' +
'            \'  Set cStream = fso.OpenTextFile(clientPidFile, 1)\\r\\n\' +\n' +
'            \'  cPid = Trim(cStream.ReadAll) : cStream.Close\\r\\n\' +\n' +
'            \'  If cPid <> "" Then oShell.Run "taskkill /F /PID " & cPid, 0, True\\r\\n\' +\n' +
'            \'  On Error GoTo 0\\r\\n\' +\n' +
'            \'End If\\r\\n\' +\n' +
'            \'sdBase = oShell.ExpandEnvironmentStrings("%APPDATA%\\\\Elgato\\\\StreamDeck\\\\Plugins")\\r\\n\' +\n' +
'            \'If fso.FolderExists(sdBase) Then\\r\\n\' +\n' +
'            \'  On Error Resume Next\\r\\n\' +\n' +
'            \'  Set wmiSvc = GetObject("winmgmts:root\\\\cimv2")\\r\\n\' +\n' +
'            \'  Set wmiProcs = wmiSvc.ExecQuery("SELECT * FROM Win32_Process WHERE Name=" & Chr(34) & "node.exe" & Chr(34))\\r\\n\' +\n' +
'            \'  For Each wmiProc In wmiProcs\\r\\n\' +\n' +
'            \'    If InStr(1, LCase(wmiProc.ExecutablePath), LCase(sdBase), 1) > 0 Then wmiProc.Terminate(0)\\r\\n\' +\n' +
'            \'  Next\\r\\n\' +\n' +
'            \'  WScript.Sleep 500\\r\\n\' +\n' +
'            \'  For Each pluginFolder In fso.GetFolder(sdBase).SubFolders\\r\\n\' +\n' +
'            \'    For Each subName In Array("node", "nodejs")\\r\\n\' +\n' +
'            \'      subPath = pluginFolder.Path & "\\\\" & subName\\r\\n\' +\n' +
'            \'      If fso.FolderExists(subPath) Then fso.DeleteFolder subPath, True\\r\\n\' +\n' +
'            \'    Next\\r\\n\' +\n' +
'            \'  Next\\r\\n\' +\n' +
'            \'  On Error GoTo 0\\r\\n\' +\n' +
'            \'End If\\r\\n\' +\n' +
'            \'oShell.Run Chr(34) & "\' + nodeExe + \'" & Chr(34) & " " & Chr(34) & "\' + autostartPath + \'" & Chr(34) & " install", 0, False\\r\\n\' +\n' +
'            \'On Error Resume Next\\r\\n\' +\n' +
'            \'fso.DeleteFile WScript.ScriptFullName\\r\\n\' +\n' +
'            \'On Error GoTo 0\\r\\n\';\n' +
'        try { fs.writeFileSync(vbsPath, vbsContent, \'latin1\'); } catch (e) { log(\'Restart-VBS schreiben fehlgeschlagen: \' + e.message); return; }\n' +
'        var child = spawn(\'wscript.exe\', [\'//nologo\', vbsPath], { detached: true, stdio: \'ignore\', windowsHide: true });\n' +
'        child.unref();\n' +
'    }\n' +
'\n' +
'    setTimeout(function() { log(\'Status-Server beendet sich fuer Restart.\'); process.exit(0); }, 200);\n' +
'}\n' +
'\n' +
'var HTML_PAGE = \'<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LOTRO Death Tracker Status</title>\' +\n' +
'\'<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#1a1a2e;color:#e0e0e0;font-family:sans-serif;padding:16px;min-height:100vh}\' +\n' +
'\'h1{color:#c89b3c;font-size:1.1em;margin-bottom:14px;letter-spacing:.05em}h1 span{font-size:.75em;color:#888;font-weight:normal;margin-left:8px}\' +\n' +
'\'.status-grid{display:flex;flex-direction:column;gap:8px;margin-bottom:16px}\' +\n' +
'\'.status-item{display:flex;align-items:center;gap:10px;background:#16213e;border-radius:6px;padding:9px 12px}\' +\n' +
'\'.dot{width:12px;height:12px;border-radius:50%;flex-shrink:0;transition:background .4s}\' +\n' +
'\'.dot.green{background:#4caf50}.dot.red{background:#f44336}.dot.grey{background:#555}\' +\n' +
'\'.label{font-size:.9em;flex:1}.sublabel{font-size:.75em;color:#777}\' +\n' +
'\'#btn-restart{width:100%;padding:10px;border:none;border-radius:6px;font-size:.9em;cursor:pointer;transition:background .3s,opacity .3s}\' +\n' +
'\'#btn-restart.idle{background:#444;color:#aaa}#btn-restart.active{background:#e67e22;color:#fff}\' +\n' +
'\'#btn-restart:hover.active{background:#d35400}\' +\n' +
'\'#last-check{font-size:.72em;color:#555;text-align:right;margin-top:10px}\' +\n' +
'\'</style></head><body>\' +\n' +
'\'<h1>LOTRO Death Tracker <span>v3.0</span></h1>\' +\n' +
'\'<div class="status-grid">\' +\n' +
'\'<div class="status-item"><div class="dot grey" id="dot-watcher"></div><div><div class="label">Watcher</div><div class="sublabel">Prozess-Monitor</div></div></div>\' +\n' +
'\'<div class="status-item"><div class="dot grey" id="dot-client"></div><div><div class="label">Client</div><div class="sublabel">Daten-Sender (aktiv wenn LOTRO laeuft)</div></div></div>\' +\n' +
'\'<div class="status-item"><div class="dot grey" id="dot-plugin"></div><div><div class="label">Plugin</div><div class="sublabel">LOTRO Plugin installiert</div></div></div>\' +\n' +
'\'</div>\' +\n' +
'\'<button id="btn-restart" class="idle" onclick="doRestart()">Watcher neu starten</button>\' +\n' +
'\'<div id="last-check">Zuletzt geprueft: –</div>\' +\n' +
'\'<script>\' +\n' +
'\'function applyStatus(s){var states=["watcher","client","plugin"];for(var i=0;i<states.length;i++){var d=document.getElementById("dot-"+states[i]);if(d)d.className="dot "+(s[states[i]]?"green":"red");}var btn=document.getElementById("btn-restart");if(btn)btn.className=(s.watcher?"idle":"active");var lc=document.getElementById("last-check");if(lc&&s.lastCheck){var t=new Date(s.lastCheck);lc.textContent="Zuletzt geprueft: "+t.toLocaleTimeString("de-DE");}}\' +\n' +
'\'function poll(){fetch("/status").then(function(r){return r.json();}).then(function(s){applyStatus(s);}).catch(function(){});}\' +\n' +
'\'function doRestart(){if(!confirm("Watcher wirklich neu starten?"))return;fetch("/restart",{method:"POST"}).catch(function(){});setTimeout(function(){poll();},4000);}\' +\n' +
'\'poll();setInterval(poll,3000);\' +\n' +
'\'</script></body></html>\';\n' +
'\n' +
'acquireLock();\n' +
'\n' +
'var server = http.createServer(function(req, res) {\n' +
'    if (req.method === \'GET\' && req.url === \'/status\') {\n' +
'        var s = getStatus();\n' +
'        res.writeHead(200, { \'Content-Type\': \'application/json\', \'Access-Control-Allow-Origin\': \'*\' });\n' +
'        res.end(JSON.stringify(s));\n' +
'    } else if (req.method === \'POST\' && req.url === \'/restart\') {\n' +
'        doRestart(res);\n' +
'    } else {\n' +
'        res.writeHead(200, { \'Content-Type\': \'text/html; charset=utf-8\' });\n' +
'        res.end(HTML_PAGE);\n' +
'    }\n' +
'});\n' +
'\n' +
'function tryListen() {\n' +
'    server.listen(PORT, \'127.0.0.1\', function() {\n' +
'        log(\'Status-Server gestartet: http://localhost:\' + PORT);\n' +
'    });\n' +
'}\n' +
'\n' +
'server.on(\'error\', function(e) {\n' +
'    if (e.code === \'EADDRINUSE\' && portIndex < PORTS.length - 1) {\n' +
'        portIndex++;\n' +
'        PORT = PORTS[portIndex];\n' +
'        log(\'Port belegt – versuche Port \' + PORT + \'...\');\n' +
'        tryListen();\n' +
'    } else {\n' +
'        log(\'Port \' + PORT + \' Fehler: \' + e.message + \' – beende Status-Server.\');\n' +
'        process.exit(1);\n' +
'    }\n' +
'});\n' +
'\n' +
'tryListen();\n' +
'\n' +
'process.on(\'SIGINT\', function() { releaseLock(); process.exit(0); });\n' +
'process.on(\'SIGTERM\', function() { releaseLock(); process.exit(0); });\n' +
'process.on(\'exit\', function() { releaseLock(); });\n';

    fs.writeFileSync(STATUS_SERVER_JS, content, 'utf8');
    console.log('Status-Server-Script erstellt:', STATUS_SERVER_JS);
}

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
const USE_PRERELEASE   = false; // true = neuester Pre-Release wenn vorhanden; false = stabiler Release (Standard)
const VERSION_FILE     = path.join(__dirname, 'version.json');
const UPDATER_PATH     = path.join(__dirname, 'updater.js');
const PID_FILE         = path.join(__dirname, 'watcher.pid');
const LOCAL_DEATHS_FILE = path.join(__dirname, 'deaths.local.json');
const WP_API           = 'https://www.dodaswelt.de/wp-json/lotro-deaths/v1';

let clientProcess = null;
let checkInterval = null;
var prevLotroRunning = false;
var remindOnNextStart = false;
var lastStatusServerSpawn = 0; // Watchdog-Cooldown: max 1x pro Minute spawnen

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

// SYNC: getLotroPath ist 4x implementiert (client.js, updater.js, Watcher-Template, Status-Server-Template).
// Bei Aenderungen ALLE 4 Stellen synchron halten!
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

    // Warnung fuer Charaktere, die in deaths.local.json bekannt sind, aber kein State-File mehr haben.
    // Haeufigste Ursache: Charakter umbenannt oder LOTRO neu installiert.
    var foundCharNamesNorm = stateFiles.map(function(e) { return e.charName.toLowerCase().trim(); });
    Object.keys(localDeaths.characters).forEach(function(savedName) {
        if (foundCharNamesNorm.indexOf(savedName.toLowerCase().trim()) === -1) {
            log('syncLocalDeaths [' + savedName + ']: WARNUNG – kein State-File mehr gefunden. Charakter umbenannt oder LOTRO neu installiert?');
        }
    });

    // Charakter-Liste einmalig holen (statt N separate API-Aufrufe fuer N Charaktere)
    https.get(WP_API + '/characters', { headers: { 'User-Agent': 'LOTRO-Death-Tracker-Watcher' } }, function(res) {
        var data = '';
        res.on('data', function(c) { data += c; });
        res.on('end', function() {
            var parsed;
            try { parsed = JSON.parse(data); } catch (e) {
                log('syncLocalDeaths: Ungueltige API-Antwort – uebersprungen.');
                return;
            }
            if (!parsed || !parsed.success) {
                log('syncLocalDeaths: API-Fehler – uebersprungen.');
                return;
            }
            var chars = parsed.characters || [];

            var idx = 0;
            function processNext() {
                if (idx >= stateFiles.length) return;
                var entry = stateFiles[idx++];
                var charName = entry.charName;
                var currentPlugin = parseStateFile(entry.file);

                var charData = null;
                var charNameNorm = charName.toLowerCase().trim();
                for (var i = 0; i < chars.length; i++) {
                    if ((chars[i].characterName || '').toLowerCase().trim() === charNameNorm) { charData = chars[i]; break; }
                }
                var currentServer = charData ? parseInt(charData.totalDeaths, 10) : 0;

                if (!localDeaths.characters[charName]) {
                    localDeaths.characters[charName] = {
                        baselineServer: currentServer,
                        baselinePlugin: currentPlugin,
                        firstSeenAt: new Date().toISOString()
                    };
                    saveLocalDeaths(localDeaths);
                    log('syncLocalDeaths [' + charName + ']: Baseline gesetzt (Server: ' + currentServer + ', Plugin: ' + currentPlugin + ').');
                    processNext();
                    return;
                }

                var baselineServer = localDeaths.characters[charName].baselineServer;
                var baselinePlugin = localDeaths.characters[charName].baselinePlugin;

                // Migration: Alter Eintrag (vor v2.6) ohne baselinePlugin – Baseline neu setzen,
                // da ohne Plugin-Ausgangswert keine korrekte Differenzberechnung moeglich ist.
                if (baselinePlugin === undefined || baselinePlugin === null) {
                    localDeaths.characters[charName].baselineServer = currentServer;
                    localDeaths.characters[charName].baselinePlugin = currentPlugin;
                    saveLocalDeaths(localDeaths);
                    log('syncLocalDeaths [' + charName + ']: Baseline auf v2.6 migriert (Server: ' + currentServer + ', Plugin: ' + currentPlugin + ').');
                    processNext();
                    return;
                }

                // Schutzpruefung: Server-Stand kann normalerweise nicht sinken.
                // currentServer < baselineServer deutet auf DB-Reset oder Datenverlust hin.
                if (currentServer < baselineServer) {
                    var serverDelta = baselineServer - currentServer;
                    log('syncLocalDeaths [' + charName + ']: WARNUNG – Server-Stand (' + currentServer + ') liegt um ' + serverDelta + ' unter Baseline (' + baselineServer + '). Moeglicherweise wurde die Datenbank zurueckgesetzt oder Eintraege wurden geloescht. Baseline wird neu gesetzt – bitte DB-Stand pruefen!');
                    localDeaths.characters[charName].baselineServer = currentServer;
                    localDeaths.characters[charName].baselinePlugin = currentPlugin;
                    saveLocalDeaths(localDeaths);
                    processNext();
                    return;
                }

                var missing = (currentPlugin - baselinePlugin) - (currentServer - baselineServer);
                if (missing <= 0) {
                    log('syncLocalDeaths [' + charName + ']: Alles synchron (Plugin: ' + currentPlugin + '/' + baselinePlugin + ', Server: ' + currentServer + '/' + baselineServer + ').');
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
            }
            processNext();
        });
    }).on('error', function(e) {
        log('syncLocalDeaths: Netzwerkfehler – uebersprungen: ' + e.message);
    });
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

    const releaseApiPath = USE_PRERELEASE
        ? ('/repos/' + GITHUB_REPO + '/releases')
        : ('/repos/' + GITHUB_REPO + '/releases/latest');
    if (USE_PRERELEASE) log('Update-Check: Pre-Release-Modus aktiv – suche neuesten Pre-Release...');
    const req = https.request({
        hostname: 'api.github.com',
        path: releaseApiPath,
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
            try {
                const parsed = JSON.parse(data);
                if (USE_PRERELEASE && Array.isArray(parsed)) {
                    release = parsed.find(function(r) { return r.prerelease === true; }) || parsed[0];
                    if (!release) { log('Update-Check: keine Releases gefunden – uebersprungen'); return; }
                    log('Pre-Release-Modus: verwende ' + (release.prerelease ? 'Pre-Release' : 'stabiler Release') + ' ' + release.tag_name);
                } else {
                    release = parsed;
                }
            } catch (e) {
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

    const rootBase = 'https://raw.githubusercontent.com/' + GITHUB_REPO + '/v' + remoteVersion + '/';
    const scriptExt = process.platform === 'win32' ? '.bat' : '.sh';
    const filesToDownload = [
        { name: 'client.js',            dest: path.join(__dirname, 'client.js') },
        { name: 'install-autostart.js', dest: path.join(__dirname, 'install-autostart.js') },
        { name: 'package.json',         dest: path.join(__dirname, 'package.json') },
        { name: 'updater.js',           dest: UPDATER_PATH },
        { name: 'UNINSTALL' + scriptExt, dest: path.join(__dirname, 'UNINSTALL' + scriptExt), url: rootBase + 'UNINSTALL' + scriptExt },
        { name: 'REINSTALL' + scriptExt, dest: path.join(__dirname, 'REINSTALL' + scriptExt), url: rootBase + 'REINSTALL' + scriptExt },
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
        downloadRaw(f.url || (base + f.name), stagingPath, function(err) {
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

        // T3-C: Status-Server-Watchdog – prueft ob Status-Server noch lebt, spawnt ihn neu bei Bedarf
        // (max 1x pro Minute, um Spawn-Schleifen bei dauerhaftem Fehler zu vermeiden)
        var statusServerPidFile = path.join(__dirname, 'status-server.pid');
        var isStatusServerAlive = false;
        if (fs.existsSync(statusServerPidFile)) {
            try {
                var ssPid = parseInt(fs.readFileSync(statusServerPidFile, 'utf8').trim(), 10);
                if (ssPid) {
                    process.kill(ssPid, 0); // wirft ESRCH wenn Prozess tot
                    // node.exe-Check: Schutz vor PID-Wiederverwendung durch anderen Prozess
                    var isSsNode = false;
                    try {
                        if (process.platform === 'linux') {
                            var ssTc = spawnSync('ps', ['-p', String(ssPid), '-o', 'comm='], { encoding: 'utf8' });
                            if (ssTc.stdout && ssTc.stdout.toLowerCase().indexOf('node') !== -1) isSsNode = true;
                        } else {
                            var ssTc = spawnSync('tasklist', ['/FI', 'PID eq ' + ssPid, '/FO', 'CSV', '/NH'], { windowsHide: true, encoding: 'utf8' });
                            if (ssTc.stdout && ssTc.stdout.toLowerCase().indexOf('node.exe') !== -1) isSsNode = true;
                        }
                    } catch (_) {}
                    if (isSsNode) isStatusServerAlive = true;
                }
            } catch (_) {}
        }
        if (!isStatusServerAlive) {
            var ssNow = Date.now();
            if (ssNow - lastStatusServerSpawn > 60000) {
                lastStatusServerSpawn = ssNow;
                var statusServerPath = path.join(__dirname, 'lotro-status-server.js');
                if (fs.existsSync(statusServerPath)) {
                    log('Watchdog: Status-Server nicht erreichbar – starte neu...');
                    var ssSrv = spawn(process.execPath, [statusServerPath], {
                        detached: true,
                        stdio: 'ignore',
                        windowsHide: process.platform === 'win32'
                    });
                    ssSrv.unref();
                }
            }
        }
    });
}

log('=================================');
log('LOTRO Watcher gestartet');
log('Ueberwacht: ' + (process.platform === 'linux' ? 'lotroclient (pgrep) + proton/212500' : 'lotroclient64.exe & lotroclient.exe'));
log('Status-Seite: http://localhost:7890 (separater Prozess)');
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
    releaseLock();
    process.exit(0);
});

process.on('SIGTERM', () => {
    log('Watcher wird beendet...');
    if (checkInterval) clearInterval(checkInterval);
    stopClient();
    releaseLock();
    process.exit(0);
});

process.on('exit', function() { releaseLock(); });
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

// Erstelle VBS-Script zum unsichtbaren Start des Status-Servers (nur Windows)
function createStatusServerVBSScript() {
    if (IS_LINUX) return;
    const vbsContent = `Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """${process.execPath.replace(/\\/g, '\\\\')}"" ""${STATUS_SERVER_JS.replace(/\\/g, '\\\\')}"" ", 0, False
Set WshShell = Nothing`;

    fs.writeFileSync(STATUS_SERVER_VBS, vbsContent, 'utf8');
    console.log('✅ VBS-Start-Script (Status-Server) erstellt:', STATUS_SERVER_VBS);
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

        // T3-B: Zweiter Autostart-Eintrag fuer Status-Server
        createStatusServerScript();
        const ssDesktopContent = '[Desktop Entry]\nType=Application\nName=LOTRO Death Tracker Status\nExec="' + process.execPath + '" "' + STATUS_SERVER_JS + '"\nHidden=false\nNoDisplay=false\nX-GNOME-Autostart-enabled=true\n';
        fs.writeFileSync(STATUS_SHORTCUT_PATH, ssDesktopContent, 'utf8');
        console.log('XDG Autostart (Status-Server) erstellt: ' + STATUS_SHORTCUT_PATH);
        console.log('');

        const pidFilePath = path.join(__dirname, 'watcher.pid');
        if (fs.existsSync(pidFilePath)) {
            try {
                const oldPid = parseInt(fs.readFileSync(pidFilePath, 'utf8').trim(), 10);
                if (oldPid && oldPid !== process.pid) {
                    try { process.kill(oldPid, 'SIGTERM'); } catch (_) {}
                }
                fs.unlinkSync(pidFilePath);
            } catch (e) {}
        }

        // Laufenden Status-Server beenden
        const ssPidPath = path.join(__dirname, 'status-server.pid');
        if (fs.existsSync(ssPidPath)) {
            try {
                const ssPid = parseInt(fs.readFileSync(ssPidPath, 'utf8').trim(), 10);
                if (ssPid) { try { process.kill(ssPid, 'SIGTERM'); } catch (_) {} }
                fs.unlinkSync(ssPidPath);
            } catch (e) {}
        }

        const { spawn } = require('child_process');
        const watcher = spawn(process.execPath, [WATCHER_JS], { detached: true, stdio: 'ignore' });
        watcher.unref();

        // Status-Server starten
        createStatusServerScript();
        const statusSrv = spawn(process.execPath, [STATUS_SERVER_JS], { detached: true, stdio: 'ignore' });
        statusSrv.unref();

        console.log('Watcher gestartet!');
        console.log('');
        console.log('Status-Seite: http://localhost:7890');
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
        
        // Kopiere Watcher-VBS in Startup-Ordner
        fs.copyFileSync(WATCHER_VBS, SHORTCUT_PATH);
        console.log('✅ VBS (Watcher) kopiert nach:', SHORTCUT_PATH);

        // T3-B: Status-Server-VBS erstellen und in Startup-Ordner kopieren
        createStatusServerVBSScript();
        fs.copyFileSync(STATUS_SERVER_VBS, STATUS_SHORTCUT_PATH);
        console.log('✅ VBS (Status-Server) kopiert nach:', STATUS_SHORTCUT_PATH);
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

        // Laufenden Watcher beenden bevor ein neuer gestartet wird
        const pidFilePath = path.join(__dirname, 'watcher.pid');
        if (fs.existsSync(pidFilePath)) {
            try {
                const oldPid = parseInt(fs.readFileSync(pidFilePath, 'utf8').trim(), 10);
                if (oldPid && oldPid !== process.pid) {
                    const { spawnSync: _spawnSync } = require('child_process');
                    _spawnSync('taskkill', ['/F', '/PID', String(oldPid)], { windowsHide: true, stdio: 'ignore' });
                }
                fs.unlinkSync(pidFilePath);
            } catch (e) {}
        }

        // Laufenden Status-Server beenden
        const ssPidPath = path.join(__dirname, 'status-server.pid');
        if (fs.existsSync(ssPidPath)) {
            try {
                const ssPid = parseInt(fs.readFileSync(ssPidPath, 'utf8').trim(), 10);
                if (ssPid) {
                    const { spawnSync: _spawnSync2 } = require('child_process');
                    _spawnSync2('taskkill', ['/F', '/PID', String(ssPid)], { windowsHide: true, stdio: 'ignore' });
                }
                fs.unlinkSync(ssPidPath);
            } catch (e) {}
        }

        // Starte Watcher sofort im Hintergrund
        const { spawn } = require('child_process');
        const watcher = spawn(process.execPath, [WATCHER_JS], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        });
        watcher.unref();

        // Status-Server starten (Singleton-Lock verhindert Doppelstart)
        createStatusServerScript();
        const statusSrv = spawn(process.execPath, [STATUS_SERVER_JS], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        });
        statusSrv.unref();

        console.log('✅ Watcher läuft jetzt im Hintergrund!');
        console.log('');
        console.log('🎮 Du kannst jetzt sofort LOTRO starten:');
        console.log('   → Watcher erkennt LOTRO automatisch');
        console.log('   → Client startet automatisch');
        console.log('   → Keine weitere Aktion nötig!');
        console.log('');
        console.log('📊 Status-Seite (OBS Benutzerdefiniertes Browser-Dock):');
        console.log('   http://localhost:7890');
        console.log('   OBS → Docks → Benutzerdefinierte Browser-Docks → URL eingeben');
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
        console.log('XDG Autostart (Watcher) entfernt: ' + SHORTCUT_PATH);
    } else {
        console.log('XDG Autostart (Watcher) nicht gefunden.');
    }
    // T3-B: Status-Server XDG-Eintrag entfernen
    if (fs.existsSync(STATUS_SHORTCUT_PATH)) {
        fs.unlinkSync(STATUS_SHORTCUT_PATH);
        console.log('XDG Autostart (Status-Server) entfernt: ' + STATUS_SHORTCUT_PATH);
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
        
        // Lösche aus Startup-Ordner (Watcher)
        if (fs.existsSync(SHORTCUT_PATH)) {
            fs.unlinkSync(SHORTCUT_PATH);
            console.log('✅ Watcher-Autostart aus Startup-Ordner entfernt');
        } else {
            console.log('ℹ️  Watcher-Autostart nicht im Startup-Ordner gefunden');
        }

        // T3-B: Lösche Status-Server-Autostart aus Startup-Ordner
        if (fs.existsSync(STATUS_SHORTCUT_PATH)) {
            fs.unlinkSync(STATUS_SHORTCUT_PATH);
            console.log('✅ Status-Server-Autostart aus Startup-Ordner entfernt');
        }

        // Lösche lokale Scripts
        if (fs.existsSync(WATCHER_VBS)) {
            fs.unlinkSync(WATCHER_VBS);
            console.log('✅ VBS-Script (Watcher) gelöscht');
        }

        if (fs.existsSync(STATUS_SERVER_VBS)) {
            fs.unlinkSync(STATUS_SERVER_VBS);
            console.log('✅ VBS-Script (Status-Server) gelöscht');
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
