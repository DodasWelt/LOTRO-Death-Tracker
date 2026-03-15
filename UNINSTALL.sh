#!/usr/bin/env bash
# LOTRO Death Tracker - Deinstallation (Linux)
# Version: 3.0
# Entfernt den LOTRO Death Tracker vollstaendig vom System.

# ── Self-Copy-Pattern (CLAUDE.md Hinweis 22 – Linux) ─────────────────────────
# Das Skript kann in $INSTALL_DIR liegen, das es loeschen soll.
# Loesung: Kopie nach /tmp, von dort ausfuehren (--from-tmp Flag).
if [[ "${1:-}" != "--from-tmp" ]]; then
    TMP_COPY="/tmp/lotro-dt-uninstall-$$.sh"
    cp "$0" "$TMP_COPY"
    chmod +x "$TMP_COPY"
    bash "$TMP_COPY" --from-tmp &
    exit 0
fi

# ─────────────────────────────────────────────────────────────────────────────
# Ab hier laeuft die Kopie aus /tmp – kann INSTALL_DIR loeschen
# ─────────────────────────────────────────────────────────────────────────────

INSTALL_DIR="$HOME/.local/share/lotro-death-tracker"
XDG_AUTOSTART="$HOME/.config/autostart"
LOTRO_SUBDIR="The Lord of the Rings Online"

echo ""
echo "================================================="
echo " LOTRO Death Tracker - Deinstallation (Linux)"
echo "================================================="
echo ""
echo "Diese Aktion entfernt LOTRO Death Tracker vollstaendig:"
echo "  - Watcher und Client werden beendet"
echo "  - Autostart-Eintraege werden geloescht"
echo "  - LOTRO Plugin wird entfernt"
echo "  - $INSTALL_DIR wird geloescht"
echo ""
read -rp "Wirklich deinstallieren? [J/N]: " CONFIRM
if [[ ! "$CONFIRM" =~ ^[jJyY]$ ]]; then
    echo "Deinstallation abgebrochen."
    rm -f "$0"
    exit 0
fi
echo ""

# ── Schritt 1: Prozesse beenden ──────────────────────────────────────────────
echo "[SCHRITT 1/4] Beende laufende Prozesse..."
for pidfile in "$INSTALL_DIR/watcher.pid" "$INSTALL_DIR/client.pid" "$INSTALL_DIR/status-server.pid"; do
    if [ -f "$pidfile" ]; then
        pid=$(cat "$pidfile" 2>/dev/null | tr -d '[:space:]')
        if [ -n "$pid" ]; then
            kill -TERM "$pid" 2>/dev/null || true
        fi
    fi
done
sleep 1
# Fallback: pkill fuer evtl. noch laufende Prozesse
pkill -f "lotro-watcher" 2>/dev/null || true
pkill -f "lotro-status-server" 2>/dev/null || true
pkill -f "node.*client\.js" 2>/dev/null || true
echo "  - Prozesse beendet"

# ── Schritt 2: Autostart-Eintraege entfernen ─────────────────────────────────
echo "[SCHRITT 2/4] Entferne Autostart-Eintraege..."
for entry in "lotro-death-tracker" "lotro-death-tracker-status"; do
    desktop_file="$XDG_AUTOSTART/$entry.desktop"
    if [ -f "$desktop_file" ]; then
        rm -f "$desktop_file"
        echo "  - XDG Autostart entfernt: $entry.desktop"
    else
        echo "  - $entry.desktop nicht gefunden (OK)"
    fi
done

# ── Schritt 3: LOTRO Plugin loeschen ─────────────────────────────────────────
echo "[SCHRITT 3/4] Entferne LOTRO Plugin..."
LOTRO_PLUGIN_REMOVED=0

# Steam (native)
STEAM_NATIVE="$HOME/.steam/steam/steamapps/compatdata/212500/pfx/drive_c/users/steamuser/My Documents/$LOTRO_SUBDIR"
if [ -d "$STEAM_NATIVE/Plugins/DodasWelt" ]; then
    rm -rf "$STEAM_NATIVE/Plugins/DodasWelt"
    echo "  - Plugin entfernt: $STEAM_NATIVE/Plugins/DodasWelt"
    LOTRO_PLUGIN_REMOVED=1
fi

# Steam (Flatpak)
if [ "$LOTRO_PLUGIN_REMOVED" = "0" ]; then
    STEAM_FLATPAK="$HOME/.var/app/com.valvesoftware.Steam/data/Steam/steamapps/compatdata/212500/pfx/drive_c/users/steamuser/My Documents/$LOTRO_SUBDIR"
    if [ -d "$STEAM_FLATPAK/Plugins/DodasWelt" ]; then
        rm -rf "$STEAM_FLATPAK/Plugins/DodasWelt"
        echo "  - Plugin entfernt: $STEAM_FLATPAK/Plugins/DodasWelt"
        LOTRO_PLUGIN_REMOVED=1
    fi
fi

# Standard-Dokumente-Fallback
if [ "$LOTRO_PLUGIN_REMOVED" = "0" ]; then
    DOCS_DEFAULT="$HOME/Documents/$LOTRO_SUBDIR"
    if [ -d "$DOCS_DEFAULT/Plugins/DodasWelt" ]; then
        rm -rf "$DOCS_DEFAULT/Plugins/DodasWelt"
        echo "  - Plugin entfernt: $DOCS_DEFAULT/Plugins/DodasWelt"
        LOTRO_PLUGIN_REMOVED=1
    fi
fi

if [ "$LOTRO_PLUGIN_REMOVED" = "0" ]; then
    echo "  [WARNUNG] LOTRO Plugin nicht gefunden (evtl. bereits entfernt oder an anderem Pfad)"
fi

# ── Schritt 4: Installationsverzeichnis loeschen ──────────────────────────────
echo "[SCHRITT 4/4] Loesche Installationsverzeichnis..."
if [ -d "$INSTALL_DIR" ]; then
    rm -rf "$INSTALL_DIR"
    echo "  - $INSTALL_DIR geloescht"
else
    echo "  - $INSTALL_DIR nicht gefunden (evtl. bereits entfernt)"
fi

echo ""
echo "================================================="
echo " Deinstallation abgeschlossen!"
echo "================================================="
echo ""
if command -v notify-send &>/dev/null; then
    notify-send "LOTRO Death Tracker" "Deinstallation abgeschlossen!" 2>/dev/null || true
fi

# Kopie loescht sich selbst
rm -f "$0"
