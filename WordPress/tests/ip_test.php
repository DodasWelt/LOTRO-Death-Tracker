<?php
define('ABSPATH', '/');
class FakeDb { public $prefix = 'wp_'; }
$wpdb = new FakeDb();
function register_activation_hook() {} function add_action() {} function add_filter() {}
function sanitize_text_field($s) { return trim(strip_tags($s)); }
require $argv[1]; // Pfad zu lotro-death-tracker.php
$t = array(
  array('162.158.10.1', '203.0.113.7', '203.0.113.7', 'Cloudflare v4 → CF-IP'),
  array('2606:4700::1', '2001:db8::5', '2001:db8::5', 'Cloudflare v6 → CF-IP'),
  array('198.51.100.9', '203.0.113.7', '198.51.100.9', 'Fremde IP fälscht Header → REMOTE_ADDR'),
  array('162.158.10.1', 'kein-ip', '162.158.10.1', 'Ungültiger Header → REMOTE_ADDR'),
  array('172.71.255.255', '1.2.3.4', '1.2.3.4', 'Grenze 172.64.0.0/13 (oben)'),
  array('172.72.0.0', '1.2.3.4', '172.72.0.0', 'Knapp außerhalb 172.64.0.0/13'),
  array('10.0.0.1', '', '10.0.0.1', 'Ohne Header'),
);
$fail = 0;
foreach ($t as [$remote, $cf, $want, $name]) {
  $got = LOTRO_Death_Tracker::resolve_client_ip($remote, $cf);
  echo ($got === $want ? 'PASS ' : 'FAIL ') . "$name ($got)\n"; if ($got !== $want) $fail++;
}
$c = LOTRO_Death_Tracker::clip(str_repeat('ä', 80), 64);
echo (mb_strlen($c) === 64 ? 'PASS' : 'FAIL') . " clip kürzt Multibyte korrekt\n";
exit($fail);
