#!/usr/bin/env bash
# LOTRO Death Tracker - Saubere Neuinstallation via GitHub (Linux)
# Version: 3.0
# Laedt die neueste Version von GitHub und installiert komplett neu.

# ── Runner-Check (CLAUDE.md Hinweis 23 - Linux) ──────────────────────────────
# Wenn --runner Argument, direkt runner-Logik ausfuehren
if [[ "${1:-}" == "--runner" ]]; then
    STAGING="${2:-}"
    RUNNER_LOG="/tmp/lotro-dt-reinstall-runner.log"
    INSTALL_DIR="$HOME/.local/share/lotro-death-tracker"
    XDG_AUTOSTART="$HOME/.config/autostart"
    LOTRO_SUBDIR="The Lord of the Rings Online"

    echo "[$(date '+%Y-%m-%dT%H:%M:%S')] Runner gestartet" > "$RUNNER_LOG"
    echo "[$(date '+%Y-%m-%dT%H:%M:%S')] STAGING=$STAGING" >> "$RUNNER_LOG"

    # Staging_INNER finden (entpackter ZIP-Unterordner)
    STAGING_INNER=""
    for d in "$STAGING"/LOTRO-Death-Tracker-*/; do
        [ -d "$d" ] && STAGING_INNER="$d" && break
    done
    if [ -z "$STAGING_INNER" ]; then
        echo "[$(date '+%Y-%m-%dT%H:%M:%S')] FEHLER: STAGING_INNER nicht gefunden" >> "$RUNNER_LOG"
        echo "[FEHLER] Staging-Verzeichnis ungueltig: $STAGING"
        if command -v notify-send &>/dev/null; then
            notify-send "LOTRO Death Tracker" "Neuinstallation fehlgeschlagen: Staging nicht gefunden!" 2>/dev/null || true
        fi
        rm -f "$0"
        exit 1
    fi
    echo "[$(date '+%Y-%m-%dT%H:%M:%S')] STAGING_INNER=$STAGING_INNER" >> "$RUNNER_LOG"

    echo ""
    echo "================================================="
    echo " LOTRO Death Tracker - Neuinstallation (2/2)"
    echo "================================================="
    echo ""

    # Runner-Schritt 1: Prozesse beenden
    echo "[1/4] Beende laufende Prozesse..."
    for pidfile in "$INSTALL_DIR/watcher.pid" "$INSTALL_DIR/client.pid" "$INSTALL_DIR/status-server.pid"; do
        if [ -f "$pidfile" ]; then
            pid=$(cat "$pidfile" 2>/dev/null | tr -d '[:space:]')
            [ -n "$pid" ] && kill -TERM "$pid" 2>/dev/null || true
        fi
    done
    sleep 1
    pkill -f "lotro-watcher" 2>/dev/null || true
    pkill -f "lotro-status-server" 2>/dev/null || true
    pkill -f "node.*client\.js" 2>/dev/null || true
    echo "[$(date '+%Y-%m-%dT%H:%M:%S')] Runner 1: Prozesse beendet" >> "$RUNNER_LOG"
    echo "  - Prozesse beendet"

    # Runner-Schritt 2: Autostart-Eintraege loeschen
    echo "[2/4] Entferne Autostart-Eintraege..."
    for entry in "lotro-death-tracker" "lotro-death-tracker-status"; do
        desktop_file="$XDG_AUTOSTART/$entry.desktop"
        [ -f "$desktop_file" ] && rm -f "$desktop_file"
    done
    echo "[$(date '+%Y-%m-%dT%H:%M:%S')] Runner 2: Autostart entfernt" >> "$RUNNER_LOG"
    echo "  - XDG Autostart-Eintraege entfernt"

    # Runner-Schritt 3: LOTRO Plugin loeschen
    echo "[3/4] Entferne LOTRO Plugin..."
    PLUGIN_REMOVED=0
    for candidate in \
        "$HOME/.steam/steam/steamapps/compatdata/212500/pfx/drive_c/users/steamuser/My Documents/$LOTRO_SUBDIR/Plugins/DodasWelt" \
        "$HOME/.var/app/com.valvesoftware.Steam/data/Steam/steamapps/compatdata/212500/pfx/drive_c/users/steamuser/My Documents/$LOTRO_SUBDIR/Plugins/DodasWelt" \
        "$HOME/Documents/$LOTRO_SUBDIR/Plugins/DodasWelt"; do
        if [ -d "$candidate" ]; then
            rm -rf "$candidate"
            PLUGIN_REMOVED=1
            break
        fi
    done
    echo "[$(date '+%Y-%m-%dT%H:%M:%S')] Runner 3: PLUGIN_REMOVED=$PLUGIN_REMOVED" >> "$RUNNER_LOG"
    echo "  - Plugin entfernt (gefunden: $PLUGIN_REMOVED)"

    # Runner-Schritt 4: Installationsverzeichnis loeschen
    echo "[4/4] Loesche altes Installationsverzeichnis..."
    if [ -d "$INSTALL_DIR" ]; then
        rm -rf "$INSTALL_DIR"
        echo "[$(date '+%Y-%m-%dT%H:%M:%S')] Runner 4: $INSTALL_DIR geloescht" >> "$RUNNER_LOG"
        echo "  - $INSTALL_DIR geloescht"
    else
        echo "  - $INSTALL_DIR nicht gefunden (OK)"
    fi
    sleep 1
    echo ""

    # INSTALL.sh aus Staging aufrufen
    echo "================================================="
    echo " Installiere neue Version..."
    echo "================================================="
    echo ""
    if [ ! -f "$STAGING_INNER/INSTALL.sh" ]; then
        echo "[$(date '+%Y-%m-%dT%H:%M:%S')] FEHLER: INSTALL.sh nicht in Staging" >> "$RUNNER_LOG"
        echo "[FEHLER] INSTALL.sh nicht im Staging-Verzeichnis gefunden!"
        echo "Staging fuer Diagnose belassen: $STAGING_INNER"
        if command -v notify-send &>/dev/null; then
            notify-send "LOTRO Death Tracker" "Neuinstallation fehlgeschlagen: INSTALL.sh nicht gefunden!" 2>/dev/null || true
        fi
        rm -f "$0"
        exit 1
    fi

    bash "$STAGING_INNER/INSTALL.sh"
    INSTALL_EC=$?
    echo "[$(date '+%Y-%m-%dT%H:%M:%S')] Runner: INSTALL.sh exitCode=$INSTALL_EC" >> "$RUNNER_LOG"

    if [ "$INSTALL_EC" = "0" ]; then
        rm -rf "$STAGING"
        echo "[$(date '+%Y-%m-%dT%H:%M:%S')] Runner: Staging geloescht, abgeschlossen" >> "$RUNNER_LOG"
        echo ""
        echo "================================================="
        echo " Neuinstallation abgeschlossen!"
        echo "================================================="
        echo ""
        if command -v notify-send &>/dev/null; then
            notify-send "LOTRO Death Tracker" "Neuinstallation abgeschlossen!" 2>/dev/null || true
        fi
    else
        echo ""
        echo "[FEHLER] Installation fehlgeschlagen! (Code: $INSTALL_EC)"
        echo "Staging fuer Diagnose belassen: $STAGING"
        if command -v notify-send &>/dev/null; then
            notify-send "LOTRO Death Tracker" "Neuinstallation fehlgeschlagen!" 2>/dev/null || true
        fi
    fi

    rm -f "$0"
    exit $INSTALL_EC
