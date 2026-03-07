#!/usr/bin/env bash
# LOTRO Death Tracker - Linux Installer
# Version: 2.5
# Installiert den Tracker fuer LOTRO via Steam+Proton oder Lutris.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.local/share/lotro-death-tracker"
LOG="$SCRIPT_DIR/install.log"
LOTRO_SUBDIR="The Lord of the Rings Online"

log() { echo "[$(date '+%Y-%m-%dT%H:%M:%S')] $*" | tee -a "$LOG"; }
err() { echo "[$(date '+%Y-%m-%dT%H:%M:%S')] FEHLER: $*" | tee -a "$LOG" >&2; }

echo ""
echo "================================================="
echo " LOTRO Death Tracker - Installer (Linux) v2.5"
echo "================================================="
echo ""

# Abhängigkeiten prüfen
log "Pruefe Abhaengigkeiten..."
for cmd in node npm curl; do
    if ! command -v "$cmd" &>/dev/null; then
        if [ "$cmd" = "node" ] || [ "$cmd" = "npm" ]; then
            err "Node.js nicht gefunden. Bitte installieren:"
            err "  Ubuntu/Debian:  sudo apt install nodejs npm"
            err "  Fedora/RHEL:    sudo dnf install nodejs npm"
            err "  Arch:           sudo pacman -S nodejs npm"
            err "  Manuell:        https://nodejs.org/dist/v24.14.0/node-v24.14.0-linux-x64.tar.xz"
        else
            err "$cmd nicht gefunden. Bitte installieren (z.B. 'sudo apt install curl')."
        fi
        exit 1
    fi
done
log "Abhaengigkeiten OK (node $(node --version), npm $(npm --version))"

# LOTRO-Pfad erkennen
log "Suche LOTRO-Installationspfad..."
LOTRO_PATH=""

if [ -n "${LOTRO_PATH_OVERRIDE:-}" ]; then
    LOTRO_PATH="$LOTRO_PATH_OVERRIDE"
    log "LOTRO_PATH_OVERRIDE gesetzt: $LOTRO_PATH"
