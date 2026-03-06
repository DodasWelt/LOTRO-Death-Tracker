/**
 * LOTRO Death Tracker - Data Fetcher
 * Version: 2.4
 *
 * Einfache JavaScript-Bibliothek zum Abrufen von LOTRO Character Death Daten
 * für die Integration in beliebige Webseiten.
 *
 * VERWENDUNG:
 * -----------
 * 1. Dieses Skript in die Website einbinden (jsDelivr CDN):
 *    <script src="https://cdn.jsdelivr.net/gh/DodasWelt/LOTRO-Death-Tracker@v2.4/Website/lotro-data-fetcher.js"></script>
 *
 * 2. Daten abrufen und verwenden:
 *    LOTROData.getLatestDeath().then(data => {
 *        console.log(data.characterName);
 *        console.log(data.level);
 *        console.log(data.deathCount);
 *    });
 *
 *    LOTROData.getCurrentCharacter().then(char => {
 *        console.log(char.characterName, 'Level', char.currentLevel, '– Tode:', char.totalDeaths);
 *    });
 */

const LOTROData = (function() {
    'use strict';

    // ============================================
    // KONFIGURATION
    // ============================================
    const CONFIG = {
        API_URL: 'https://www.dodaswelt.de/wp-json/lotro-deaths/v1'
    };

    // ============================================
    // API FUNKTIONEN
    // ============================================

    /**
     * Holt den neuesten Death aus der History (bereits angezeigt/verarbeitet).
     * @param {string} characterName - Optional: Filtere nach Charakter-Name
     * @returns {Promise<Object|null>} Formatiertes Death-Objekt oder null
     */
    async function getLatestDeath(characterName = null) {
        try {
            let url = `${CONFIG.API_URL}/history?limit=1`;
            if (characterName) {
                url += `&character=${encodeURIComponent(characterName)}`;
            }

            const response = await fetch(url);
            const data = await response.json();

            if (data.success && data.history && data.history.length > 0) {
                return formatDeathData(data.history[0]);
            }
            return null;
        } catch (error) {
            console.error('[LOTRO] Error fetching latest death:', error);
            return null;
        }
    }

    /**
     * Holt mehrere Deaths aus der History.
     * @param {number} limit - Maximale Anzahl (Standard: 10)
     * @param {string} characterName - Optional: Filtere nach Charakter-Name
     * @returns {Promise<Array>} Array von formatierten Death-Objekten
     */
    async function getAllDeaths(limit = 10, characterName = null) {
        try {
            let url = `${CONFIG.API_URL}/history?limit=${limit}`;
            if (characterName) {
                url += `&character=${encodeURIComponent(characterName)}`;
            }

            const response = await fetch(url);
            const data = await response.json();

            if (data.success && data.history) {
                return data.history.map(formatDeathData);
            }
            return [];
        } catch (error) {
            console.error('[LOTRO] Error fetching deaths:', error);
            return [];
        }
    }

    /**
     * Holt den aktuellen Charakter-Status: Name, aktuelles Level und Gesamtanzahl Tode.
     * Nutzt den /characters Endpoint für aktuelle Daten (wird auch bei Level-Ups aktualisiert).
     * @param {string} characterName - Optional: Filtere nach Charakter-Name
     * @returns {Promise<Object|null>} Character-Objekt oder null
     *   Enthält ab v2.1: race (z.B. "Hobbit"), characterClass (z.B. "Jäger") — kann null sein,
     *   wenn der Charakter noch kein Event seit v2.1 gesendet hat.
     */
    async function getCurrentCharacter(characterName = null) {
        try {
            const response = await fetch(`${CONFIG.API_URL}/characters`);
            const data = await response.json();

            if (!data.success || !data.characters || data.characters.length === 0) {
                return null;
            }

            if (characterName) {
                return data.characters.find(c => c.characterName === characterName) || null;
            }

            // Ohne Filter: zuletzt aktiver Charakter (API liefert nach last_seen DESC)
            return data.characters[0];
        } catch (error) {
            console.error('[LOTRO] Error fetching current character:', error);
            return null;
        }
    }

    /**
     * Holt Liste aller verfügbaren Characters mit Level und Todes-Statistiken.
     * @returns {Promise<Array>} Array von Character-Objekten
     *   Enthält ab v2.1: race (z.B. "Elb"), characterClass (z.B. "Runenbewahrer") — kann null sein.
     */
    async function getAllCharacters() {
        try {
            const response = await fetch(`${CONFIG.API_URL}/characters`);
            const data = await response.json();

            if (data.success && data.characters) {
                return data.characters;
            }
            return [];
        } catch (error) {
            console.error('[LOTRO] Error fetching characters:', error);
            return [];
        }
    }

    /**
     * Holt alle gemappten Streamer mit ihren aktuellen LOTRO-Stats.
     * Daten kommen aus dem /streamers Endpoint des WordPress-Plugins.
     * Die Zuordnung Twitch-Username → Charaktername wird im Plugin verwaltet.
     *
     * @returns {Promise<Array>} Array von Streamer-Objekten, sortiert nach Toden (absteigend)
     *
     * Jedes Objekt enthält:
     *   twitchUsername  – Twitch-Username (z.B. "DodasWelt")
     *   characterName   – LOTRO-Charaktername (z.B. "Dodaman")
     *   displayName     – Anzeigename (Standard: twitchUsername)
     *   race            – Volk des Charakters (z.B. "Hobbit")
     *   characterClass  – Klasse des Charakters (z.B. "Jäger")
     *   currentLevel    – Aktuelles Level
     *   totalDeaths     – Gesamtanzahl Tode
     *   lastSeen        – Letzter Zeitstempel als MySQL-DATETIME
     */
    async function getAllStreamers() {
        try {
            const response = await fetch(`${CONFIG.API_URL}/streamers`);
            const data = await response.json();

            if (data.success && data.streamers) {
                return data.streamers;
            }
            return [];
        } catch (error) {
            console.error('[LOTRO] Error fetching streamers:', error);
            return [];
        }
    }

    /**
     * Holt die LOTRO-Stats für einen einzelnen Streamer.
     * @param {string} twitchUsername – Twitch-Username (Groß-/Kleinschreibung egal)
     * @returns {Promise<Object|null>} Streamer-Objekt oder null
     */
    async function getStreamer(twitchUsername) {
        try {
            const streamers = await getAllStreamers();
            return streamers.find(
                s => s.twitchUsername.toLowerCase() === twitchUsername.toLowerCase()
            ) || null;
        } catch (error) {
            console.error('[LOTRO] Error fetching streamer:', error);
            return null;
        }
    }

    /**
     * Ruft Callback auf, sobald sich Streamer-Daten ändern (neuer Tod oder Level-Up).
     * Vergleicht totalDeaths + currentLevel aller Streamer, um Änderungen zu erkennen.
     *
     * @param {Function} callback   – Wird mit dem vollständigen Streamers-Array aufgerufen
     * @param {number}   interval   – Prüf-Intervall in ms (Standard: 60000 = 1 Minute)
     * @returns {number} Interval-ID zum Stoppen mit clearInterval()
     *
     * Beispiel (herrin-inge.de):
     *   LOTROData.watchStreamers(streamers => {
     *       // streamers-Array neu in React-State schreiben oder DOM updaten
     *       renderStreamerTable(streamers);
     *   }, 60000);
     */
    function watchStreamers(callback, interval = 60000) {
        let lastHash = null;

        const check = async () => {
            const streamers = await getAllStreamers();
            // Hash aus Deaths + Level aller Streamer – ändert sich nur bei echten Updates
            const hash = streamers
                .map(s => `${s.twitchUsername}:${s.totalDeaths}:${s.currentLevel}`)
                .join('|');

            if (hash !== lastHash) {
                lastHash = hash;
                callback(streamers);
            }
        };

        check(); // Sofort beim Start prüfen
        return setInterval(check, interval);
    }

    /**
     * Holt allgemeine Statistiken (Queue-Länge, Gesamttode, usw.).
     * @returns {Promise<Object|null>} Stats-Objekt oder null
     */
    async function getStats() {
        try {
            const response = await fetch(`${CONFIG.API_URL}/health`);
            const data = await response.json();

            if (data.status === 'online') {
                return {
                    totalDeaths:  data.totalDeaths  || 0,
                    queueLength:  data.queueLength  || 0,
                    characters:   data.characters   || 0,
                    version:      data.version      || 'unknown'
                };
            }
            return null;
        } catch (error) {
            console.error('[LOTRO] Error fetching stats:', error);
            return null;
        }
    }

    /**
     * Formatiert ein rohes Death-Objekt aus der API für einfachere Verwendung.
     * @private
     */
    function formatDeathData(death) {
        const deathCount = death.deathCount || 0;
        const level      = death.level      || 0;
        const region     = death.region     || 'Unknown';

        return {
            id:             death.id,
            characterName:  death.characterName,
            level:          level,
            deathCount:     deathCount,
            region:         region,
            race:           death.race           || null,
            characterClass: death.characterClass || null,
            date:           death.date,
            time:           death.time,
            datetime:       death.datetime,
            shownAt:        death.shownAt || null,
            // Fertige Anzeigetexte für direkte Verwendung.
            // SICHERHEIT: Nur mit element.textContent einsetzen, NIEMALS mit innerHTML –
            // die Werte stammen aus der API und könnten HTML-Zeichen enthalten.
            displayText: `${death.characterName} (Level ${level})`,
            fullText:    `${death.characterName} ist zum ${deathCount}. Mal auf Level ${level} in ${region} gefallen`
        };
    }

    // ============================================
    // HELPER FUNKTIONEN
    // ============================================

    /**
     * Ruft Callback auf, sobald ein neuer Death in der History erscheint.
     *
     * Hinweis: Der Callback wird **beim ersten Aufruf sofort** mit dem aktuell
     * neuesten Tod aus der History ausgelöst (da lastDeathId initial null ist).
     * Das ist beabsichtigt – so zeigt die Website beim Laden immer den letzten
     * bekannten Tod. Wenn nur neue Tode ab Seitenaufruf gewünscht sind, sollte
     * der erste Callback-Aufruf im Handler ignoriert werden.
     *
     * @param {Function} callback - Wird mit dem neuen Death-Objekt aufgerufen
     * @param {number} interval   - Prüf-Intervall in ms (Standard: 30000)
     * @returns {number} Interval-ID zum Stoppen mit clearInterval()
     */
    function watchForUpdates(callback, interval = 30000) {
        let lastDeathId = null;

        const checkForUpdates = async () => {
            const death = await getLatestDeath();
            if (death && death.id !== lastDeathId) {
                lastDeathId = death.id;
                callback(death);
            }
        };

        checkForUpdates(); // Sofort beim Start prüfen
        return setInterval(checkForUpdates, interval);
    }

    // ============================================
    // PUBLIC API
    // ============================================

    return {
        getLatestDeath:      getLatestDeath,
        getAllDeaths:         getAllDeaths,
        getCurrentCharacter: getCurrentCharacter,
        getAllCharacters:     getAllCharacters,
        getStats:            getStats,
        watchForUpdates:     watchForUpdates,

        // Streamer-spezifisch (für herrin-inge.de #tode / #teilnehmer)
        getAllStreamers:  getAllStreamers,
        getStreamer:      getStreamer,
        watchStreamers:  watchStreamers,

        // API-URL änderbar für andere Umgebungen
        setApiUrl: function(url) {
            CONFIG.API_URL = url;
        }
    };
})();

// Falls als ES6 Module verwendet
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LOTROData;
}