fi

# ════════════════════════════════════════════════════════════════════════════
# NORMAL-FLOW: Checks, Download, Staging
# ════════════════════════════════════════════════════════════════════════════

# ─── Konfiguration ──────────────────────────────────────────────────────────
# USE_PRERELEASE=1 -> neuester Pre-Release (fuer Tests)
# USE_PRERELEASE=0 -> stabiler Release (Standard, Produktion)
USE_PRERELEASE=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="/tmp/lotro-dt-reinstall.log"
INSTALL_DIR_CHECK="$HOME/.local/share/lotro-death-tracker"
RUN_FROM_INSTALL_DIR=0
if [ "$SCRIPT_DIR" = "$INSTALL_DIR_CHECK" ]; then RUN_FROM_INSTALL_DIR=1; fi

log() { echo "[$(date '+%Y-%m-%dT%H:%M:%S')] $*" | tee -a "$LOG"; }
err() { echo "[$(date '+%Y-%m-%dT%H:%M:%S')] FEHLER: $*" | tee -a "$LOG" >&2; }

echo ""
echo "================================================="
echo " LOTRO Death Tracker - Neuinstallation (Linux)"
echo "================================================="
echo ""
echo "Diese Aktion laedt die neueste Version von GitHub und"
echo "installiert den LOTRO Death Tracker komplett neu."
echo ""