else
    # Steam (native)
    STEAM_NATIVE="$HOME/.steam/steam/steamapps/compatdata/212500/pfx/drive_c/users/steamuser/My Documents/$LOTRO_SUBDIR"
    if [ -d "$STEAM_NATIVE" ]; then
        LOTRO_PATH="$STEAM_NATIVE"
        log "Steam (native) gefunden: $LOTRO_PATH"
    fi

    # Steam (Flatpak)
    if [ -z "$LOTRO_PATH" ]; then
        STEAM_FLATPAK="$HOME/.var/app/com.valvesoftware.Steam/data/Steam/steamapps/compatdata/212500/pfx/drive_c/users/steamuser/My Documents/$LOTRO_SUBDIR"
        if [ -d "$STEAM_FLATPAK" ]; then
            LOTRO_PATH="$STEAM_FLATPAK"
            log "Steam (Flatpak) gefunden: $LOTRO_PATH"
        fi
    fi

    # Steam Library VDF-Scan (fuer nicht-standard Steam Library-Pfade, z.B. zweite Festplatte)
    if [ -z "$LOTRO_PATH" ]; then
        for vdf_file in \
            "$HOME/.steam/steam/config/libraryfolders.vdf" \
            "$HOME/.var/app/com.valvesoftware.Steam/data/Steam/config/libraryfolders.vdf"; do
            [ -f "$vdf_file" ] || continue
            while IFS= read -r vdf_line; do
                vdf_p="$(printf '%s' "$vdf_line" | grep '"path"' | sed -E 's/.*"path"[[:space:]]+"([^"]+)".*/\1/')"
                [ -z "$vdf_p" ] && continue
                candidate="$vdf_p/steamapps/compatdata/212500/pfx/drive_c/users/steamuser/My Documents/$LOTRO_SUBDIR"
                if [ -d "$candidate" ]; then
                    LOTRO_PATH="$candidate"
                    log "Steam Library (VDF) gefunden: $LOTRO_PATH"
                    break 2
                fi
            done < "$vdf_file"
        done
    fi

    # Lutris (YAML-Scan)
    if [ -z "$LOTRO_PATH" ]; then
        LUTRIS_DIR="$HOME/.config/lutris/games"
        if [ -d "$LUTRIS_DIR" ]; then
            for yml in "$LUTRIS_DIR"/*.yml; do
                [ -f "$yml" ] || continue
                fname="$(basename "$yml" .yml)"
                if echo "$fname" | grep -qi 'lord\|lotro'; then
                    prefix="$(grep -E '^\s*(wine_prefix|prefix):' "$yml" 2>/dev/null | head -1 | sed -E 's/^\s*(wine_prefix|prefix):\s*//' | tr -d '\r')"
                    if [ -n "$prefix" ]; then
                        candidate="$prefix/drive_c/users/${USER:-user}/My Documents/$LOTRO_SUBDIR"
                        if [ -d "$candidate" ]; then
                            LOTRO_PATH="$candidate"
                            log "Lutris gefunden ($yml): $LOTRO_PATH"
                            break
                        fi
                    fi
                fi
            done
        fi
    fi

    # Standard Wine-Prefix (~/.wine)
    if [ -z "$LOTRO_PATH" ]; then
        WINE_DEFAULT="$HOME/.wine/drive_c/users/${USER:-user}/My Documents/$LOTRO_SUBDIR"
        if [ -d "$WINE_DEFAULT" ]; then
            LOTRO_PATH="$WINE_DEFAULT"
            log "Wine (Standard-Prefix ~/.wine) gefunden: $LOTRO_PATH"
        fi
    fi

    # Manuelle Eingabe
    if [ -z "$LOTRO_PATH" ]; then
        echo ""
        echo "LOTRO-Pfad konnte nicht automatisch erkannt werden."
        echo "Bitte gib den vollstaendigen Pfad zum LOTRO-Dokumentenordner an"
        echo "(z.B. ~/.steam/steam/steamapps/compatdata/212500/pfx/drive_c/users/steamuser/My Documents/$LOTRO_SUBDIR)"
        echo ""
        read -rp "LOTRO-Pfad: " LOTRO_INPUT
        LOTRO_INPUT="${LOTRO_INPUT/#\~/$HOME}"
        if [ -d "$LOTRO_INPUT" ]; then
            LOTRO_PATH="$LOTRO_INPUT"
            log "Manueller Pfad: $LOTRO_PATH"
        else
            err "Pfad nicht gefunden: $LOTRO_INPUT"
            err "Du kannst den Pfad spaeter mit LOTRO_PATH=... node client.js setzen."
        fi
    fi
fi

# Client-Dateien installieren
log "Installiere Client nach $INSTALL_DIR ..."
mkdir -p "$INSTALL_DIR"
cp -r "$SCRIPT_DIR/Client/"* "$INSTALL_DIR/"
log "Dateien kopiert."

# npm install
log "Installiere npm-Pakete..."
cd "$INSTALL_DIR"
npm install --silent --no-progress
log "npm-Pakete installiert."

# Autostart einrichten
log "Richte Autostart ein..."
node install-autostart.js install
log "Autostart eingerichtet."

# LOTRO-Plugin kopieren
if [ -n "$LOTRO_PATH" ] && [ -d "$LOTRO_PATH" ]; then
    PLUGIN_DIR="$LOTRO_PATH/Plugins/DodasWelt/DeathTracker"
    PLUGIN_ROOT="$LOTRO_PATH/Plugins/DodasWelt"
    mkdir -p "$PLUGIN_DIR"
    cp "$SCRIPT_DIR/LOTRO-Plugin/DodasWelt/DeathTracker/Main.lua" "$PLUGIN_DIR/"
    cp "$SCRIPT_DIR/LOTRO-Plugin/DodasWelt/DeathTracker.plugin" "$PLUGIN_ROOT/"
    log "LOTRO-Plugin installiert: $PLUGIN_DIR"
else
    log "[WARNUNG] LOTRO-Pfad nicht gefunden – Plugin muss manuell kopiert werden."
    echo ""
    echo "Bitte kopiere den Ordner LOTRO-Plugin/DodasWelt/ manuell nach:"
    echo "  <LOTRO-Pfad>/Plugins/"
fi

# Erfolgsmeldung
echo ""
echo "================================================="
echo " Installation abgeschlossen!"
echo "================================================="
echo ""
echo "Der Watcher laeuft bereits im Hintergrund."
echo "Er startet automatisch beim naechsten Anmelden."
echo ""
echo "Logs: $INSTALL_DIR/watcher.log"
echo "      $INSTALL_DIR/client.log"
echo ""
if command -v notify-send &>/dev/null; then
    notify-send "LOTRO Death Tracker" "Installation abgeschlossen! Version 2.5"
fi

log "Installation abgeschlossen."
