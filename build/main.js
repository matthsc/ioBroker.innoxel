"use strict";
/*
 * Created with @iobroker/create-adapter v2.0.1
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Innoxel = void 0;
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = __importStar(require("@iobroker/adapter-core"));
// Load your modules here
const innoxel_soap_1 = require("innoxel-soap");
const deviceStatus_1 = require("./adapter/deviceStatus");
const identities_1 = require("./adapter/identities");
const messageHandler_1 = require("./adapter/messageHandler");
const modules_1 = require("./adapter/modules");
const roomClimate_1 = require("./adapter/roomClimate");
const weather_1 = require("./adapter/weather");
class Innoxel extends utils.Adapter {
    constructor(options = {}) {
        super({
            ...options,
            name: "innoxel",
        });
        this.lastIdXml = "";
        this.lastBootId = "";
        this.timeouts = Object.create(null);
        this.stopScheduling = true;
        this.terminating = false;
        this.checkChanges = async (first) => {
            if ((await this.updateLastIds()) || first) {
                const data = await this.api.getModuleStates();
                await (first ? (0, modules_1.createModuleStates)(this, data) : (0, modules_1.updateModuleStates)(this, data));
            }
        };
        this.updateRoomTemperatures = async () => {
            const data = await this.api.getRoomClimate([-1]);
            await (0, roomClimate_1.updateRoomClimate)(this, data);
        };
        this.updateWeather = async (first) => {
            const weather = await this.api.getWeather();
            await (first ? (0, weather_1.createWeatherStates)(this, weather) : (0, weather_1.updateWeatherStates)(this, weather));
        };
        this.updateDeviceStatus = async (first) => {
            const data = await this.api.getDeviceState();
            await (first ? (0, deviceStatus_1.createDeviceStatusStates)(this, data) : (0, deviceStatus_1.updateDeviceStatusStates)(this, data));
        };
        this.runAndSchedule = async (key, timeout, handler, first) => {
            if (timeout <= 0)
                return;
            try {
                await handler(first);
            }
            catch (err) {
                this.log.error(err.message);
                this.log.debug(err.toString());
            }
            if (!this.stopScheduling) {
                clearTimeout(this.timeouts[key]);
                const timer = setTimeout(this.runAndSchedule, timeout * 1000, key, timeout, handler, false);
                this.timeouts[key] = timer;
            }
        };
        this.on("ready", this.onReady.bind(this));
        // this.on("objectChange", this.onObjectChange.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("message", this.onMessage.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        const config = this.config;
        this.log.debug(`configuration: ${JSON.stringify({
            ...config,
            password: config.password && config.password !== "" ? "***" : "<empty>",
        })}`);
        // Reset the connection indicator during startup
        await this.setStateAsync("info.connection", false, true);
        // The adapters config (in the instance object everything under the attribute "native") is accessible via
        // this.config:
        if (!config.ipaddress || !config.port || !config.username || !config.password) {
            this.log.error("Innoxel master information missing. Please configure settings in adapter settings.");
            return;
        }
        // create api object
        this.api = new innoxel_soap_1.InnoxelApi({
            ip: config.ipaddress,
            port: config.port,
            user: config.username,
            password: this.decrypt(config.password),
        });
        // connecto to innoxel master and listen on state changes
        await this.setupConnection(true);
        for (const state of ["*.button", "moduleDim.*.outState"])
            await this.subscribeStatesAsync(state);
    }
    async setupConnection(first = false) {
        try {
            this.reconnect();
        }
        catch (err) {
            await this.setStateAsync("info.connection", false, true);
            this.log.error(err.message);
            if (first) {
                this.terminate(err.message);
            }
            else {
                // TODO: try connecting again
                // TODO: until now, we don't handle "disconnects", since we don't have "connections"
            }
        }
    }
    async reconnect() {
        this.cleanup();
        await this.updateLastIds();
        await this.setStateAsync("info.connection", true, true);
        this.log.info("Connection to innoxel master succeeded");
        this.stopScheduling = false;
        this.runAndSchedule("change", this.config.changeInterval, this.checkChanges, true);
        this.runAndSchedule("roomTemperature", this.config.roomTemperatureInterval, this.updateRoomTemperatures, true);
        this.runAndSchedule("weather", this.config.weatherInterval, this.updateWeather, true);
        this.runAndSchedule("deviceStatus", this.config.deviceStatusInterval, this.updateDeviceStatus, true);
    }
    async updateLastIds() {
        const xml = await this.api.getBootAndStateIdXml();
        if (this.lastIdXml !== xml) {
            this.lastIdXml = xml;
            const [bootId, stateId] = await this.api.getBootAndStateIds(xml);
            await Promise.all([
                this.setStateChangedAsync("info.bootId", bootId, true),
                this.setStateChangedAsync("info.stateId", stateId, true),
            ]);
            if (this.lastBootId !== bootId) {
                this.lastBootId = bootId;
                await this.updateIdentities();
            }
            return true;
        }
        return false;
    }
    async updateIdentities() {
        try {
            const data = await this.api.getIdentities();
            await (0, identities_1.createOrUpdateIdentities)(this, data);
        }
        catch (err) {
            this.log.error(err.message);
            this.log.debug(err.toString());
            this.terminate("Error updating identities");
        }
    }
    cleanup() {
        this.stopScheduling = true;
        const keys = Object.keys(this.timeouts);
        keys.forEach((key) => {
            clearTimeout(this.timeouts[key]);
        });
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        try {
            this.cleanup();
            this.log.info("cleaned everything up...");
            callback();
        }
        catch (e) {
            callback();
        }
    }
    /**
     * Is called if a subscribed state changes
     */
    async onStateChange(id, state) {
        if (!state) {
            // The state was deleted
            return;
        }
        if (state.ack) {
            // ignore acknowledged states
            return;
        }
        const idParts = id.split(".");
        const moduleIndex = Number.parseInt(idParts[3], 10);
        const channel = Number.parseInt(idParts[4], 10);
        const stateName = idParts[5];
        switch (idParts[2]) {
            case "moduleDim": {
                if (stateName === "outState") {
                    await this.api.setDimValue(moduleIndex, channel, state.val);
                }
                else if (stateName === "button") {
                    const dimmerStateParts = [...idParts];
                    dimmerStateParts[5] = "outState";
                    const dimmerStateId = dimmerStateParts.join(".");
                    const dimmerState = await this.getStateAsync(dimmerStateId);
                    await this.api.setDimValue(moduleIndex, channel, (dimmerState === null || dimmerState === void 0 ? void 0 : dimmerState.val) > 0 ? 0 : 100);
                }
                else {
                    return;
                }
                break;
            }
            case "moduleOut": {
                if (stateName === "button") {
                    await this.api.triggerOutModule(moduleIndex, channel);
                }
                else {
                    return;
                }
                break;
            }
            case "moduleIn": {
                if (stateName === "button") {
                    await this.api.triggerPushButton(moduleIndex, channel);
                }
                else {
                    return;
                }
                break;
            }
            default:
                return;
        }
        await this.checkChanges();
    }
    /**
     * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
     * Using this method requires "common.messagebox" property to be set to true in io-package.json
     */
    async onMessage(obj) {
        this.log.debug("message recieved: " + JSON.stringify(obj));
        if (typeof obj === "object" && obj.message) {
            try {
                const shouldReload = await (0, messageHandler_1.handleMessage)(this.api, obj);
                if (shouldReload)
                    await this.checkChanges();
            }
            catch (e) {
                this.log.error(`Error processing recieved message ${JSON.stringify(obj)}: ${e.message}`);
            }
        }
    }
}
exports.Innoxel = Innoxel;
if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options) => new Innoxel(options);
}
else {
    // otherwise start the instance directly
    (() => new Innoxel())();
}
//# sourceMappingURL=main.js.map