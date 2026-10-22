<?php
/**
 * Plugin Name: LOTRO Death Tracker API
 * Plugin URI: https://dodaswelt.de
 * Description: Provides API endpoints for LOTRO death tracking, the stream overlay and streamer administration
 * Version: 3.1
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
    private $table_streamers;
    private $table_deaths_test;
    private $table_characters_test;
    private $db_version = '2.2';

    // Token-Abholfenster nach Anlegen/Zurücksetzen eines Streamers
    const CLAIM_DAYS = 7;
    // Overlay-Sendeplan: Länge eines Sendeplatzes, davon sichtbare Anzeige, Vorlauf
    const SLOT_MS    = 13000;
    const DISPLAY_MS = 10000;
    const LEAD_MS    = 4000;
    // Missbrauchsschutz
    const SILENT_MAX_COUNT = 20;
    const RATE_LIMIT_EVENTS = 30; // pro IP und Minute (POST /death)
    const RATE_LIMIT_SILENT = 5;  // pro IP und Minute (POST /death/silent)

    // Ergebnis von check_client_permission() für den nachfolgenden Handler
    private $auth_context = null;

    public function __construct() {
        global $wpdb;
        $this->table_deaths           = $wpdb->prefix . 'lotro_deaths';
        $this->table_characters       = $wpdb->prefix . 'lotro_characters';
        $this->table_mapping          = $wpdb->prefix . 'lotro_streamer_mapping';
        $this->table_streamers        = $wpdb->prefix . 'lotro_streamers';
        $this->table_deaths_test      = $wpdb->prefix . 'lotro_deaths_test';
        $this->table_characters_test  = $wpdb->prefix . 'lotro_characters_test';

        register_activation_hook(__FILE__, array($this, 'activate'));
        add_action('plugins_loaded',                          array($this, 'maybe_upgrade'));
        add_action('rest_api_init',                           array($this, 'register_routes'));
        add_action('init',                                    array($this, 'add_cors_headers'));
        add_filter('pre_set_site_transient_update_plugins',   array($this, 'check_for_update'));
        add_filter('plugins_api',                             array($this, 'plugin_info'), 20, 3);
        add_action('admin_menu',                              array($this, 'register_admin_page'));
        add_action('admin_post_lotro_dt',                     array($this, 'handle_admin_action'));
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
            show_at_ms BIGINT(20) NULL,
            PRIMARY KEY  (id),
            INDEX idx_processed (processed),
            INDEX idx_timestamp (timestamp),
            INDEX idx_character (character_name),
            INDEX idx_show_at (show_at_ms)
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

        // Streamers – one row per participant; holds the per-installation client token.
        // token_hash = SHA-256 of the token (plaintext is never stored).
        $sql_streamers = "CREATE TABLE IF NOT EXISTS {$this->table_streamers} (
            id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            twitch_username VARCHAR(100) NOT NULL,
            display_name VARCHAR(100) DEFAULT NULL,
            token_hash CHAR(64) DEFAULT NULL,
            token_claimed_at DATETIME NULL,
            claim_until DATETIME NULL,
            token_last_used DATETIME NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY  (id),
            UNIQUE KEY uk_twitch (twitch_username)
        ) $charset_collate;";

        // Test tables – same schema, different names (no data migration, no mapping table)
        $sql_deaths_test = str_replace(
            array($this->table_deaths, 'INDEX idx_processed', 'INDEX idx_timestamp', 'INDEX idx_character', 'INDEX idx_show_at'),
            array($this->table_deaths_test, 'INDEX idx_t_processed', 'INDEX idx_t_timestamp', 'INDEX idx_t_character', 'INDEX idx_t_show_at'),
            $sql_deaths
        );
        $sql_characters_test = str_replace(
            $this->table_characters, $this->table_characters_test, $sql_characters
        );

        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql_deaths);
        dbDelta($sql_characters);
        dbDelta($sql_mapping);
        dbDelta($sql_streamers);
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
            if (!in_array('show_at_ms', $cols))      { $wpdb->query("ALTER TABLE {$_tbl} ADD COLUMN `show_at_ms` BIGINT(20) NULL AFTER `shown_at`, ADD INDEX idx_show_at (show_at_ms)"); }
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

        // v3.1 (einmalig): Streamer aus der bisherigen Mapping-Tabelle übernehmen und
        // Alt-Einträge der früheren Quittier-Queue als gezeigt markieren (ohne Sendeplatz
        // würden sie sonst nie angezeigt und nie in der History landen).
        if (get_option('lotro_death_tracker_streamer_migration', '0') !== '1') {
            $claim_until = $this->claim_deadline();
            $wpdb->query($wpdb->prepare(
                "INSERT IGNORE INTO {$this->table_streamers} (twitch_username, display_name, claim_until)
                 SELECT twitch_username, display_name, %s FROM {$this->table_mapping}",
                $claim_until
            ));
            $wpdb->query($wpdb->prepare(
                "INSERT IGNORE INTO {$this->table_characters} (character_name, current_level, total_deaths, race, character_class, last_seen)
                 SELECT character_name, 0, 0, race, character_class, %s FROM {$this->table_mapping}",
                current_time('mysql')
            ));
            foreach (array($this->table_deaths, $this->table_deaths_test) as $_tbl) {
                $wpdb->query("UPDATE {$_tbl} SET processed = 1, shown_at = NOW() WHERE processed = 0 AND show_at_ms IS NULL");
            }
            update_option('lotro_death_tracker_streamer_migration', '1');
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
                'headers' => array('User-Agent' => 'LOTRO-Death-Tracker-WP/3.1'),
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
        header("Access-Control-Allow-Headers: Content-Type, Authorization, X-LOTRO-Token, X-LOTRO-Client");

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

        // Node.js client submits death or levelup events here [Streamer-Token]
        register_rest_route($ns, '/death', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'api_submit_event'),
            'permission_callback' => array($this, 'check_client_permission'),
        ));

        // Overlay polls this for the current/upcoming broadcast slot
        register_rest_route($ns, '/death/current', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'api_get_current_death'),
            'permission_callback' => '__return_true',
        ));

        // Deprecated since 3.1 (slot schedule replaces acknowledging). Kept as a
        // harmless no-op so the old StreamElements overlay keeps working.
        register_rest_route($ns, '/death/next', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'api_get_next_death'),
            'permission_callback' => '__return_true',
        ));

        // Watcher back-fills deaths that happened while the client was offline [Streamer-Token]
        register_rest_route($ns, '/death/silent', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'api_submit_silent'),
            'permission_callback' => array($this, 'check_client_permission'),
        ));

        register_rest_route($ns, '/history', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'api_get_history'),
            'permission_callback' => '__return_true',
        ));

        // All characters with current level and death statistics
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

        // Stream overlay (HTML) – one URL for all streamers, used as OBS browser source
        register_rest_route($ns, '/overlay', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'api_serve_overlay'),
            'permission_callback' => '__return_true',
        ));

        // Streamer mapping – public read for herrin-inge.de
        register_rest_route($ns, '/streamers', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'api_get_streamers'),
            'permission_callback' => '__return_true',
        ));

        // Streamer mapping – write operations require WP admin login or Application Password
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

        // ── Test-Endpunkte: nur aktiv, wenn im WP-Admin der Testmodus eingeschaltet ist.
        // Schreiben in _test-Tabellen; Streamer, Mapping und Tokens sind die echten.
        register_rest_route($ns, '/test/death', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'api_test_submit_event'),
            'permission_callback' => array($this, 'check_test_client_permission'),
        ));
        register_rest_route($ns, '/test/death/current', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'api_test_get_current_death'),
            'permission_callback' => array($this, 'check_test_mode'),
        ));
        register_rest_route($ns, '/test/death/next', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'api_test_get_next_death'),
            'permission_callback' => array($this, 'check_test_mode'),
        ));
        register_rest_route($ns, '/test/death/silent', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'api_test_submit_silent'),
            'permission_callback' => array($this, 'check_test_client_permission'),
        ));
        register_rest_route($ns, '/test/health', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'api_test_health_check'),
            'permission_callback' => array($this, 'check_test_mode'),
        ));
        register_rest_route($ns, '/test/clear', array(
            'methods'             => 'DELETE',
            'callback'            => array($this, 'api_test_clear'),
            'permission_callback' => array($this, 'check_admin_permission'),
        ));
    }

    // -------------------------------------------------------------------------
    // Security: client token, rate limit, input limits
    // -------------------------------------------------------------------------

    /**
     * Cloudflare edge ranges (https://www.cloudflare.com/ips/). Only when a request
     * arrives from one of these is the CF-Connecting-IP header trusted – otherwise
     * anyone could spoof it to dodge the rate limit.
     */
    private static $cloudflare_ranges = array(
        '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
        '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
        '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
        '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
        '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
        '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
    );

    public static function ip_in_cidr($ip, $cidr) {
        list($subnet, $bits) = explode('/', $cidr);
        $ip_bin     = @inet_pton($ip);
        $subnet_bin = @inet_pton($subnet);
        if ($ip_bin === false || $subnet_bin === false || strlen($ip_bin) !== strlen($subnet_bin)) {
            return false;
        }
        $bits  = intval($bits);
        $bytes = intdiv($bits, 8);
        if (substr($ip_bin, 0, $bytes) !== substr($subnet_bin, 0, $bytes)) {
            return false;
        }
        $rest = $bits % 8;
        if ($rest === 0) {
            return true;
        }
        $mask = (0xFF << (8 - $rest)) & 0xFF;
        return (ord($ip_bin[$bytes]) & $mask) === (ord($subnet_bin[$bytes]) & $mask);
    }

    public static function resolve_client_ip($remote_addr, $cf_connecting_ip) {
        if ($cf_connecting_ip !== '' && @inet_pton($cf_connecting_ip) !== false) {
            foreach (self::$cloudflare_ranges as $range) {
                if (self::ip_in_cidr($remote_addr, $range)) {
                    return $cf_connecting_ip;
                }
            }
        }
        return $remote_addr;
    }

    private function get_client_ip() {
        return self::resolve_client_ip(
            (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
            trim((string) ($_SERVER['HTTP_CF_CONNECTING_IP'] ?? ''))
        );
    }

    /**
     * Simple fixed-window limiter per IP and bucket via WP transients.
     */
    private function check_rate_limit($bucket, $limit) {
        $key  = 'lotro_rl_' . md5($bucket . '|' . $this->get_client_ip());
        $hits = intval(get_transient($key));
        if ($hits >= $limit) {
            return new WP_Error('rate_limited', 'Zu viele Anfragen – bitte kurz warten.', array('status' => 429));
        }
        set_transient($key, $hits + 1, MINUTE_IN_SECONDS);
        return true;
    }

    /** sanitize_text_field + hard length limit (DB columns are larger, but nothing legit is longer). */
    public static function clip($value, $max) {
        return mb_substr(sanitize_text_field((string) $value), 0, $max);
    }

    /** End of the token claim window, counted from now (WP timezone, MySQL format). */
    private function claim_deadline() {
        return wp_date('Y-m-d H:i:s', time() + self::CLAIM_DAYS * DAY_IN_SECONDS);
    }

    /**
     * permission_callback for POST /death and /death/silent.
     *
     * – Character not mapped to a streamer          → 403
     * – Streamer has a token                         → X-LOTRO-Token must match (401 otherwise)
     * – No token yet, client ≥ 3.1 (X-LOTRO-Client)  → allowed if the claim window is open;
     *                                                  the handler then issues the token.
     *                                                  Window expired → allowed without token while
     *                                                  "Alte Clients zulassen" is on, else 401
     * – No token yet, old client without header      → allowed while "Alte Clients zulassen" is on
     */
    public function check_client_permission($request) {
        global $wpdb;
        $this->auth_context = null;

        $is_silent = substr($request->get_route(), -7) === '/silent';
        $limited   = $is_silent
            ? $this->check_rate_limit('silent', self::RATE_LIMIT_SILENT)
            : $this->check_rate_limit('event', self::RATE_LIMIT_EVENTS);
        if (is_wp_error($limited)) {
            return $limited;
        }

        $params         = $request->get_json_params();
        $character_name = self::clip($params['characterName'] ?? '', 64);
        if ($character_name === '') {
            return new WP_Error('missing_fields', 'Required field: characterName', array('status' => 400));
        }

        $streamer = $wpdb->get_row($wpdb->prepare(
            "SELECT s.* FROM {$this->table_mapping} m
             JOIN {$this->table_streamers} s ON s.twitch_username = m.twitch_username
             WHERE m.character_name = %s
             LIMIT 1",
            $character_name
        ), ARRAY_A);

        if (!$streamer) {
            return new WP_Error('character_not_registered',
                'Charakter ist nicht angemeldet – bitte bei DodasWelt melden.', array('status' => 403));
        }

        $token  = trim((string) $request->get_header('X-LOTRO-Token'));
        $client = trim((string) $request->get_header('X-LOTRO-Client'));
        $now    = current_time('mysql');

        if (!empty($streamer['token_hash'])) {
            if ($token === '' || !hash_equals($streamer['token_hash'], hash('sha256', $token))) {
                return new WP_Error('invalid_token',
                    'Token fehlt oder ist ungültig – bitte Token bei DodasWelt zurücksetzen lassen.', array('status' => 401));
            }
            $wpdb->update($this->table_streamers, array('token_last_used' => $now), array('id' => $streamer['id']), array('%s'), array('%d'));
            $this->auth_context = array('streamer_id' => intval($streamer['id']), 'claim' => false);
            return true;
        }

        if ($client !== '') {
            if (!empty($streamer['claim_until']) && $streamer['claim_until'] >= $now) {
                $this->auth_context = array('streamer_id' => intval($streamer['id']), 'claim' => true);
                return true;
            }
            // Fenster abgelaufen: kein Token mehr vergeben, aber einen 3.1-Client nicht
            // schlechter stellen als einen alten Client, solange der Übergang aktiv ist.
            if (get_option('lotro_death_tracker_allow_legacy', '1') === '1') {
                $this->auth_context = array('streamer_id' => intval($streamer['id']), 'claim' => false);
                return true;
            }
            return new WP_Error('claim_expired',
                'Abholfenster für den Token ist abgelaufen – bitte Token bei DodasWelt zurücksetzen lassen.', array('status' => 401));
        }

        if (get_option('lotro_death_tracker_allow_legacy', '1') === '1') {
            $this->auth_context = array('streamer_id' => intval($streamer['id']), 'claim' => false);
            return true;
        }
        return new WP_Error('client_outdated',
            'Client-Version zu alt – bitte LOTRO Death Tracker aktualisieren.', array('status' => 401));
    }

    /**
     * Issues the streamer's token if check_client_permission() allowed a claim.
     * The UPDATE only succeeds while token_hash is still NULL, so concurrent first
     * requests (client + watcher) can never produce two tokens. Returns the
     * plaintext token exactly once, or null.
     */
    private function maybe_claim_token() {
        global $wpdb;
        if (empty($this->auth_context['claim'])) {
            return null;
        }
        $this->auth_context['claim'] = false;

        $token = bin2hex(random_bytes(32));
        $now   = current_time('mysql');
        $rows  = $wpdb->query($wpdb->prepare(
            "UPDATE {$this->table_streamers}
             SET token_hash = %s, token_claimed_at = %s, token_last_used = %s
             WHERE id = %d AND token_hash IS NULL AND claim_until >= %s",
            hash('sha256', $token), $now, $now, $this->auth_context['streamer_id'], $now
        ));
        return $rows === 1 ? $token : null;
    }

    public function check_test_mode($request) {
        if (get_option('lotro_death_tracker_test_mode', '0') !== '1') {
            return new WP_Error('rest_no_route', 'Testmodus ist deaktiviert.', array('status' => 404));
        }
        return true;
    }

    public function check_test_client_permission($request) {
        $mode = $this->check_test_mode($request);
        return is_wp_error($mode) ? $mode : $this->check_client_permission($request);
    }

    // -------------------------------------------------------------------------
    // Overlay slot schedule
    // -------------------------------------------------------------------------

    private function now_ms() {
        return (int) round(microtime(true) * 1000);
    }

    /**
     * Next free broadcast slot: now + lead time, or right after the last slot.
     * Callers must hold the slot lock (see api_submit_event).
     */
    private function next_slot_ms() {
        global $wpdb;
        $start = $this->now_ms() + self::LEAD_MS;
        $last  = $wpdb->get_var("SELECT MAX(show_at_ms) FROM {$this->table_deaths}");
        if ($last !== null) {
            $start = max($start, intval($last) + self::SLOT_MS);
        }
        return $start;
    }

    /**
     * Marks deaths whose slot is over as shown (processed=1). Keeps History and
     * herrin-inge.de working, which only list processed entries.
     */
    private function finalize_shown() {
        global $wpdb;
        $wpdb->query($wpdb->prepare(
            "UPDATE {$this->table_deaths}
             SET processed = 1, shown_at = FROM_UNIXTIME(show_at_ms DIV 1000)
             WHERE processed = 0 AND show_at_ms IS NOT NULL AND show_at_ms <= %d",
            $this->now_ms() - self::SLOT_MS
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
            'showAt'         => isset($row['show_at_ms']) ? intval($row['show_at_ms']) : null,
        );
    }

    // -------------------------------------------------------------------------
    // API handlers
    // -------------------------------------------------------------------------

    /**
     * POST /death  [Streamer-Token, see check_client_permission()]
     * Accepts both "death" and "levelup" events from the Node.js client.
     * – death   → gets the next overlay slot in wp_lotro_deaths, character stats updated
     * – levelup → character level updated, nothing scheduled
     * A newly issued token is returned once as "authToken".
     */
    public function api_submit_event($request) {
        global $wpdb;

        $params = $request->get_json_params();

        $character_name  = self::clip($params['characterName'] ?? '', 64);
        $event_type      = sanitize_text_field($params['eventType'] ?? 'death');
        $level           = intval($params['level'] ?? 0);
        $race            = self::clip($params['race'] ?? '', 50);
        $character_class = self::clip($params['characterClass'] ?? '', 50);

        if ($event_type !== 'death' && $event_type !== 'levelup') {
            return new WP_Error('invalid_event', 'eventType must be "death" or "levelup"', array('status' => 400));
        }
        if ($level < 0 || $level > 200) {
            return new WP_Error('invalid_level', 'level must be between 0 and 200', array('status' => 400));
        }

        // ── Level-up: update character level, do not touch the death schedule ──
        if ($event_type === 'levelup') {
            $this->upsert_character($character_name, $level, false, $race, $character_class);
            return rest_ensure_response($this->with_auth_token(array(
                'success'       => true,
                'message'       => 'Level updated',
                'characterName' => $character_name,
                'level'         => $level,
            )));
        }

        // ── Death: read current count, INSERT first, then increment counter ──
        // Reading before INSERT ensures the counter is only updated when the
        // entry was actually created (avoids phantom increments on DB error).
        // The slot lock serialises concurrent deaths (same slot, same death_count)
        // until the character counter has been incremented.
        $lock = 'lotro_dt_slot_' . $this->table_deaths;
        $wpdb->get_var($wpdb->prepare("SELECT GET_LOCK(%s, 5)", $lock));

        $current_deaths = intval($wpdb->get_var($wpdb->prepare(
            "SELECT total_deaths FROM {$this->table_characters} WHERE character_name = %s",
            $character_name
        )));
        $death_count = $current_deaths + 1;
        $show_at_ms  = $this->next_slot_ms();

        $result = $wpdb->insert(
            $this->table_deaths,
            array(
                'character_name'  => $character_name,
                'level'           => $level,
                'event_type'      => 'death',
                'death_count'     => $death_count,
                'death_date'      => self::clip($params['date'] ?? '', 50),
                'death_time'      => self::clip($params['time'] ?? '', 50),
                'death_datetime'  => self::clip($params['datetime'] ?? current_time('mysql'), 50),
                'region'          => self::clip($params['region'] ?? 'Unknown Location', 100),
                'race'            => $race,
                'character_class' => $character_class,
                'timestamp'       => intval($params['timestamp'] ?? time()),
                'processed'       => 0,
                'show_at_ms'      => $show_at_ms,
            ),
            array('%s', '%d', '%s', '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%d', '%d', '%d')
        );
        $insert_id = $wpdb->insert_id;

        // INSERT succeeded → now safely update the character stats
        if ($result !== false) {
            $this->upsert_character($character_name, $level, true, $race, $character_class);
        }

        $wpdb->get_var($wpdb->prepare("SELECT RELEASE_LOCK(%s)", $lock));

        if ($result === false) {
            return new WP_Error('db_error', 'Failed to save event.', array('status' => 500));
        }

        $this->finalize_shown();
        $queue_count = $wpdb->get_var("SELECT COUNT(*) FROM {$this->table_deaths} WHERE processed = 0");

        return rest_ensure_response($this->with_auth_token(array(
            'success'       => true,
            'message'       => 'Death event queued',
            'queuePosition' => intval($queue_count),
            'deathCount'    => $death_count,
            'id'            => $insert_id,
            'showAt'        => $show_at_ms,
        )));
    }

    /** Adds "authToken" to a response if this request just claimed the streamer's token. */
    private function with_auth_token(array $response) {
        $token = $this->maybe_claim_token();
        if ($token !== null) {
            $response['authToken'] = $token;
        }
        return $response;
    }

    /**
     * POST /death/silent  [Streamer-Token]
     * Inserts N missed deaths with processed=1 (never shown in overlay).
     * Called by the watcher at startup to back-fill deaths that occurred while
     * the client was not running. count is capped at SILENT_MAX_COUNT per request;
     * the watcher catches up on the remainder at its next start.
     * Body: { characterName, count, level, race, characterClass }
     */
    public function api_submit_silent($request) {
        global $wpdb;

        $params          = $request->get_json_params();
        $character_name  = self::clip($params['characterName'] ?? '', 64);
        $count           = min(intval($params['count'] ?? 0), self::SILENT_MAX_COUNT);
        $level           = intval($params['level'] ?? 0);
        $race            = self::clip($params['race'] ?? '', 50);
        $character_class = self::clip($params['characterClass'] ?? '', 50);

        if (empty($character_name) || $count <= 0) {
            return new WP_Error('missing_fields', 'characterName and count > 0 required', array('status' => 400));
        }
        if ($level < 0 || $level > 200) {
            return new WP_Error('invalid_level', 'level must be between 0 and 200', array('status' => 400));
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

        return rest_ensure_response($this->with_auth_token(array(
            'success'  => true,
            'inserted' => $inserted,
        )));
    }

    /**
     * GET /death/current
     * Returns the death whose overlay slot is running now or comes next, plus the
     * following slots. All overlays use serverTime to align their clocks and show
     * the same death at the same moment – nothing is acknowledged by the overlay.
     * Response key is "data" (also understood by the old StreamElements overlay).
     */
    public function api_get_current_death($request) {
        global $wpdb;

        $this->finalize_shown();
        $now = $this->now_ms();

        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$this->table_deaths}
             WHERE processed = 0 AND show_at_ms IS NOT NULL AND show_at_ms > %d
             ORDER BY show_at_ms ASC
             LIMIT 5",
            $now - self::SLOT_MS
        ), ARRAY_A);

        $slots = array_map(array($this, 'format_death'), $rows);
        $queue_count = intval($wpdb->get_var("SELECT COUNT(*) FROM {$this->table_deaths} WHERE processed = 0"));

        $response = array(
            'success'     => !empty($slots),
            'data'        => $slots ? $slots[0] : null,
            'upcoming'    => $slots,
            'queueLength' => $queue_count,
            'serverTime'  => $now,
            'slotMs'      => self::SLOT_MS,
            'displayMs'   => self::DISPLAY_MS,
        );
        if (!$slots) {
            $response['message'] = 'No current death';
        }

        $res = rest_ensure_response($response);
        $res->header('Cache-Control', 'no-store');
        return $res;
    }

    /**
     * POST /death/next  [deprecated since 3.1]
     * No-op: deaths are marked as shown automatically when their slot ends.
     * Kept so the old StreamElements overlay does not error out.
     */
    public function api_get_next_death($request) {
        return rest_ensure_response(array(
            'success'     => true,
            'data'        => null,
            'queueLength' => 0,
            'deprecated'  => 'POST /death/next is no longer needed (overlay slot schedule).',
        ));
    }

    /**
     * GET /overlay
     * Serves the stream overlay (overlay.html next to this file) as a normal web
     * page so every streamer can add the same URL as OBS browser source.
     */
    public function api_serve_overlay($request) {
        $file = __DIR__ . '/overlay.html';
        if (!is_readable($file)) {
            return new WP_Error('overlay_missing', 'overlay.html fehlt im Plugin-Verzeichnis.', array('status' => 404));
        }
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: no-cache');
        readfile($file);
        exit;
    }

    /**
     * GET /history
     * Supports ?limit=N and ?character=Name query params.
     */
    public function api_get_history($request) {
        global $wpdb;

        $this->finalize_shown();

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

        $this->finalize_shown();

        $queue_count     = intval($wpdb->get_var("SELECT COUNT(*) FROM {$this->table_deaths} WHERE processed = 0"));
        $total_deaths    = intval($wpdb->get_var("SELECT COUNT(*) FROM {$this->table_deaths}"));
        $character_count = intval($wpdb->get_var("SELECT COUNT(*) FROM {$this->table_characters}"));

        return rest_ensure_response(array(
            'success'        => true,
            'status'         => 'online',
            'version'        => '3.1',
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

    public function api_test_submit_silent($request) {
        return $this->with_test_tables(fn() => $this->api_submit_silent($request));
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
                COALESCE(NULLIF(s.display_name, ''), m.display_name) AS display_name,
                COALESCE(NULLIF(m.race, ''), c.race)                    AS race,
                COALESCE(NULLIF(m.character_class, ''), c.character_class) AS character_class,
                COALESCE(c.current_level, 0) AS current_level,
                COALESCE(c.total_deaths, 0)  AS total_deaths,
                c.last_seen
             FROM {$this->table_mapping} m
             LEFT JOIN {$this->table_streamers} s ON s.twitch_username = m.twitch_username
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

        $twitch    = self::clip($params['twitchUsername'], 100);
        $character = self::clip($params['characterName'], 64);
        $display   = self::clip($params['displayName'] ?? $twitch, 100);
        $race      = self::clip($params['race'] ?? '', 50);
        $char_class = self::clip($params['characterClass'] ?? '', 50);

        // Streamer and character rows are created on the fly (admin page uses the same tables)
        $wpdb->query($wpdb->prepare(
            "INSERT INTO {$this->table_streamers} (twitch_username, display_name, claim_until)
             VALUES (%s, %s, %s)
             ON DUPLICATE KEY UPDATE display_name = VALUES(display_name)",
            $twitch, $display, $this->claim_deadline()
        ));
        $wpdb->query($wpdb->prepare(
            "INSERT IGNORE INTO {$this->table_characters} (character_name, current_level, total_deaths, race, character_class, last_seen)
             VALUES (%s, 0, 0, %s, %s, %s)",
            $character, $race, $char_class, current_time('mysql')
        ));

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
     * Remove a mapping by Twitch username. The streamer itself (incl. token) and the
     * character's statistics are kept; delete them on the admin page if needed.
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

    // -------------------------------------------------------------------------
    // Admin page: Streamer, Charaktere, Zuordnung, Tokens, Einstellungen
    // -------------------------------------------------------------------------

    private static $races   = array('Mensch', 'Elb', 'Zwerg', 'Hobbit', 'Beorninger', 'Hochelb', 'Stark-Axt', 'Fluss-Hobbit');
    private static $classes = array('Wächter', 'Hauptmann', 'Barde', 'Schurke', 'Jäger', 'Waffenmeister', 'Kundiger',
                                    'Runenbewahrer', 'Hüter', 'Beorninger', 'Schläger', 'Seefahrer');

    public function register_admin_page() {
        add_menu_page(
            'LOTRO Death Tracker',
            'LOTRO Tracker',
            'manage_options',
            'lotro-death-tracker',
            array($this, 'render_admin_page'),
            'dashicons-shield',
            80
        );
    }

    private function admin_notice($type, $text) {
        set_transient('lotro_dt_notice_' . get_current_user_id(), array($type, $text), 60);
    }

    /**
     * admin-post.php?action=lotro_dt – every form on the admin page posts here.
     */
    public function handle_admin_action() {
        global $wpdb;

        if (!current_user_can('manage_options')) {
            wp_die('Keine Berechtigung.', 403);
        }
        check_admin_referer('lotro_dt_admin');

        $do  = sanitize_key($_POST['do'] ?? '');
        $now = current_time('mysql');

        switch ($do) {
            case 'save_settings':
                update_option('lotro_death_tracker_test_mode', empty($_POST['test_mode']) ? '0' : '1');
                update_option('lotro_death_tracker_allow_legacy', empty($_POST['allow_legacy']) ? '0' : '1');
                $this->admin_notice('success', 'Einstellungen gespeichert.');
                break;

            case 'add_streamer':
                $twitch  = self::clip(wp_unslash($_POST['twitch_username'] ?? ''), 100);
                $display = self::clip(wp_unslash($_POST['display_name'] ?? ''), 100);
                if ($twitch === '') {
                    $this->admin_notice('error', 'Twitch-Name fehlt.');
                    break;
                }
                $ok = $wpdb->insert($this->table_streamers, array(
                    'twitch_username' => $twitch,
                    'display_name'    => $display !== '' ? $display : $twitch,
                    'claim_until'     => $this->claim_deadline(),
                ), array('%s', '%s', '%s'));
                $ok
                    ? $this->admin_notice('success', "Streamer „{$twitch}“ angelegt. Token kann " . self::CLAIM_DAYS . ' Tage lang abgeholt werden.')
                    : $this->admin_notice('error', "Streamer „{$twitch}“ existiert bereits.");
                break;

            case 'delete_streamer':
                $id = intval($_POST['streamer_id'] ?? 0);
                $twitch = $wpdb->get_var($wpdb->prepare("SELECT twitch_username FROM {$this->table_streamers} WHERE id = %d", $id));
                if ($twitch !== null) {
                    $wpdb->delete($this->table_mapping, array('twitch_username' => $twitch), array('%s'));
                    $wpdb->delete($this->table_streamers, array('id' => $id), array('%d'));
                    $this->admin_notice('success', "Streamer „{$twitch}“ gelöscht (Charakter-Statistik bleibt erhalten).");
                }
                break;

            case 'reset_token':
                $id = intval($_POST['streamer_id'] ?? 0);
                $wpdb->update($this->table_streamers, array(
                    'token_hash'       => null,
                    'token_claimed_at' => null,
                    'claim_until'      => $this->claim_deadline(),
                ), array('id' => $id), array('%s', '%s', '%s'), array('%d'));
                $this->admin_notice('success', 'Token zurückgesetzt. Der nächste Tod/Level-up vom PC des Streamers holt innerhalb von '
                    . self::CLAIM_DAYS . ' Tagen einen neuen Token ab.');
                break;

            case 'add_character':
                $name  = self::clip(wp_unslash($_POST['character_name'] ?? ''), 64);
                $race  = self::clip(wp_unslash($_POST['race'] ?? ''), 50);
                $class = self::clip(wp_unslash($_POST['character_class'] ?? ''), 50);
                if ($name === '') {
                    $this->admin_notice('error', 'Charaktername fehlt.');
                    break;
                }
                $ok = $wpdb->insert($this->table_characters, array(
                    'character_name'  => $name,
                    'current_level'   => 0,
                    'total_deaths'    => 0,
                    'race'            => $race,
                    'character_class' => $class,
                    'last_seen'       => $now,
                ), array('%s', '%d', '%d', '%s', '%s', '%s'));
                $ok
                    ? $this->admin_notice('success', "Charakter „{$name}“ angelegt.")
                    : $this->admin_notice('error', "Charakter „{$name}“ existiert bereits.");
                break;

            case 'delete_character':
                $name = self::clip(wp_unslash($_POST['character_name'] ?? ''), 64);
                $mapped = $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$this->table_mapping} WHERE character_name = %s", $name));
                if (intval($mapped) > 0) {
                    $this->admin_notice('error', "„{$name}“ ist noch einem Streamer zugeordnet – erst Zuordnung lösen.");
                    break;
                }
                $wpdb->delete($this->table_characters, array('character_name' => $name), array('%s'));
                $this->admin_notice('success', "Charakter „{$name}“ gelöscht (Todes-History bleibt erhalten).");
                break;

            case 'assign':
                $id   = intval($_POST['streamer_id'] ?? 0);
                $name = self::clip(wp_unslash($_POST['character_name'] ?? ''), 64);
                $streamer = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$this->table_streamers} WHERE id = %d", $id), ARRAY_A);
                $char_exists = $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$this->table_characters} WHERE character_name = %s", $name));
                if (!$streamer || intval($char_exists) === 0) {
                    $this->admin_notice('error', 'Streamer oder Charakter nicht gefunden.');
                    break;
                }
                $owner = $wpdb->get_var($wpdb->prepare(
                    "SELECT twitch_username FROM {$this->table_mapping} WHERE character_name = %s AND twitch_username <> %s",
                    $name, $streamer['twitch_username']
                ));
                if ($owner !== null) {
                    $this->admin_notice('error', "„{$name}“ ist bereits „{$owner}“ zugeordnet.");
                    break;
                }
                // Ein Charakter pro Streamer: bestehende Zuordnung wird ersetzt
                $wpdb->delete($this->table_mapping, array('twitch_username' => $streamer['twitch_username']), array('%s'));
                $wpdb->insert($this->table_mapping, array(
                    'twitch_username' => $streamer['twitch_username'],
                    'character_name'  => $name,
                    'display_name'    => $streamer['display_name'],
                ), array('%s', '%s', '%s'));
                $this->admin_notice('success', "„{$name}“ ist jetzt „{$streamer['twitch_username']}“ zugeordnet.");
                break;

            case 'unassign':
                $id = intval($_POST['streamer_id'] ?? 0);
                $twitch = $wpdb->get_var($wpdb->prepare("SELECT twitch_username FROM {$this->table_streamers} WHERE id = %d", $id));
                if ($twitch !== null) {
                    $wpdb->delete($this->table_mapping, array('twitch_username' => $twitch), array('%s'));
                    $this->admin_notice('success', "Zuordnung von „{$twitch}“ gelöst.");
                }
                break;
        }

        wp_safe_redirect(admin_url('admin.php?page=lotro-death-tracker'));
        exit;
    }

    /**
     * Opening <form> tag for one admin action, including nonce.
     * The confirm text goes into a data attribute and is read as plain data –
     * never build it into the inline JS (esc_attr does not double-encode, so a
     * name containing "&quot;" would break out of a JS string literal).
     */
    private function admin_form_open($do, $confirm = '') {
        $onsubmit = $confirm !== ''
            ? ' data-confirm="' . esc_attr($confirm) . '" onsubmit="return confirm(this.dataset.confirm);"'
            : '';
        echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '" style="display:inline"' . $onsubmit . '>';
        echo '<input type="hidden" name="action" value="lotro_dt">';
        echo '<input type="hidden" name="do" value="' . esc_attr($do) . '">';
        wp_nonce_field('lotro_dt_admin');
    }

    private function token_status_label(array $s, $now) {
        if (!empty($s['token_hash'])) {
            return 'abgeholt am ' . esc_html($s['token_claimed_at']);
        }
        if (!empty($s['claim_until']) && $s['claim_until'] >= $now) {
            return '<span style="color:#996800">offen bis ' . esc_html($s['claim_until']) . '</span>';
        }
        return '<span style="color:#b32d2e">Abholfenster abgelaufen</span>';
    }

    public function render_admin_page() {
        global $wpdb;
        if (!current_user_can('manage_options')) {
            return;
        }

        $now        = current_time('mysql');
        $streamers  = $wpdb->get_results(
            "SELECT s.*, m.character_name FROM {$this->table_streamers} s
             LEFT JOIN {$this->table_mapping} m ON m.twitch_username = s.twitch_username
             ORDER BY s.twitch_username ASC", ARRAY_A);
        $characters = $wpdb->get_results(
            "SELECT c.*, m.twitch_username FROM {$this->table_characters} c
             LEFT JOIN {$this->table_mapping} m ON m.character_name = c.character_name
             ORDER BY c.character_name ASC", ARRAY_A);
        $test_mode    = get_option('lotro_death_tracker_test_mode', '0') === '1';
        $allow_legacy = get_option('lotro_death_tracker_allow_legacy', '1') === '1';
        $overlay_url  = rest_url('lotro-deaths/v1/overlay');

        echo '<div class="wrap"><h1>LOTRO Death Tracker</h1>';

        $notice = get_transient('lotro_dt_notice_' . get_current_user_id());
        if ($notice) {
            delete_transient('lotro_dt_notice_' . get_current_user_id());
            echo '<div class="notice notice-' . esc_attr($notice[0]) . ' is-dismissible"><p>' . esc_html($notice[1]) . '</p></div>';
        }

        echo '<p>Overlay-URL für alle Streamer (OBS → Browser-Quelle, 1920×1080): <code>' . esc_html($overlay_url) . '</code></p>';

        // ── Streamer ──
        echo '<h2>Streamer</h2>';
        echo '<table class="widefat striped"><thead><tr><th>Twitch-Name</th><th>Anzeigename</th><th>Charakter</th><th>Token</th><th>Zuletzt gesendet</th><th>Aktionen</th></tr></thead><tbody>';
        if (!$streamers) {
            echo '<tr><td colspan="6">Noch keine Streamer angelegt.</td></tr>';
        }
        foreach ($streamers as $st) {
            echo '<tr><td>' . esc_html($st['twitch_username']) . '</td>';
            echo '<td>' . esc_html($st['display_name']) . '</td>';
            echo '<td>' . ($st['character_name'] !== null ? esc_html($st['character_name']) : '<em>– keiner –</em>') . '</td>';
            echo '<td>' . $this->token_status_label($st, $now) . '</td>';
            echo '<td>' . esc_html($st['token_last_used'] ?? '–') . '</td><td>';
            $this->admin_form_open('reset_token', 'Token von ' . $st['twitch_username'] . ' zurücksetzen? Der PC des Streamers holt beim nächsten Senden einen neuen ab.');
            echo '<input type="hidden" name="streamer_id" value="' . intval($st['id']) . '">';
            submit_button('Token zurücksetzen', 'secondary small', '', false);
            echo '</form> ';
            if ($st['character_name'] !== null) {
                $this->admin_form_open('unassign', 'Zuordnung von ' . $st['twitch_username'] . ' lösen?');
                echo '<input type="hidden" name="streamer_id" value="' . intval($st['id']) . '">';
                submit_button('Zuordnung lösen', 'secondary small', '', false);
                echo '</form> ';
            }
            $this->admin_form_open('delete_streamer', 'Streamer ' . $st['twitch_username'] . ' löschen?');
            echo '<input type="hidden" name="streamer_id" value="' . intval($st['id']) . '">';
            submit_button('Löschen', 'delete small', '', false);
            echo '</form></td></tr>';
        }
        echo '</tbody></table>';

        echo '<h3>Streamer anlegen</h3>';
        $this->admin_form_open('add_streamer');
        echo '<input type="text" name="twitch_username" placeholder="Twitch-Name" required maxlength="100"> ';
        echo '<input type="text" name="display_name" placeholder="Anzeigename (optional)" maxlength="100"> ';
        submit_button('Anlegen', 'primary', '', false);
        echo '</form>';

        // ── Zuordnung ──
        echo '<h2>Zuordnung Streamer ↔ Charakter</h2>';
        echo '<p>Ein Charakter pro Streamer. Eine neue Zuordnung ersetzt die bisherige. Nur zugeordnete Charaktere dürfen Tode und Level-ups senden.</p>';
        $this->admin_form_open('assign');
        echo '<select name="streamer_id" required><option value="">Streamer wählen…</option>';
        foreach ($streamers as $st) {
            echo '<option value="' . intval($st['id']) . '">' . esc_html($st['twitch_username']) . '</option>';
        }
        echo '</select> → <select name="character_name" required><option value="">Charakter wählen…</option>';
        foreach ($characters as $ch) {
            $suffix = $ch['twitch_username'] !== null ? ' (' . $ch['twitch_username'] . ')' : '';
            echo '<option value="' . esc_attr($ch['character_name']) . '">' . esc_html($ch['character_name'] . $suffix) . '</option>';
        }
        echo '</select> ';
        submit_button('Zuordnen', 'primary', '', false);
        echo '</form>';

        // ── Charaktere ──
        echo '<h2>Charaktere</h2>';
        echo '<table class="widefat striped"><thead><tr><th>Name</th><th>Volk</th><th>Klasse</th><th>Level</th><th>Tode</th><th>Streamer</th><th>Zuletzt gesehen</th><th></th></tr></thead><tbody>';
        if (!$characters) {
            echo '<tr><td colspan="8">Noch keine Charaktere.</td></tr>';
        }
        foreach ($characters as $ch) {
            echo '<tr><td>' . esc_html($ch['character_name']) . '</td>';
            echo '<td>' . esc_html($ch['race']) . '</td>';
            echo '<td>' . esc_html($ch['character_class']) . '</td>';
            echo '<td>' . intval($ch['current_level']) . '</td>';
            echo '<td>' . intval($ch['total_deaths']) . '</td>';
            echo '<td>' . esc_html($ch['twitch_username'] ?? '–') . '</td>';
            echo '<td>' . esc_html($ch['last_seen']) . '</td><td>';
            if ($ch['twitch_username'] === null) {
                $this->admin_form_open('delete_character', 'Charakter ' . $ch['character_name'] . ' löschen?');
                echo '<input type="hidden" name="character_name" value="' . esc_attr($ch['character_name']) . '">';
                submit_button('Löschen', 'delete small', '', false);
                echo '</form>';
            }
            echo '</td></tr>';
        }
        echo '</tbody></table>';

        echo '<h3>Charakter anlegen</h3>';
        $this->admin_form_open('add_character');
        echo '<input type="text" name="character_name" placeholder="Charaktername" required maxlength="64"> ';
        echo '<select name="race"><option value="">Volk…</option>';
        foreach (self::$races as $r) {
            echo '<option>' . esc_html($r) . '</option>';
        }
        echo '</select> <select name="character_class"><option value="">Klasse…</option>';
        foreach (self::$classes as $c) {
            echo '<option>' . esc_html($c) . '</option>';
        }
        echo '</select> ';
        submit_button('Anlegen', 'primary', '', false);
        echo '</form>';

        // ── Einstellungen ──
        echo '<h2>Einstellungen</h2>';
        $this->admin_form_open('save_settings');
        echo '<p><label><input type="checkbox" name="allow_legacy" value="1"' . checked($allow_legacy, true, false) . '> '
            . 'Alte Clients ohne Token zulassen (nur für Streamer, die noch keinen Token abgeholt haben). Ausschalten, sobald alle einen Token haben.</label></p>';
        echo '<p><label><input type="checkbox" name="test_mode" value="1"' . checked($test_mode, true, false) . '> '
            . 'Testmodus: <code>/test/*</code>-Endpunkte aktiv (schreiben in Test-Tabellen). Nach dem Testen wieder ausschalten.</label></p>';
        submit_button('Speichern', 'primary', '', false);
        echo '</form></div>';
    }
}

new LOTRO_Death_Tracker();
