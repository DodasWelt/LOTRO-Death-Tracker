<?php
/**
 * Plugin Name: LOTRO Death Tracker API
 * Plugin URI: https://dodaswelt.de
 * Description: Provides API endpoints for LOTRO death tracking and StreamElements integration
 * Version: 2.3
 * Author: DodasWelt
 * Author URI: https://dodaswelt.de
 * License: GPL v2 or later
 */

if (!defined('ABSPATH')) {
    exit;
}

class LOTRO_Death_Tracker {

    private $table_deaths;
    private $table_characters;
    private $table_mapping;
    private $table_deaths_test;
    private $table_characters_test;
    private $db_version = '2.1';

    public function __construct() {
        global $wpdb;
        $this->table_deaths           = $wpdb->prefix . 'lotro_deaths';
        $this->table_characters       = $wpdb->prefix . 'lotro_characters';
        $this->table_mapping          = $wpdb->prefix . 'lotro_streamer_mapping';
        $this->table_deaths_test      = $wpdb->prefix . 'lotro_deaths_test';
        $this->table_characters_test  = $wpdb->prefix . 'lotro_characters_test';

        register_activation_hook(__FILE__, array($this, 'activate'));
        add_action('plugins_loaded',                          array($this, 'maybe_upgrade'));
        add_action('rest_api_init',                           array($this, 'register_routes'));
        add_action('init',                                    array($this, 'add_cors_headers'));
        add_filter('pre_set_site_transient_update_plugins',   array($this, 'check_for_update'));
        add_filter('plugins_api',                             array($this, 'plugin_info'), 20, 3);
    }

    // -------------------------------------------------------------------------
    // Database setup & migration
    // -------------------------------------------------------------------------

    public function activate() {
        $this->create_tables();
    }

    /**
     * Runs on every page load but only executes create_tables() when the
     * stored DB version doesn't match $this->db_version.
     */
    public function maybe_upgrade() {
        $installed = get_option('lotro_death_tracker_db_version', '0');
        if ($installed !== $this->db_version) {
            $this->create_tables();
            update_option('lotro_death_tracker_db_version', $this->db_version);
        }
    }

    private function create_tables() {
        global $wpdb;
        $charset_collate = $wpdb->get_charset_collate();

        // Deaths queue – new columns: level, event_type, death_count
        $sql_deaths = "CREATE TABLE IF NOT EXISTS {$this->table_deaths} (
            id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            character_name VARCHAR(255) NOT NULL,
            level INT NOT NULL DEFAULT 0,
            event_type VARCHAR(20) NOT NULL DEFAULT 'death',
            death_count INT NOT NULL DEFAULT 0,
            death_date VARCHAR(50) NOT NULL DEFAULT '',
            death_time VARCHAR(50) NOT NULL DEFAULT '',
            death_datetime VARCHAR(100) NOT NULL DEFAULT '',
            region VARCHAR(255) DEFAULT 'Unknown Location',
            race VARCHAR(100) DEFAULT NULL,
            character_class VARCHAR(100) DEFAULT NULL,
            timestamp BIGINT(20) NOT NULL DEFAULT 0,
            received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            processed TINYINT(1) DEFAULT 0,
            shown_at DATETIME NULL,
            PRIMARY KEY  (id),
            INDEX idx_processed (processed),
            INDEX idx_timestamp (timestamp),
            INDEX idx_character (character_name)
        ) $charset_collate;";

