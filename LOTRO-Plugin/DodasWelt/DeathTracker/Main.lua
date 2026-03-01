-- =============================================================================
-- DeathTracker - LOTRO Plugin (Lord of the Rings Online)
-- =============================================================================
-- Dieses Script ist ein legitimes Spiel-Plugin fuer Lord of the Rings Online.
-- Es wird ausschliesslich ueber die offizielle LOTRO Turbine Plugin-API
-- ausgefuehrt und hat KEINEN Zugriff auf das Dateisystem, das Netzwerk oder
-- andere Systemressourcen ausserhalb des Spiels.
--
-- Zweck: Erkennung von Spieler-Toden und Level-Aufstiegen im Spiel,
--        Speicherung via Turbine.PluginData.Save() in einem spielinternen
--        Datenformat (kein externer Netzwerkzugriff aus diesem Script heraus).
--
-- Autor:   DodasWelt / Herrin Inge (https://www.dodaswelt.de)
-- Version: 2.0
-- Lizenz:  Keine schaedlichen Aktionen. Offen einsehbarer Quellcode.
-- =============================================================================

import "Turbine";
import "Turbine.Gameplay";
import "Turbine.UI";

-- Plugin namespace
DeathTracker = {};

-- Configuration
DeathTracker.Config = {
    pluginName = "DeathTracker",
    version = "2.0",
    logFileName = "event_log.json",
    lastDeathWasLogged = false,
    lastLevelWasLogged = false,
    isPlayerDead = false,
    lastKnownLevel = 0,
    currentLocation = "Unknown Location"
};

-- Race enum mapping: GetRace() returns a numeric value.
-- Source: LotroCompanion/lotro-data lore/races.xml + in-game verified plugins.
DeathTracker.RaceNames = {
    [23]  = "Mensch",
    [65]  = "Elb",
    [73]  = "Zwerg",
    [81]  = "Hobbit",
    [114] = "Beorninger",
    [117] = "Hochelb",
    [120] = "Stark-Axt",
    [125] = "Fluss-Hobbit",
};

-- Class enum mapping: GetClass() returns a numeric value.
-- Source: LotroCompanion/lotro-data lore/classes.xml + in-game verified plugins.
DeathTracker.ClassNames = {
    [23]  = "Wächter",
    [24]  = "Hauptmann",
    [31]  = "Barde",
    [40]  = "Schurke",
    [162] = "Jäger",
    [172] = "Waffenmeister",
    [185] = "Kundiger",
    [193] = "Runenbewahrer",
    [194] = "Hüter",
    [214] = "Beorninger",
    [215] = "Schläger",
    [216] = "Seefahrer",
};

-- Try to get current location
function DeathTracker:UpdateLocation()
    local location = "Unknown Location";
    
    -- Try to get area name from Effects (this sometimes contains region)
    local effects = self.player:GetEffects();
    if effects then
        -- Effects can sometimes give us zone information
    end
    
    -- Store for later use
    self.Config.currentLocation = location;
    return location;
end

-- Initialize the plugin
function DeathTracker:Initialize()
    -- Get the local player
    self.player = Turbine.Gameplay.LocalPlayer.GetInstance();
    
    -- Check if player exists
    if self.player == nil then
        Turbine.Shell.WriteLine("DeathTracker: ERROR - Could not get LocalPlayer instance!");
        return;
    end
    
    -- Store initial level
    self.Config.lastKnownLevel = self.player:GetLevel();
    
    -- Add event handler for morale changes (HP)
    self.player.MoraleChanged = function(sender, args)
        DeathTracker:OnMoraleChanged();
    end
    
    -- Add event handler for level changes
    self.player.LevelChanged = function(sender, args)
        DeathTracker:OnLevelChanged();
    end
    
    Turbine.Shell.WriteLine("=================================");
    Turbine.Shell.WriteLine("DeathTracker v" .. DeathTracker.Config.version .. " initialized!");
    Turbine.Shell.WriteLine("Tracking: " .. self.player:GetName() .. " (Level " .. self.Config.lastKnownLevel .. ")");
    Turbine.Shell.WriteLine("Monitoring: Deaths & Level-Ups");
    Turbine.Shell.WriteLine("=================================");
end

-- Handler for morale (HP) changes
function DeathTracker:OnMoraleChanged()
    local currentMorale = self.player:GetMorale();
    
    -- Check if player just died (morale = 0)
    if currentMorale == 0 and not self.Config.isPlayerDead then
        self.Config.isPlayerDead = true;
        self:LogEvent("death");
    end
    
    -- Reset death flag when player is revived
    if currentMorale > 0 and self.Config.isPlayerDead then
        self.Config.isPlayerDead = false;
        self.Config.lastDeathWasLogged = false;
    end
end

-- Handler for level changes
function DeathTracker:OnLevelChanged()
    local currentLevel = self.player:GetLevel();
    
    -- Check if level actually increased
    if currentLevel > self.Config.lastKnownLevel then
        Turbine.Shell.WriteLine("Level Up detected: " .. self.Config.lastKnownLevel .. " -> " .. currentLevel);
        self.Config.lastKnownLevel = currentLevel;
        self:LogEvent("levelup");
    end
end

-- Log the event (death or levelup)
function DeathTracker:LogEvent(eventType)
    -- Prevent duplicate logging for deaths
    if eventType == "death" and self.Config.lastDeathWasLogged then
        return;
    end
    
    -- Get current timestamp
    local gameTime = Turbine.Engine.GetGameTime();
    
    -- Get character info
    local characterName = self.player:GetName();
    local characterLevel = self.player:GetLevel();
    local raceName  = DeathTracker.RaceNames[self.player:GetRace()]   or "Unknown";
    local className = DeathTracker.ClassNames[self.player:GetClass()] or "Unknown";

    -- Location - LOTRO API is very limited and doesn't expose region names
    -- The player would need to manually add a plugin like "Where" or use coordinates
    -- For now we keep it as Unknown Location
    local locationName = "Unknown Location";
    
    -- We'll use TIMESTAMP placeholder for date/time - client will fill it in
    local formattedDate = "TIMESTAMP";
    local formattedTime = "TIMESTAMP";
    
    -- Create event record
    local eventRecord = {
        characterName  = characterName,
        eventType      = eventType,
        level          = characterLevel,
        race           = raceName,
        characterClass = className,
        timestamp      = gameTime,
        date           = formattedDate,
        time           = formattedTime,
        datetime       = formattedDate .. " " .. formattedTime,
        region         = locationName
    };
    
    -- Convert to JSON-like format
    local jsonString = DeathTracker:TableToJSON(eventRecord);
    
    -- Display notification in chat (clean, no TIMESTAMP shown)
    Turbine.Shell.WriteLine("=================================");
    if eventType == "death" then
        Turbine.Shell.WriteLine("DEATH RECORDED!");
    else
        Turbine.Shell.WriteLine("LEVEL UP RECORDED!");
    end
    Turbine.Shell.WriteLine("Character: " .. characterName);
    Turbine.Shell.WriteLine("Level: " .. characterLevel);
    Turbine.Shell.WriteLine("=================================");
    
    -- Display copyable message at the end
    if eventType == "death" then
        Turbine.Shell.WriteLine(characterName .. " ist mit Level " .. characterLevel .. " gestorben.");
    else
        Turbine.Shell.WriteLine(characterName .. " hat Level " .. characterLevel .. " erreicht!");
    end
    
    Turbine.Shell.WriteLine("=================================");
    
    if eventType == "death" then
        self.Config.lastDeathWasLogged = true;
    end
    
    -- Trigger external sync (this will be picked up by the client application)
    DeathTracker:WriteSyncFile(jsonString, eventType);
end

-- Schreibt Event-Daten in die spielinterne PluginData-Ablage.
-- Turbine.PluginData.Save() ist eine offizielle LOTRO API-Funktion.
-- Sie schreibt ausschliesslich in den spieleigenen PluginData-Ordner:
--   Dokumente\The Lord of the Rings Online\PluginData\[Server]\[Charakter]\
-- Es findet kein Netzwerkzugriff und keine Ausfuehrung externer Programme statt.
function DeathTracker:WriteSyncFile(jsonContent, eventType)
    -- This creates a file in the character-specific PluginData location
    -- Path: PluginData\[Server]\[Character]\DeathTracker_Sync\
    local syncData = {
        lastUpdate = Turbine.Engine.GetGameTime(),
        content = jsonContent,
        eventType = eventType,
        version = self.Config.version
    };
    
    -- Use Character scope so it saves under: PluginData\[Server]\[Character]\DeathTracker_Sync\
    Turbine.PluginData.Save(Turbine.DataScope.Character, "DeathTracker_Sync", syncData);
end

-- Konvertiert eine Lua-Tabelle in einen JSON-String.
-- Wird benoetigt weil LOTRO-Plugins kein natives JSON haben.
-- Kein Netzwerkzugriff, kein Systemaufruf - nur String-Operationen.
function DeathTracker:TableToJSON(tbl)
    local result = "{";
    local isFirst = true;
    
    for key, value in pairs(tbl) do
        if not isFirst then
            result = result .. ",";
        end
        isFirst = false;
        
        -- Add key
        result = result .. "\"" .. tostring(key) .. "\":";
        
        -- Add value based on type
        if type(value) == "string" then
            result = result .. "\"" .. value .. "\"";
        elseif type(value) == "number" then
            result = result .. tostring(value);
        elseif type(value) == "boolean" then
            result = result .. tostring(value);
        elseif type(value) == "table" then
            result = result .. DeathTracker:TableToJSON(value);
        else
            result = result .. "null";
        end
    end
    
    result = result .. "}";
    return result;
end

-- Initialize the plugin
DeathTracker:Initialize();
