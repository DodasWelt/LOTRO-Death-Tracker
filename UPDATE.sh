#!/usr/bin/env bash
# LOTRO Death Tracker - Linux Update-Skript
# Version: 3.0
# Aktualisiert eine bestehende Installation.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.local/share/lotro-death-tracker"
LOG="$SCRIPT_DIR/update.log"

log() { echo "[$(date '+%Y-%m-%dT%H:%M:%S')] $*" | tee -a "$LOG"; }
err() { echo "[$(date '+%Y-%m-%dT%H:%M:%S')] FEHLER: $*" | tee -a "$LOG" >&2; }

echo ""
echo "================================================="
echo " LOTRO Death Tracker - Update (Linux) v3.0"
echo "================================================="
echo ""

# Abhängigkeiten prüfen
for cmd in node npm; do
    if ! command -v "$cmd" &>/dev/null; then
        err "$cmd nicht gefunden."
        exit 1
    fi
done

# Zielverzeichnis prüfen
if [ ! -d "$INSTALL_DIR" ]; then
    err "Kein vorhandener Tracker gefunden unter $INSTALL_DIR."
    err "Bitte zuerst INSTALL.sh ausfuehren."
    exit 1
fi

# Laufende Prozesse stoppen (Pfad-spezifisch, um fremde Prozesse nicht zu treffen)
log "Stoppe laufende Watcher/Client-Prozesse..."
pkill -f "$INSTALL_DIR/lotro-watcher.js" 2>/dev/null && log "Watcher gestoppt." || log "Kein Watcher lief."
pkill -f "$INSTALL_DIR/client.js" 2>/dev/null && log "Client gestoppt." || log "Kein Client lief."
sleep 1

# Neue Dateien kopieren
log "Kopiere neue Dateien nach $INSTALL_DIR ..."
cp -r "$SCRIPT_DIR/Client/"* "$INSTALL_DIR/"
log "Dateien kopiert."

# UNINSTALL.sh + REINSTALL.sh aktualisieren
for script in UNINSTALL.sh REINSTALL.sh; do
    if [ -f "$SCRIPT_DIR/$script" ]; then
        cp "$SCRIPT_DIR/$script" "$INSTALL_DIR/$script"
        chmod +x "$INSTALL_DIR/$script"
        log "$script aktualisiert in $INSTALL_DIR"
    else
        log "[WARNUNG] $script nicht gefunden - wird nicht kopiert."
    fi
done

# npm install
log "Installiere npm-Pakete..."
cd "$INSTALL_DIR"
npm install --silent --no-progress
log "npm-Pakete installiert."

# Autostart neu konfigurieren (regeneriert lotro-watcher.js + .desktop)
log "Konfiguriere Autostart neu..."
node install-autostart.js install
log "Autostart neu konfiguriert, Watcher gestartet."

# LOTRO-Plugin aktualisieren (wenn Quelldateien vorhanden und Pfad erkennbar)
LOTRO_SUBDIR="The Lord of the Rings Online"
LOTRO_PATH=""

if [ -f "$SCRIPT_DIR/LOTRO-Plugin/DodasWelt/DeathTracker/Main.lua" ]; then
    log "Suche LOTRO-Pfad fuer Plugin-Update..."

    # Steam (native)
    STEAM_NATIVE="$HOME/.steam/steam/steamapps/compatdata/212500/pfx/drive_c/users/steamuser/My Documents/$LOTRO_SUBDIR"
    [ -d "$STEAM_NATIVE" ] && LOTRO_PATH="$STEAM_NATIVE"

    # Steam (Flatpak)
    if [ -z "$LOTRO_PATH" ]; then
        STEAM_FLATPAK="$HOME/.var/app/com.valvesoftware.Steam/data/Steam/steamapps/compatdata/212500/pfx/drive_c/users/steamuser/My Documents/$LOTRO_SUBDIR"
        [ -d "$STEAM_FLATPAK" ] && LOTRO_PATH="$STEAM_FLATPAK"
    fi

    # Steam Library VDF-Scan
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
                    break 2
                fi
            done < "$vdf_file"
        done
    fi

    # Lutris
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
        fi
    fi

    if [ -n "$LOTRO_PATH" ] && [ -d "$LOTRO_PATH" ]; then
        PLUGIN_DIR="$LOTRO_PATH/Plugins/DodasWelt/DeathTracker"
        PLUGIN_ROOT="$LOTRO_PATH/Plugins/DodasWelt"
        mkdir -p "$PLUGIN_DIR"
        if cp "$SCRIPT_DIR/LOTRO-Plugin/DodasWelt/DeathTracker/Main.lua" "$PLUGIN_DIR/" 2>/dev/null \
        && cp "$SCRIPT_DIR/LOTRO-Plugin/DodasWelt/DeathTracker.plugin" "$PLUGIN_ROOT/" 2>/dev/null; then
            log "LOTRO-Plugin aktualisiert: $PLUGIN_DIR"
        else
            log "[WARNUNG] Plugin-Kopieren fehlgeschlagen – bitte manuell aktualisieren."
        fi
    else
        log "[WARNUNG] LOTRO-Pfad nicht gefunden – Plugin nicht aktualisiert."
        echo ""
        echo "Bitte kopiere den Ordner LOTRO-Plugin/DodasWelt/ manuell nach:"
        echo "  <LOTRO-Pfad>/Plugins/"
    fi
else
    log "Plugin-Quelldateien nicht gefunden (kein LOTRO-Plugin/-Ordner neben UPDATE.sh) – Plugin-Update uebersprungen."
fi

# Erfolgsmeldung
echo ""
echo "================================================="
echo " Update auf v3.0 abgeschlossen!"
echo "================================================="
echo ""
echo "Der Watcher wurde neu gestartet."
echo ""
echo "Logs: $INSTALL_DIR/watcher.log"
echo ""
if command -v notify-send &>/dev/null; then
    notify-send "LOTRO Death Tracker" "Update auf v3.0 abgeschlossen!"
fi

log "Update abgeschlossen."
