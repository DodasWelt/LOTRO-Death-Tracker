// LOTRO Death & Level Tracker - Client Component v2.4
// Monitors LOTRO plugin data and syncs to WordPress API
// Author: DodasWelt
// Version: 2.4

const fs = require('fs').promises;
const path = require('path');
const chokidar = require('chokidar');
const axios = require('axios');
const os = require('os');

// Configuration
const CONFIG = {
    serverUrl: process.env.SERVER_URL || 'https://www.dodaswelt.de/wp-json/lotro-deaths/v1/death',
    pollInterval: 1000,
    version: '2.4',
    autoRestart: false,
    logFile: path.join(__dirname, 'client.log')
};

// State
let lastProcessedTimestamp = 0;
const watchedFiles = new Set();

// Get LOTRO installation path
function getLOTROPath() {
    if (process.env.LOTRO_PATH) {
        return process.env.LOTRO_PATH;
    }

    const { execSync } = require('child_process');
    const fsSync = require('fs');
    const LOTRO_SUBDIR = 'The Lord of the Rings Online';

    // Schritt 1: Registry-Abfrage (zuverlaessigste Quelle - liefert echten Dokumente-Pfad)
    try {
        const output = execSync(
            'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders" /v Personal',
            { windowsHide: true, encoding: 'utf8' }
        );
        const match = output.match(/Personal\s+REG_SZ\s+(.+)/);
        if (match) {
            const candidate = path.join(match[1].trim(), LOTRO_SUBDIR);
            if (fsSync.existsSync(candidate)) return candidate;
        }
    } catch (_) {}

    // Schritt 2: OneDrive-Variante
    const oneDrivePath = path.join(os.homedir(), 'OneDrive', 'Documents', LOTRO_SUBDIR);
    if (fsSync.existsSync(oneDrivePath)) return oneDrivePath;

    // Schritt 3: Standard-Pfad als Fallback
    return path.join(os.homedir(), 'Documents', LOTRO_SUBDIR);
}

function formatLocalTime(d) {
    const pad = (n, w) => String(n).padStart(w || 2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + 'T' +
           pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '.' +
           pad(d.getMilliseconds(), 3);
}

// Logging function
async function log(message, level = 'info') {
    const timestamp = formatLocalTime(new Date());
    const emoji = {
        'info': 'ℹ️',
        'success': '✅',
        'warning': '⚠️',
        'error': '❌'
    }[level] || 'ℹ️';
    
    const logMessage = `[${timestamp}] ${emoji} ${message}`;
    console.log(logMessage);
    
    try {
        await fs.appendFile(CONFIG.logFile, logMessage + '\n');
    } catch (error) {
        // Ignore logging errors
    }
}

// Send event to server
async function sendEventToServer(eventData) {
    const eventTypeLabel = eventData.eventType === 'death' ? 'Death' : 'Level-up';
    
    try {
        log(`Sending ${eventTypeLabel} to server...`, 'info');
        
        const response = await axios.post(CONFIG.serverUrl, eventData, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
        
        if (response.data.success) {
            if (eventData.eventType === 'death' && response.data.queuePosition) {
                log(`Death successfully sent! Queue position: ${response.data.queuePosition}`, 'success');
            } else {
                log(`${eventTypeLabel} successfully sent!`, 'success');
            }
            return true;
        } else {
            log(`Server response not successful: ${JSON.stringify(response.data)}`, 'warning');
            return false;
        }
    } catch (error) {
        if (error.response) {
            log(`Server error (${error.response.status}): ${error.response.data.error || 'Unknown error'}`, 'error');
        } else if (error.request) {
            log(`Cannot reach server: ${error.message}`, 'error');
        } else {
            log(`Error sending event: ${error.message}`, 'error');
        }
        return false;
    }
}

// Parse Lua table format
function parseLuaTable(content) {
    try {
        // Remove "return " at the beginning and trim
        content = content.trim().replace(/^return\s+/, '');
        
        // Extract key-value pairs manually since Lua format is complex
        const result = {};
        
        // Match pattern: ["key"] = value
        // We need to handle:
        // - String values with quotes and escaped content: ["key"] = "value"
        // - Numeric values: ["key"] = 12345.678
        // - JSON strings: ["key"] = "{\"nested\":\"json\"}"
        
        const lines = content.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            // Skip empty lines and braces
            if (!trimmed || trimmed === '{' || trimmed === '}') continue;
            
            // Match: ["key"] = value pattern
            const match = trimmed.match(/\["([^"]+)"\]\s*=\s*(.+?)(?:,\s*)?$/);
            
            if (match) {
                const key = match[1];
                let value = match[2].trim();
                
                // Remove trailing comma if present
                if (value.endsWith(',')) {
                    value = value.substring(0, value.length - 1).trim();
                }
                
                // Determine value type
                if (value.startsWith('"') && value.endsWith('"')) {
                    // String value - remove outer quotes and unescape
                    value = value.substring(1, value.length - 1);
                    // The content field contains escaped JSON, keep it as-is
                } else {
                    // Numeric value - handle German decimal format (comma instead of dot)
                    value = value.replace(',', '.');
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue)) {
                        value = numValue;
                    }
                }
                
                result[key] = value;
            }
        }
        
        return result;
    } catch (error) {
        log(`Error parsing Lua table: ${error.message}`, 'error');
        log(`Content was: ${content.substring(0, 200)}...`, 'error');
        return null;
    }
}