        // Characters – tracks current level and cumulative death count
        $sql_characters = "CREATE TABLE IF NOT EXISTS {$this->table_characters} (
            id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            character_name VARCHAR(255) NOT NULL,
            current_level INT NOT NULL DEFAULT 0,
            total_deaths INT NOT NULL DEFAULT 0,
            race VARCHAR(100) DEFAULT NULL,
            character_class VARCHAR(100) DEFAULT NULL,
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY  (id),
            UNIQUE KEY uk_character_name (character_name)
        ) $charset_collate;";

        // Streamer mapping – Twitch username → LOTRO character name + static character info
        $sql_mapping = "CREATE TABLE IF NOT EXISTS {$this->table_mapping} (
            id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            twitch_username VARCHAR(255) NOT NULL,
            character_name VARCHAR(255) NOT NULL,
            display_name VARCHAR(255) DEFAULT NULL,
            race VARCHAR(100) DEFAULT NULL,
            character_class VARCHAR(100) DEFAULT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY uk_twitch (twitch_username),
            UNIQUE KEY uk_character (character_name)
        ) $charset_collate;";

        // Test tables – same schema, different names (no data migration, no mapping table)
        $sql_deaths_test = str_replace(
            array($this->table_deaths, 'INDEX idx_processed', 'INDEX idx_timestamp', 'INDEX idx_character'),
            array($this->table_deaths_test, 'INDEX idx_t_processed', 'INDEX idx_t_timestamp', 'INDEX idx_t_character'),
            $sql_deaths
        );
        $sql_characters_test = str_replace(
            $this->table_characters, $this->table_characters_test, $sql_characters
        );

        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql_deaths);
        dbDelta($sql_characters);
        dbDelta($sql_mapping);
        dbDelta($sql_deaths_test);
        dbDelta($sql_characters_test);

        // Safety net: dbDelta sometimes fails to ADD columns to existing tables.
        // Checks run for both prod and test deaths/characters tables.
        foreach (array($this->table_deaths, $this->table_deaths_test) as $_tbl) {
            $cols = $wpdb->get_col("SHOW COLUMNS FROM {$_tbl}");
            if (empty($cols)) continue;
            if (!in_array('level', $cols))           { $wpdb->query("ALTER TABLE {$_tbl} ADD COLUMN `level` INT NOT NULL DEFAULT 0 AFTER `character_name`"); }
            if (!in_array('event_type', $cols))      { $wpdb->query("ALTER TABLE {$_tbl} ADD COLUMN `event_type` VARCHAR(20) NOT NULL DEFAULT 'death' AFTER `level`"); }
            if (!in_array('death_count', $cols))     { $wpdb->query("ALTER TABLE {$_tbl} ADD COLUMN `death_count` INT NOT NULL DEFAULT 0 AFTER `event_type`"); }
            if (!in_array('race', $cols))            { $wpdb->query("ALTER TABLE {$_tbl} ADD COLUMN `race` VARCHAR(100) DEFAULT NULL AFTER `region`"); }
            if (!in_array('character_class', $cols)) { $wpdb->query("ALTER TABLE {$_tbl} ADD COLUMN `character_class` VARCHAR(100) DEFAULT NULL AFTER `race`"); }
        }

        foreach (array($this->table_characters, $this->table_characters_test) as $_tbl) {
            $cols = $wpdb->get_col("SHOW COLUMNS FROM {$_tbl}");
            if (empty($cols)) continue;
            if (!in_array('race', $cols))            { $wpdb->query("ALTER TABLE {$_tbl} ADD COLUMN `race` VARCHAR(100) DEFAULT NULL AFTER `total_deaths`"); }
            if (!in_array('character_class', $cols)) { $wpdb->query("ALTER TABLE {$_tbl} ADD COLUMN `character_class` VARCHAR(100) DEFAULT NULL AFTER `race`"); }
        }

        $existing_mapping = $wpdb->get_col("SHOW COLUMNS FROM {$this->table_mapping}");
        if (!empty($existing_mapping)) {
            if (!in_array('race', $existing_mapping)) {
                $wpdb->query("ALTER TABLE {$this->table_mapping} ADD COLUMN `race` VARCHAR(100) DEFAULT NULL AFTER `display_name`");
            }
            if (!in_array('character_class', $existing_mapping)) {
                $wpdb->query("ALTER TABLE {$this->table_mapping} ADD COLUMN `character_class` VARCHAR(100) DEFAULT NULL AFTER `race`");
            }
        }

        // Migrate existing death records into the characters table (einmalig).
        // A separate option flag ensures this runs exactly once, regardless of
        // how many times db_version is bumped in the future.
        $data_migrated = get_option('lotro_death_tracker_data_migration', '0');
        if ($data_migrated !== '1') {
            $wpdb->query("
                INSERT INTO {$this->table_characters}
                    (character_name, current_level, total_deaths, last_seen)
                SELECT
                    character_name,
                    COALESCE(MAX(level), 0),
                    COUNT(*),
                    MAX(received_at)
                FROM {$this->table_deaths}
                GROUP BY character_name
                ON DUPLICATE KEY UPDATE
                    total_deaths = GREATEST(total_deaths, VALUES(total_deaths)),
                    current_level = GREATEST(current_level, VALUES(current_level)),
                    last_seen     = GREATEST(last_seen,     VALUES(last_seen))
            ");
            update_option('lotro_death_tracker_data_migration', '1');
        }
    }

    // -------------------------------------------------------------------------
    // Auto-Update via GitHub Releases
    // -------------------------------------------------------------------------

    /**
     * Fetches the latest release info from GitHub. Result is cached for 12 hours
     * to stay within GitHub API rate limits (60 unauthenticated requests/hour).
     * Returns null on error so callers can gracefully skip the update check.
     */
    private function get_remote_version_info() {
        $cached = get_transient('lotro_death_tracker_update_info');
        if ($cached !== false) {
            return $cached;
        }

        $response = wp_remote_get(
            'https://api.github.com/repos/DodasWelt/LOTRO-Death-Tracker/releases/latest',
            array(
                'headers' => array('User-Agent' => 'LOTRO-Death-Tracker-WP/2.4'),
                'timeout' => 10,
            )
        );

        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
            // Cache negative result briefly so a broken API does not hammer GitHub.
            set_transient('lotro_death_tracker_update_info', null, 6 * HOUR_IN_SECONDS);
            return null;
        }

        $release = json_decode(wp_remote_retrieve_body($response));
        if (empty($release->tag_name)) {
            set_transient('lotro_death_tracker_update_info', null, 6 * HOUR_IN_SECONDS);
            return null;
        }

        $version = ltrim($release->tag_name, 'v'); // "v2.1" → "2.1"

        // Look for a dedicated WP plugin ZIP in the release assets.
        // The asset must be named "lotro-death-tracker*.zip" and contain the
        // plugin folder directly (lotro-death-tracker/lotro-death-tracker.php).
        $download_url = '';
        if (!empty($release->assets)) {
            foreach ($release->assets as $asset) {
                if (strpos($asset->name, 'lotro-death-tracker') !== false &&
                    substr($asset->name, -4) === '.zip') {
                    $download_url = $asset->browser_download_url;
                    break;
                }
            }
        }

        $info = (object) array(
            'version'      => $version,
            'url'          => $release->html_url,
            'download_url' => $download_url,
            'changelog'    => $release->body ?? '',
        );

        set_transient('lotro_death_tracker_update_info', $info, 12 * HOUR_IN_SECONDS);
        return $info;
    }

    /**
     * Hooked into pre_set_site_transient_update_plugins.
     * Injects our plugin into WordPress's update list when a newer version
     * is available on GitHub.
     */
    public function check_for_update($transient) {
        if (empty($transient->checked)) {
            return $transient;
        }

        $remote = $this->get_remote_version_info();
        if (!$remote || empty($remote->download_url)) {
            return $transient;
        }

        $plugin_file    = plugin_basename(__FILE__);
        $current_version = $transient->checked[$plugin_file] ?? '0';

        if (version_compare($remote->version, $current_version, '>')) {
            $transient->response[$plugin_file] = (object) array(
                'slug'         => 'lotro-death-tracker',
                'plugin'       => $plugin_file,
                'new_version'  => $remote->version,
                'url'          => $remote->url,
                'package'      => $remote->download_url,
                'requires'     => '5.0',
                'tested'       => '6.7',
                'requires_php' => '7.4',
            );
        }

        return $transient;
    }

    /**
     * Hooked into plugins_api.
     * Provides plugin details shown on the "View version details" popup in WP admin.
     */
    public function plugin_info($res, $action, $args) {
        if ($action !== 'plugin_information' || ($args->slug ?? '') !== 'lotro-death-tracker') {
            return $res;
        }

        $remote = $this->get_remote_version_info();
        if (!$remote) {
            return $res;
        }

        return (object) array(
            'name'          => 'LOTRO Death Tracker API',
            'slug'          => 'lotro-death-tracker',
            'version'       => $remote->version,
            'author'        => '<a href="https://dodaswelt.de">DodasWelt</a>',
            'homepage'      => 'https://github.com/DodasWelt/LOTRO-Death-Tracker',
            'requires'      => '5.0',
            'tested'        => '6.7',
            'requires_php'  => '7.4',
            'download_link' => $remote->download_url,
            'sections'      => array(
                'description' => 'REST API Plugin für LOTRO Death Tracking und StreamElements Integration.',
                'changelog'   => nl2br(esc_html($remote->changelog)),
            ),
        );
    }

    // -------------------------------------------------------------------------
    // CORS
    // -------------------------------------------------------------------------

    public function add_cors_headers() {
        // Only apply CORS headers to our own REST API routes, not all WP pages.
        $request_uri = $_SERVER['REQUEST_URI'] ?? '';
        if (strpos($request_uri, '/wp-json/lotro-deaths/') === false) {
            return;
        }

        header("Access-Control-Allow-Origin: *");
        header("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS");
        header("Access-Control-Allow-Headers: Content-Type, Authorization");

        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            status_header(200);
            exit();
        }
    }

    // -------------------------------------------------------------------------
    // Route registration
    // -------------------------------------------------------------------------

    public function register_routes() {
        $ns = 'lotro-deaths/v1';

        // Node.js client submits death or levelup events here
        register_rest_route($ns, '/death', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'api_submit_event'),
            'permission_callback' => '__return_true',
        ));

        // StreamElements overlay: fetch the current (oldest unprocessed) death
        register_rest_route($ns, '/death/current', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'api_get_current_death'),
            'permission_callback' => '__return_true',
        ));

        // StreamElements overlay: mark current death as shown and get next
        register_rest_route($ns, '/death/next', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'api_get_next_death'),
            'permission_callback' => '__return_true',
        ));

        // Watcher: silently insert missed deaths (processed=1, never shown in overlay)
        register_rest_route($ns, '/death/silent', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'api_submit_silent'),
            'permission_callback' => '__return_true',
        ));

        register_rest_route($ns, '/queue', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'api_get_queue'),
            'permission_callback' => '__return_true',
        ));

        register_rest_route($ns, '/history', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'api_get_history'),
            'permission_callback' => '__return_true',
        ));

        // Per-character stats (used by lotro-data-fetcher.js)
        register_rest_route($ns, '/characters', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'api_get_characters'),
            'permission_callback' => '__return_true',
        ));

        register_rest_route($ns, '/health', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'api_health_check'),
            'permission_callback' => '__return_true',
        ));

        // Streamer stats for herrin-inge.de: all mapped streamers with current LOTRO data
        register_rest_route($ns, '/streamers', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'api_get_streamers'),
            'permission_callback' => '__return_true',
        ));

        // Manage the Twitch-username → character-name mapping (requires WP admin or Application Password)
        register_rest_route($ns, '/streamers/mapping', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'api_set_mapping'),
            'permission_callback' => array($this, 'check_admin_permission'),
        ));

        register_rest_route($ns, '/streamers/mapping', array(
            'methods'             => 'DELETE',
            'callback'            => array($this, 'api_delete_mapping'),
            'permission_callback' => array($this, 'check_admin_permission'),
        ));

        // ── Test-Modus: schreibt in _test-Tabellen, liest aus _test-Tabellen ──
        // Kein Streamer-Filter; kein Mapping. Ideal für End-to-End-Tests ohne
        // Produktionsdaten zu berühren.
        register_rest_route($ns, '/test/death', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'api_test_submit_event'),
            'permission_callback' => '__return_true',
        ));
        register_rest_route($ns, '/test/death/current', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'api_test_get_current_death'),
            'permission_callback' => '__return_true',
        ));
        register_rest_route($ns, '/test/death/next', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'api_test_get_next_death'),
            'permission_callback' => '__return_true',
        ));
        register_rest_route($ns, '/test/queue', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'api_test_get_queue'),
            'permission_callback' => '__return_true',
        ));
        register_rest_route($ns, '/test/health', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'api_test_health_check'),
            'permission_callback' => '__return_true',
        ));
        register_rest_route($ns, '/test/clear', array(
            'methods'             => 'DELETE',
            'callback'            => array($this, 'api_test_clear'),
            'permission_callback' => array($this, 'check_admin_permission'),
        ));
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Atomically upsert the characters table and return the new total_deaths.
     * Uses INSERT … ON DUPLICATE KEY UPDATE to avoid race conditions.
     */
    private function upsert_character($character_name, $level, $is_death, $race = '', $character_class = '') {
        global $wpdb;

        if ($is_death) {
            $wpdb->query($wpdb->prepare(
                "INSERT INTO {$this->table_characters}
                    (character_name, current_level, total_deaths, race, character_class, last_seen)
                 VALUES (%s, %d, 1, %s, %s, NOW())
                 ON DUPLICATE KEY UPDATE
                    total_deaths    = total_deaths + 1,
                    current_level   = %d,
                    race            = COALESCE(NULLIF(%s, ''), race),
                    character_class = COALESCE(NULLIF(%s, ''), character_class),
                    last_seen       = NOW()",
                $character_name, $level, $race, $character_class,
                $level, $race, $character_class
            ));
        } else {
            // Level-up only: update level, do not touch death counter
            $wpdb->query($wpdb->prepare(
                "INSERT INTO {$this->table_characters}
                    (character_name, current_level, total_deaths, race, character_class, last_seen)
                 VALUES (%s, %d, 0, %s, %s, NOW())
                 ON DUPLICATE KEY UPDATE
                    current_level   = %d,
                    race            = COALESCE(NULLIF(%s, ''), race),
                    character_class = COALESCE(NULLIF(%s, ''), character_class),
                    last_seen       = NOW()",
                $character_name, $level, $race, $character_class,
                $level, $race, $character_class
            ));
        }

        return intval($wpdb->get_var($wpdb->prepare(
            "SELECT total_deaths FROM {$this->table_characters} WHERE character_name = %s",
            $character_name
        )));
    }

    /**
     * Formats a raw DB row into the standardised API death object.
     */
    private function format_death(array $row) {
        return array(
            'id'             => intval($row['id']),
            'characterName'  => $row['character_name'],
            'level'          => intval($row['level']),
            'deathCount'     => intval($row['death_count']),
            'date'           => $row['death_date'],
            'time'           => $row['death_time'],
            'datetime'       => $row['death_datetime'],
            'region'         => $row['region'],
            'race'           => $row['race'] ?? null,
            'characterClass' => $row['character_class'] ?? null,
        );
    }

    // -------------------------------------------------------------------------
    // API handlers
    // -------------------------------------------------------------------------

    /**
     * POST /death
     * Accepts both "death" and "levelup" events from the Node.js client.
     * – death   → queued in wp_lotro_deaths, character stats updated
     * – levelup → character level updated, nothing queued
     */
    public function api_submit_event($request) {
        global $wpdb;

        $params = $request->get_json_params();

        if (empty($params['characterName'])) {
            return new WP_Error('missing_fields', 'Required field: characterName', array('status' => 400));
        }

        $character_name  = sanitize_text_field($params['characterName']);
        $event_type      = sanitize_text_field($params['eventType'] ?? 'death');
        $level           = intval($params['level'] ?? 0);
        $race            = sanitize_text_field($params['race'] ?? '');
        $character_class = sanitize_text_field($params['characterClass'] ?? '');

        // ── Level-up: update character level, do not touch the death queue ──
        if ($event_type === 'levelup') {
            $this->upsert_character($character_name, $level, false, $race, $character_class);
            return rest_ensure_response(array(
                'success'       => true,
                'message'       => 'Level updated',
                'characterName' => $character_name,
                'level'         => $level,
            ));
        }

        // ── Death: read current count, INSERT first, then increment counter ──
        // Reading before INSERT ensures the counter is only updated when the
        // queue entry was actually created (avoids phantom increments on DB error).
        $current_deaths = intval($wpdb->get_var($wpdb->prepare(
            "SELECT total_deaths FROM {$this->table_characters} WHERE character_name = %s",
            $character_name
        )));
        $death_count = $current_deaths + 1;

        $result = $wpdb->insert(
            $this->table_deaths,
            array(
                'character_name'  => $character_name,
                'level'           => $level,
                'event_type'      => 'death',
                'death_count'     => $death_count,
                'death_date'      => sanitize_text_field($params['date'] ?? ''),
                'death_time'      => sanitize_text_field($params['time'] ?? ''),
                'death_datetime'  => sanitize_text_field($params['datetime'] ?? current_time('mysql')),
                'region'          => sanitize_text_field($params['region'] ?? 'Unknown Location'),
                'race'            => $race,
                'character_class' => $character_class,
                'timestamp'       => intval($params['timestamp'] ?? time()),
                'processed'       => 0,
            ),
            array('%s', '%d', '%s', '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%d', '%d')
        );

        if ($result === false) {
            return new WP_Error('db_error', 'Failed to save event.', array('status' => 500));
        }

        // INSERT succeeded → now safely update the character stats
        $this->upsert_character($character_name, $level, true, $race, $character_class);

        $queue_count = $wpdb->get_var("SELECT COUNT(*) FROM {$this->table_deaths} WHERE processed = 0");

        return rest_ensure_response(array(
            'success'       => true,
            'message'       => 'Death event queued',
            'queuePosition' => intval($queue_count),
            'deathCount'    => $death_count,
            'id'            => $wpdb->insert_id,
        ));
    }

    /**
     * POST /death/silent
     * Inserts N missed deaths with processed=1 (never shown in overlay).
     * Called by the watcher at startup to back-fill deaths that occurred while
     * the client was not running.
     * Body: { characterName, count, level, race, characterClass }
     */
    public function api_submit_silent($request) {
        global $wpdb;

        $params          = $request->get_json_params();
        $character_name  = sanitize_text_field($params['characterName'] ?? '');
        $count           = intval($params['count'] ?? 0);
        $level           = intval($params['level'] ?? 0);
        $race            = sanitize_text_field($params['race'] ?? '');
        $character_class = sanitize_text_field($params['characterClass'] ?? '');

        if (empty($character_name) || $count <= 0) {
            return new WP_Error('missing_fields', 'characterName and count > 0 required', array('status' => 400));
        }

        $inserted = 0;
        for ($i = 0; $i < $count; $i++) {
            $current_deaths = intval($wpdb->get_var($wpdb->prepare(
                "SELECT total_deaths FROM {$this->table_characters} WHERE character_name = %s",
                $character_name
            )));
            $death_count = $current_deaths + 1;

            $result = $wpdb->insert(
                $this->table_deaths,
                array(
                    'character_name'  => $character_name,
                    'level'           => $level,
                    'event_type'      => 'death',
                    'death_count'     => $death_count,
                    'death_date'      => current_time('Y-m-d'),
                    'death_time'      => current_time('H:i:s'),
                    'death_datetime'  => current_time('mysql'),
                    'region'          => 'Unknown Location',
                    'race'            => $race,
                    'character_class' => $character_class,
                    'timestamp'       => time(),
                    'processed'       => 1,
                    'shown_at'        => current_time('mysql'),
                ),
                array('%s', '%d', '%s', '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%d', '%d', '%s')
            );

            if ($result) {
                $this->upsert_character($character_name, $level, true, $race, $character_class);
                $inserted++;
            }
        }

        return rest_ensure_response(array(
            'success'  => true,
            'inserted' => $inserted,
        ));
    }

    /**
     * GET /death/current
     * Returns the oldest unprocessed death including level and deathCount.
     * Response key is "data" (matches overlay expectation).
     */
    public function api_get_current_death($request) {
        global $wpdb;

        $death = $wpdb->get_row(
            "SELECT * FROM {$this->table_deaths}
             WHERE processed = 0
             ORDER BY id ASC
             LIMIT 1",
            ARRAY_A
        );

        if (!$death) {
            return rest_ensure_response(array(
                'success'     => false,
                'message'     => 'No current death',
                'queueLength' => 0,
            ));
        }

        $queue_count = $wpdb->get_var("SELECT COUNT(*) FROM {$this->table_deaths} WHERE processed = 0");

        return rest_ensure_response(array(
            'success'     => true,
            'data'        => $this->format_death($death),
            'queueLength' => intval($queue_count),
        ));
    }

    /**
     * POST /death/next
     * Marks the current death as processed (shown) and returns the next one.
     * Response key is "data" (matches overlay expectation).
     */
    public function api_get_next_death($request) {
        global $wpdb;

        // Validate the ID sent by the overlay so only the matching entry is marked
        // as shown. This prevents blind queue-clearing by third parties.
        $params   = $request->get_json_params();
        $death_id = intval($params['id'] ?? 0);

        if ($death_id > 0) {
            $wpdb->query($wpdb->prepare(
                "UPDATE {$this->table_deaths}
                 SET processed = 1, shown_at = NOW()
                 WHERE processed = 0 AND id = %d
                 LIMIT 1",
                $death_id
            ));
        } else {
            // No ID provided – fall back to oldest unprocessed (backwards-compatible).
            $wpdb->query(
                "UPDATE {$this->table_deaths}
                 SET processed = 1, shown_at = NOW()
                 WHERE processed = 0
                 ORDER BY id ASC
                 LIMIT 1"
            );
        }

        $next = $wpdb->get_row(
            "SELECT * FROM {$this->table_deaths}
             WHERE processed = 0
             ORDER BY id ASC
             LIMIT 1",
            ARRAY_A
        );

        $queue_count = $wpdb->get_var("SELECT COUNT(*) FROM {$this->table_deaths} WHERE processed = 0");

        return rest_ensure_response(array(
            'success'     => true,
            'data'        => $next ? $this->format_death($next) : null,
            'queueLength' => intval($queue_count),
        ));
    }

    /**
     * GET /queue
     */
    public function api_get_queue($request) {
        global $wpdb;

        $queue = $wpdb->get_results(
            "SELECT * FROM {$this->table_deaths}
             WHERE processed = 0
             ORDER BY id ASC",
            ARRAY_A
        );

        return rest_ensure_response(array(
            'success' => true,
            'queue'   => array_map(array($this, 'format_death'), $queue),
            'length'  => count($queue),
        ));
    }

    /**
     * GET /history
     * Supports ?limit=N and ?character=Name query params.
     */
    public function api_get_history($request) {
        global $wpdb;

        $limit     = min(intval($request->get_param('limit')) ?: 10, 100);
        $character = sanitize_text_field($request->get_param('character') ?? '');

        if ($character) {
            $rows = $wpdb->get_results($wpdb->prepare(
                "SELECT * FROM {$this->table_deaths}
                 WHERE processed = 1 AND character_name = %s
                 ORDER BY shown_at DESC
                 LIMIT %d",
                $character, $limit
            ), ARRAY_A);

            $total = intval($wpdb->get_var($wpdb->prepare(
                "SELECT COUNT(*) FROM {$this->table_deaths} WHERE processed = 1 AND character_name = %s",
                $character
            )));
        } else {
            $rows = $wpdb->get_results($wpdb->prepare(
                "SELECT * FROM {$this->table_deaths}
                 WHERE processed = 1
                 ORDER BY shown_at DESC
                 LIMIT %d",
                $limit
            ), ARRAY_A);

            $total = intval($wpdb->get_var(
                "SELECT COUNT(*) FROM {$this->table_deaths} WHERE processed = 1"
            ));
        }

        $history = array_map(function($row) {
            $data            = $this->format_death($row);
            $data['shownAt'] = $row['shown_at'];
            return $data;
        }, $rows);

        return rest_ensure_response(array(
            'success' => true,
            'history' => $history,
            'total'   => $total,
        ));
    }

    /**
     * GET /characters
     * Returns all tracked characters with current level and total death count,
     * ordered by most recently active.
     */
    public function api_get_characters($request) {
        global $wpdb;

        $rows = $wpdb->get_results(
            "SELECT * FROM {$this->table_characters} ORDER BY last_seen DESC",
            ARRAY_A
        );

        $characters = array_map(function($row) {
            return array(
                'characterName'  => $row['character_name'],
                'currentLevel'   => intval($row['current_level']),
                'totalDeaths'    => intval($row['total_deaths']),
                'race'           => $row['race'] ?? null,
                'characterClass' => $row['character_class'] ?? null,
                'lastSeen'       => $row['last_seen'],
            );
        }, $rows);

        return rest_ensure_response(array(
            'success'    => true,
            'characters' => $characters,
            'total'      => count($characters),
        ));
    }

    /**
     * GET /health
     */
    public function api_health_check($request) {
        global $wpdb;

        $queue_count     = intval($wpdb->get_var("SELECT COUNT(*) FROM {$this->table_deaths} WHERE processed = 0"));
        $total_deaths    = intval($wpdb->get_var("SELECT COUNT(*) FROM {$this->table_deaths}"));
        $character_count = intval($wpdb->get_var("SELECT COUNT(*) FROM {$this->table_characters}"));

        return rest_ensure_response(array(
            'success'        => true,
            'status'         => 'online',
            'version'        => '2.1',
            'queueLength'    => $queue_count,
            'totalDeaths'    => $total_deaths,
            'characters'     => $character_count,
            'timestamp'      => current_time('mysql'),
        ));
    }
    // -------------------------------------------------------------------------
    // Test-Modus: Wrapper + Handler
    // -------------------------------------------------------------------------

    /**
     * Temporarily swaps prod table properties with test table names for the
     * duration of $fn(), then restores them. PHP is single-threaded per request,
     * so this is safe – no other request can see the temporary state.
     */
    private function with_test_tables(callable $fn) {
        $d = $this->table_deaths;
        $c = $this->table_characters;
        $this->table_deaths     = $this->table_deaths_test;
        $this->table_characters = $this->table_characters_test;
        $result = $fn();
        $this->table_deaths     = $d;
        $this->table_characters = $c;
        return $result;
    }

    public function api_test_submit_event($request) {
        return $this->with_test_tables(fn() => $this->api_submit_event($request));
    }

    public function api_test_get_current_death($request) {
        return $this->with_test_tables(fn() => $this->api_get_current_death($request));
    }

    public function api_test_get_next_death($request) {
        return $this->with_test_tables(fn() => $this->api_get_next_death($request));
    }

    public function api_test_get_queue($request) {
        return $this->with_test_tables(fn() => $this->api_get_queue($request));
    }

    public function api_test_health_check($request) {
        return $this->with_test_tables(fn() => $this->api_health_check($request));
    }

    /**
     * DELETE /test/clear  [Admin-Auth]
     * Leert beide Test-Tabellen vollständig. Produktionsdaten bleiben unangetastet.
     * Aufzurufen nach Abschluss eines Testlaufs.
     */
    public function api_test_clear($request) {
        global $wpdb;
        $wpdb->query("TRUNCATE TABLE {$this->table_deaths_test}");
        $wpdb->query("TRUNCATE TABLE {$this->table_characters_test}");
        return rest_ensure_response(array(
            'success' => true,
            'message' => 'Test-Tabellen geleert.',
            'tables'  => array($this->table_deaths_test, $this->table_characters_test),
        ));
    }

    // -------------------------------------------------------------------------
    // Streamer mapping
    // -------------------------------------------------------------------------

    /**
     * Permission callback: requires WordPress admin login or Application Password.
     */
    public function check_admin_permission($request) {
        return current_user_can('manage_options');
    }

    /**
     * GET /streamers
     * Returns all mapped streamers joined with their current LOTRO stats.
     * Used by herrin-inge.de to display the #tode and #teilnehmer sections.
     *
     * Response:
     *   { "success": true, "streamers": [ { "twitchUsername": "...", "characterName": "...",
     *     "displayName": "...", "currentLevel": N, "totalDeaths": N, "lastSeen": "..." } ] }
     */
    public function api_get_streamers($request) {
        global $wpdb;

        $rows = $wpdb->get_results(
            "SELECT
                m.twitch_username,
                m.character_name,
                m.display_name,
                m.race,
                m.character_class,
                COALESCE(c.current_level, 0) AS current_level,
                COALESCE(c.total_deaths, 0)  AS total_deaths,
                c.last_seen
             FROM {$this->table_mapping} m
             LEFT JOIN {$this->table_characters} c ON c.character_name = m.character_name
             ORDER BY total_deaths DESC, m.twitch_username ASC",
            ARRAY_A
        );

        $streamers = array_map(function($row) {
            return array(
                'twitchUsername'  => $row['twitch_username'],
                'characterName'   => $row['character_name'],
                'displayName'     => $row['display_name'] ?: $row['twitch_username'],
                'race'            => $row['race'],
                'characterClass'  => $row['character_class'],
                'currentLevel'    => intval($row['current_level']),
                'totalDeaths'     => intval($row['total_deaths']),
                'lastSeen'        => $row['last_seen'],
            );
        }, $rows);

        return rest_ensure_response(array(
            'success'   => true,
            'streamers' => $streamers,
            'total'     => count($streamers),
        ));
    }

    /**
     * POST /streamers/mapping
     * Add or update a Twitch-username → character-name mapping.
     * Requires WordPress admin or Application Password auth.
     *
     * Body: { "twitchUsername": "DodasWelt", "characterName": "Dodaman", "displayName": "DodasWelt",
     *         "race": "Hobbit", "characterClass": "Jäger" }
     */
    public function api_set_mapping($request) {
        global $wpdb;

        $params = $request->get_json_params();

        if (empty($params['twitchUsername']) || empty($params['characterName'])) {
            return new WP_Error('missing_fields', 'Required: twitchUsername, characterName', array('status' => 400));
        }

        $twitch    = sanitize_text_field($params['twitchUsername']);
        $character = sanitize_text_field($params['characterName']);
        $display   = sanitize_text_field($params['displayName'] ?? $twitch);
        $race      = sanitize_text_field($params['race'] ?? '');
        $char_class = sanitize_text_field($params['characterClass'] ?? '');

        $wpdb->query($wpdb->prepare(
            "INSERT INTO {$this->table_mapping} (twitch_username, character_name, display_name, race, character_class)
             VALUES (%s, %s, %s, %s, %s)
             ON DUPLICATE KEY UPDATE
                character_name  = VALUES(character_name),
                display_name    = VALUES(display_name),
                race            = VALUES(race),
                character_class = VALUES(character_class)",
            $twitch, $character, $display, $race, $char_class
        ));

        return rest_ensure_response(array(
            'success'        => true,
            'twitchUsername' => $twitch,
            'characterName'  => $character,
            'displayName'    => $display,
            'race'           => $race,
            'characterClass' => $char_class,
        ));
    }

    /**
     * DELETE /streamers/mapping
     * Remove a mapping by Twitch username.
     * Requires WordPress admin or Application Password auth.
     *
     * Body: { "twitchUsername": "DodasWelt" }
     */
    public function api_delete_mapping($request) {
        global $wpdb;

        $params = $request->get_json_params();

        if (empty($params['twitchUsername'])) {
            return new WP_Error('missing_fields', 'Required: twitchUsername', array('status' => 400));
        }

        $twitch = sanitize_text_field($params['twitchUsername']);

        $deleted = $wpdb->delete(
            $this->table_mapping,
            array('twitch_username' => $twitch),
            array('%s')
        );

        if ($deleted === false) {
            return new WP_Error('db_error', 'Failed to delete mapping', array('status' => 500));
        }

        return rest_ensure_response(array(
            'success'        => true,
            'deleted'        => $deleted > 0,
            'twitchUsername' => $twitch,
        ));
    }
}

new LOTRO_Death_Tracker();