log "REINSTALL.sh gestartet"
log "USE_PRERELEASE=$USE_PRERELEASE | Ausfuehrungsort: $SCRIPT_DIR (Installationsverzeichnis: $RUN_FROM_INSTALL_DIR)"

# Abhaengigkeiten pruefen
log "Pruefe Abhaengigkeiten..."
for cmd in node npm curl; do
    if ! command -v "$cmd" &>/dev/null; then
        err "$cmd nicht gefunden. Bitte installieren."
        exit 1
    fi
done

# ZIP-Extraktion: unzip oder python3
EXTRACT_CMD=""
if command -v unzip &>/dev/null; then
    EXTRACT_CMD="unzip"
elif python3 -c "import zipfile" 2>/dev/null; then
    EXTRACT_CMD="python3"
else
    err "unzip oder python3 wird fuer die ZIP-Extraktion benoetigt."
    err "  Ubuntu/Debian: sudo apt install unzip"
    exit 1
fi
log "Abhaengigkeiten OK"

# LOTRO-Running-Check
log "Pruefe ob LOTRO laeuft..."
LOTRO_RUNNING=0
if pgrep -f "lotroclient" > /dev/null 2>&1 || pgrep -f "proton.*212500" > /dev/null 2>&1; then
    LOTRO_RUNNING=1
fi

if [ "$LOTRO_RUNNING" = "1" ]; then
    log "LOTRO laeuft - frage ob beenden"
    LOTRO_ANSWER="N"
    if command -v zenity &>/dev/null; then
        if zenity --question \
            --title="LOTRO Death Tracker - Neuinstallation" \
            --text="LOTRO laeuft noch.\nSoll LOTRO jetzt beendet werden?" 2>/dev/null; then
            LOTRO_ANSWER="J"
        fi
    elif command -v kdialog &>/dev/null; then
        if kdialog --yesno "LOTRO laeuft noch.\nSoll LOTRO jetzt beendet werden?" 2>/dev/null; then
            LOTRO_ANSWER="J"
        fi
    else
        read -rp "LOTRO laeuft noch. Jetzt beenden? [J/N]: " LOTRO_ANSWER
    fi

    if [[ "$LOTRO_ANSWER" =~ ^[jJyY]$ ]]; then
        pkill -f "lotroclient" 2>/dev/null || true
        pkill -f "proton.*212500" 2>/dev/null || true
        log "LOTRO beendet"
        sleep 2
    else
        log "Abgebrochen (LOTRO laeuft)"
        echo "Neuinstallation abgebrochen. Bitte LOTRO schliessen und erneut versuchen."
        exit 1
    fi
fi

# GitHub API: neueste Version und ZIP-URL
log "Schritt 1: GitHub API-Abfrage (USE_PRERELEASE=$USE_PRERELEASE)..."
echo ""
echo "[Schritt 1/3] Ermittle neueste Version von GitHub..."

GITHUB_RESPONSE=""
if [ "$USE_PRERELEASE" = "1" ]; then
    GITHUB_RESPONSE=$(curl -fsSL "https://api.github.com/repos/DodasWelt/LOTRO-Death-Tracker/releases" 2>/dev/null) || true
else
    GITHUB_RESPONSE=$(curl -fsSL "https://api.github.com/repos/DodasWelt/LOTRO-Death-Tracker/releases/latest" 2>/dev/null) || true
fi

if [ -z "$GITHUB_RESPONSE" ]; then
    err "GitHub API nicht erreichbar. Kein Internetzugang?"
    echo ""
    echo "[FEHLER] Neueste Version konnte nicht ermittelt werden!"
    echo "Es wurden KEINE Aenderungen am System vorgenommen."
    exit 1
fi