// Process sync file
async function processSyncFile(filePath) {
    try {
        log(`Processing file: ${path.basename(filePath)}`, 'info');
        
        const content = await fs.readFile(filePath, 'utf8');
        const syncData = parseLuaTable(content);
        
        if (!syncData) {
            log(`Failed to parse sync data`, 'error');
            return;
        }
        
        // Check if this is a new event
        if (syncData.lastUpdate && syncData.lastUpdate > lastProcessedTimestamp) {
            const eventType = syncData.eventType || 'unknown';
            log(`New ${eventType} event detected!`, 'success');
            
            // Parse the event data (it's a JSON string in the content field)
            let eventData;
            try {
                // The content field is a string containing escaped JSON
                // We need to unescape it first by replacing \" with "
                const unescapedContent = syncData.content.replace(/\\"/g, '"');
                eventData = JSON.parse(unescapedContent);
            } catch (error) {
                log(`Error parsing event content: ${error.message}`, 'error');
                log(`Content was: ${syncData.content.substring(0, 200)}`, 'error');
                return;
            }
            
            // Calculate actual date and time (LOTRO uses game time, we need real time)
            const now = new Date();
            eventData.date = now.toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit', 
                year: 'numeric'
            });
            eventData.time = now.toLocaleTimeString('de-DE', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            eventData.datetime = `${eventData.date} ${eventData.time}`;
            eventData.timestamp = Math.floor(now.getTime() / 1000);
            
            log(`Character: ${eventData.characterName}, Level: ${eventData.level}, Type: ${eventData.eventType}`, 'info');
            
            // Send to server
            const success = await sendEventToServer(eventData);
            
            if (success) {
                lastProcessedTimestamp = syncData.lastUpdate;
            }
        } else {
            log(`Event already processed (timestamp: ${syncData.lastUpdate})`, 'info');
        }
    } catch (error) {
        log(`Error processing sync file: ${error.message}`, 'error');
    }
}

// Main function
async function main() {
    console.log('=================================');
    console.log('💀 LOTRO Event Tracker Client');
    console.log('⬆️ Tracking Deaths & Level-Ups');
    console.log(`📦 Version ${CONFIG.version}`);
    console.log('=================================');
    
    // Get LOTRO path
    const lotroPath = getLOTROPath();
    log(`LOTRO path: ${lotroPath}`, 'info');
    
    // Check if LOTRO directory exists
    try {
        await fs.access(lotroPath);
        log(`LOTRO directory found!`, 'success');
    } catch {
        log(`LOTRO directory not found at: ${lotroPath}`, 'error');
        log(`Please ensure the path is correct or set LOTRO_PATH environment variable`, 'warning');
        process.exit(1);
    }
    
    // Test server connection
    const healthUrl = CONFIG.serverUrl.replace('/death', '/health');
    log(`Testing connection to server: ${healthUrl}`, 'info');
    try {
        const response = await axios.get(healthUrl, { timeout: 5000 });
        if (response.data.success) {
            log(`Server connection verified!`, 'success');
        }
    } catch (error) {
        log(`Warning: Could not verify server connection`, 'warning');
        log(`Client will still run and retry on each event`, 'info');
    }
    
    // Watch for DeathTracker_Sync.plugindata files anywhere in PluginData
    const pluginDataPath = path.join(lotroPath, 'PluginData');
    
    // Check if PluginData exists
    try {
        await fs.access(pluginDataPath);
    } catch {
        log(`PluginData directory not found. Creating watch anyway...`, 'warning');
    }
    
    // Pattern to watch: any DeathTracker_Sync.plugindata file in any subdirectory
    const watchPattern = path.join(pluginDataPath, '**', 'DeathTracker_Sync.plugindata');
    
    log(`Watching for: ${watchPattern}`, 'info');
    
    const watcher = chokidar.watch(watchPattern, {
        persistent: true,
        ignoreInitial: true,  // DON'T process existing files on startup, only changes!
        awaitWriteFinish: {
            stabilityThreshold: 500,
            pollInterval: 100
        },
        depth: 99  // Watch deeply nested directories
    });
    
    watcher.on('add', async (filePath) => {
        log(`Sync file detected: ${filePath}`, 'success');
        await processSyncFile(filePath);
    });
    
    watcher.on('change', async (filePath) => {
        log(`Sync file changed: ${filePath}`, 'info');
        await processSyncFile(filePath);
    });
    
    watcher.on('error', (error) => {
        log(`Watcher error: ${error.message}`, 'error');
    });
    
    watcher.on('ready', () => {
        log(`=================================`, 'success');
        log(`Client is now running!`, 'success');
        log(`Waiting for death & level-up events...`, 'info');
        log(`Press Ctrl+C to stop`, 'info');
        log(`=================================`, 'success');
    });
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\n=================================');
        log(`Shutting down client...`, 'info');
        await watcher.close();
        log(`Client stopped`, 'success');
        console.log('=================================');
        process.exit(0);
    });
}

// Error handling
process.on('uncaughtException', async (error) => {
    await log(`Uncaught exception: ${error.message}`, 'error');
    if (CONFIG.autoRestart) {
        await log(`Restarting in 5 seconds...`, 'warning');
        setTimeout(() => {
            main().catch(console.error);
        }, 5000);
    } else {
        process.exit(1);
    }
});

// Start the client
main().catch(async (error) => {
    await log(`Fatal error: ${error.message}`, 'error');
    process.exit(1);
});
