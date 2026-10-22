#!/usr/bin/env bash
# Lokaler Test des WP-Plugins (WordPress + MySQL in Docker).
# Voraussetzung: Docker Desktop mit aktivierter WSL-Integration für die Distro.
#
#   bash WordPress/tests/run-tests.sh          # Testumgebung starten + alle Tests
#   docker compose -f WordPress/tests/docker-compose.yml down -v   # danach komplett entfernen
#
# Achtung: Leert bei jedem Lauf die Plugin-Tabellen der LOKALEN Test-Datenbank.
set -euo pipefail
cd "$(dirname "$0")"

# Plugin-Ordner wie im Release-ZIP zusammenstellen (PHP + overlay.html)
mkdir -p .plugin
cp ../lotro-death-tracker.php .plugin/
cp ../../Overlay/lotro-death-overlay.html .plugin/overlay.html

docker compose up -d >/dev/null
echo "Warte auf MySQL..."
until docker compose exec -T db mysqladmin ping -uroot -proot --silent >/dev/null 2>&1; do sleep 2; done

wp() { docker compose exec -T cli wp "$@"; }
sql() { docker compose exec -T db mysql --default-character-set=utf8mb4 -uwp -pwp wp -e "$1" 2>/dev/null; }

# is-installed: 0 = installiert, 1 = nicht installiert, sonst DB noch nicht bereit
while :; do
    rc=0; wp core is-installed >/dev/null 2>&1 || rc=$?
    [ "$rc" -le 1 ] && break
    sleep 2
done
if [ "$rc" = "1" ]; then
    echo "Installiere WordPress..."
    wp core install --url=http://localhost:8089 --title=LDT --admin_user=admin --admin_password=admin \
        --admin_email=admin@example.com --skip-email >/dev/null
    wp rewrite structure '/%postname%/' >/dev/null
fi

echo "Setze Plugin-Daten zurück..."
wp plugin deactivate lotro-death-tracker >/dev/null 2>&1 || true
sql "DROP TABLE IF EXISTS wp_lotro_streamers, wp_lotro_streamer_mapping, wp_lotro_deaths, wp_lotro_characters,
     wp_lotro_deaths_test, wp_lotro_characters_test;
     DELETE FROM wp_options WHERE option_name LIKE '%lotro%';"
# Neustart leert den OPcache – sonst läuft u. U. noch die vorherige PHP-Version
docker compose restart wordpress >/dev/null 2>&1
wp plugin activate lotro-death-tracker >/dev/null
until curl -sf http://localhost:8089/wp-json/lotro-deaths/v1/health >/dev/null; do sleep 1; done

echo "== Unit-Test Cloudflare-IP =="
php ip_test.php ../lotro-death-tracker.php
echo "== End-to-End =="
python3 -I e2e.py "$PWD"