if [ "$USE_PRERELEASE" = "1" ]; then
    ZIP_URL=$(echo "$GITHUB_RESPONSE" | python3 -c "
import sys, json
try:
    releases = json.load(sys.stdin)
    if not isinstance(releases, list): releases = [releases]
    rel = next((r for r in releases if r.get('prerelease')), releases[0] if releases else None)
    assets = [a for a in rel.get('assets', []) if a['name'].startswith('LOTRO-Death-Tracker-v') and a['name'].endswith('.zip')] if rel else []
    print(assets[0]['browser_download_url'] if assets else '')
except Exception as e:
    print('')
" 2>/dev/null)
    RELEASE_TAG=$(echo "$GITHUB_RESPONSE" | python3 -c "
import sys, json
try:
    releases = json.load(sys.stdin)
    if not isinstance(releases, list): releases = [releases]
    rel = next((r for r in releases if r.get('prerelease')), releases[0] if releases else None)
    print(rel.get('tag_name', '') if rel else '')
except:
    print('')
" 2>/dev/null)
else
    ZIP_URL=$(echo "$GITHUB_RESPONSE" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    assets = [a for a in d.get('assets', []) if a['name'].startswith('LOTRO-Death-Tracker-v') and a['name'].endswith('.zip')]
    print(assets[0]['browser_download_url'] if assets else '')
except Exception as e:
    print('')
" 2>/dev/null)
    RELEASE_TAG=$(echo "$GITHUB_RESPONSE" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tag_name', ''))
except:
    print('')
" 2>/dev/null)
fi

if [ -z "$ZIP_URL" ]; then
    err "ZIP-Asset nicht in GitHub-Release gefunden"
    echo ""
    echo "[FEHLER] Download-URL konnte nicht ermittelt werden!"
    if [ "$USE_PRERELEASE" = "0" ]; then
        echo "Hinweis: releases/latest gibt nur stabile Releases zurueck."
        echo "         Nur Pre-Release vorhanden? USE_PRERELEASE=1 in REINSTALL.sh setzen."
    else
        echo "Hinweis: Pre-Release-Modus aktiv, aber kein Asset gefunden."
    fi
    echo "Es wurden KEINE Aenderungen am System vorgenommen."
    exit 1
fi

log "Schritt 1: Tag=$RELEASE_TAG ZIP=$ZIP_URL"
echo "  Neueste Version: $RELEASE_TAG"
echo ""

# ZIP herunterladen und entpacken
echo "[Schritt 2/3] Lade ZIP herunter und entpacke..."
STAGING="/tmp/lotro-dt-reinstall-$$"
mkdir -p "$STAGING"
log "Schritt 2: STAGING=$STAGING"

log "Lade ZIP..."
if ! curl -fsSL -o "$STAGING/download.zip" "$ZIP_URL"; then
    err "Download fehlgeschlagen"
    echo "[FEHLER] Download fehlgeschlagen!"
    echo "Es wurden KEINE Aenderungen am System vorgenommen."
    rm -rf "$STAGING"
    exit 1
fi

log "Entpacke ZIP..."
if [ "$EXTRACT_CMD" = "unzip" ]; then
    unzip -q "$STAGING/download.zip" -d "$STAGING"
else
    python3 -c "import zipfile, sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$STAGING/download.zip" "$STAGING"
fi

if [ $? -ne 0 ]; then
    err "ZIP entpacken fehlgeschlagen"
    echo "[FEHLER] ZIP entpacken fehlgeschlagen!"
    echo "Es wurden KEINE Aenderungen am System vorgenommen."
    rm -rf "$STAGING"
    exit 1
fi

rm -f "$STAGING/download.zip"

# Entpackten Unterordner finden
STAGING_INNER=""
for d in "$STAGING"/LOTRO-Death-Tracker-*/; do
    [ -d "$d" ] && STAGING_INNER="$d" && break
done

if [ -z "$STAGING_INNER" ]; then
    err "ZIP-Inhalt nicht erkannt (kein LOTRO-Death-Tracker-* Ordner)"
    echo "[FEHLER] ZIP-Inhalt nicht erkannt!"
    echo "Es wurden KEINE Aenderungen am System vorgenommen."
    rm -rf "$STAGING"
    exit 1
fi

log "Schritt 2: STAGING_INNER=$STAGING_INNER"
echo "  - Entpackt nach: $STAGING_INNER"
echo ""

# Runner-Skript starten (Selbstkopie)
echo "[Schritt 3/3] Starte Neuinstallation..."
RUNNER="/tmp/lotro-dt-reinstall-runner-$$.sh"
cp "$0" "$RUNNER"
chmod +x "$RUNNER"
log "Schritt 3: Runner=$RUNNER, Start mit --runner $STAGING"

bash "$RUNNER" --runner "$STAGING" &
echo ""
echo "  - Neuinstallation laeuft im Hintergrund..."
echo "  - Fortschritt erscheint im Terminal."
echo ""
log "Runner gestartet, REINSTALL.sh beendet sich"
exit 0
