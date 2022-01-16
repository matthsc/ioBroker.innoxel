/*
 * Created with @iobroker/create-adapter v2.0.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from "@iobroker/adapter-core";
// Load your modules here
import { EndpointError, FaultResponseError, InnoxelApi, NetworkError, ResponseTagError } from "innoxel-soap";
import { createDeviceStatusStates, updateDeviceStatusStates } from "./adapter/deviceStatus";
import { createOrUpdateIdentities } from "./adapter/identities";
import { handleMessage } from "./adapter/messageHandler";
import { createModuleStates, updateModuleStates } from "./adapter/modules";
import { updateRoomClimate } from "./adapter/roomClimate";
import { createWeatherStates, updateWeatherStates } from "./adapter/weather";

interface ITimeoutsKeys {
    change: NodeJS.Timeout;
    weather: NodeJS.Timeout;
    roomTemperature: NodeJS.Timeout;
    deviceStatus: NodeJS.Timeout;
}
type ITimeouts = {
    [key in keyof ITimeoutsKeys]: NodeJS.Timeout;
} & ITimeoutsKeys;

export class Innoxel extends utils.Adapter {
    private api!: InnoxelApi;
    private lastIdXml = "";
    private lastBootId = "";

    private timeouts = Object.create(null) as ITimeouts;
    private stopScheduling = true;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: "innoxel",
        });
        this.on("ready", this.onReady.bind(this));
        // this.on("objectChange", this.onObjectChange.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("message", this.onMessage.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        const config = this.config;
        this.log.debug(
            `configuration: ${JSON.stringify({
                ...config,
                password: config.password && config.password !== "" ? "***" : "<empty>",
            })}`,
        );

        // Reset the connection indicator during startup
        await this.setStateAsync("info.connection", false, true);

        // The adapters config (in the instance object everything under the attribute "native") is accessible via
        // this.config:
        if (!config.ipaddress || !config.port || !config.username || !config.password) {
            this.log.error("Innoxel master information missing. Please configure settings in adapter settings.");
            return;
        }

        // create api object
        this.api = new InnoxelApi({
            ip: config.ipaddress,
            port: config.port,
            user: config.username,
            password: config.password,
        });

        // connecto to innoxel master and listen on state changes
        await this.setupConnection(true);
        for (const state of ["*.button", "moduleDim.*.outState"]) await this.subscribeStatesAsync(state);
    }

    private async setupConnection(first = false): Promise<void> {
        try {
            await this.reconnect();
        } catch (error: unknown) {
            await this.setStateAsync("info.connection", false, true);
            this.logError(error);

            if (first) {
                this.terminate("terminating adapter because of previous error");
            } else {
                // TODO: try connecting again
                // TODO: until now, we don't handle "disconnects", since we don't have "connections"
            }
        }
    }

    private async reconnect(): Promise<void> {
        this.cleanup();
        await this.updateLastIds();
        await this.setStateAsync("info.connection", true, true);
        this.log.info("Successfully connected to Innoxel Master");

        this.stopScheduling = false;
        this.runAndSchedule("change", this.config.changeInterval, this.checkChanges, true);
        this.runAndSchedule("roomTemperature", this.config.roomTemperatureInterval, this.updateRoomTemperatures, true);
        this.runAndSchedule("weather", this.config.weatherInterval, this.updateWeather, true);
        this.runAndSchedule("deviceStatus", this.config.deviceStatusInterval, this.updateDeviceStatus, true);
    }

    private async updateLastIds(): Promise<boolean> {
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

    private checkChanges = async (first?: boolean): Promise<void> => {
        if ((await this.updateLastIds()) || first) {
            const data = await this.api.getModuleStates();
            await (first ? createModuleStates(this, data) : updateModuleStates(this, data));
        }
    };
    private updateRoomTemperatures = async (): Promise<void> => {
        const data = await this.api.getRoomClimate([-1]);
        await updateRoomClimate(this, data);
    };

    private updateWeather = async (first?: boolean): Promise<void> => {
        const weather = await this.api.getWeather();
        await (first ? createWeatherStates(this, weather) : updateWeatherStates(this, weather));
    };

    private updateDeviceStatus = async (first?: boolean): Promise<void> => {
        const data = await this.api.getDeviceState();
        await (first ? createDeviceStatusStates(this, data) : updateDeviceStatusStates(this, data));
    };
    private async updateIdentities(): Promise<void> {
        try {
            const data = await this.api.getIdentities();
            await createOrUpdateIdentities(this, data);
        } catch (err: any) {
            this.log.error(err.message);
            this.log.debug(err.toString());
            this.terminate("Error updating identities");
        }
    }

    private runAndSchedule = async (
        key: keyof ITimeouts,
        timeout: number,
        handler: (first?: boolean) => Promise<any>,
        first?: boolean,
    ): Promise<void> => {
        if (timeout <= 0) return;

        try {
            await handler(first);
        } catch (err: unknown) {
            this.logError(err);
        }

        if (!this.stopScheduling) {
            clearTimeout(this.timeouts[key]);
            const timer = setTimeout(this.runAndSchedule, timeout * 1000, key, timeout, handler, false);
            this.timeouts[key] = timer as unknown as NodeJS.Timeout;
        }
    };

    private cleanup(): void {
        this.stopScheduling = true;
        const keys = Object.keys(this.timeouts) as (keyof ITimeoutsKeys)[];
        keys.forEach((key) => {
            clearTimeout(this.timeouts[key]);
        });
    }

    private logError(error: unknown): void {
        let message: string;

        if (error instanceof NetworkError) {
            message = "Error connecting to Innoxel Master: " + error.message;
        } else if (error instanceof EndpointError) {
            if (error.statusCode === 401) {
                message = `Cannot authenticate to Innoxel Master, please check username/password: retrieved ${
                    error.statusCode
                } - ${error.message || "<no message>"}`;
            } else {
                message = `Error from Innoxel Master: ${error.statusCode} - ${error.message}`;
            }
        } else if (error instanceof ResponseTagError) {
            message = `Wrong response tag for action '${error.action}': ${error.response}`;
        } else if (error instanceof FaultResponseError) {
            message = `Fault response recieved from Innoxel Master: ${error.fault}`;
        } else if (error instanceof Error) {
            message = error.message;
        } else {
            message = JSON.stringify(error);
        }

        this.log.error(message);
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    private onUnload(callback: () => void): void {
        try {
            this.cleanup();
            this.log.info("cleaned everything up...");
            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes
     */
    private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
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
                    await this.api.setDimValue(moduleIndex, channel, state.val as number);
                } else if (stateName === "button") {
                    const dimmerStateParts = [...idParts];
                    dimmerStateParts[5] = "outState";
                    const dimmerStateId = dimmerStateParts.join(".");
                    const dimmerState = await this.getStateAsync(dimmerStateId);
                    await this.api.setDimValue(moduleIndex, channel, (dimmerState?.val as number) > 0 ? 0 : 100);
                } else {
                    return;
                }
                break;
            }
            case "moduleOut": {
                if (stateName === "button") {
                    await this.api.triggerOutModule(moduleIndex, channel);
                } else {
                    return;
                }
                break;
            }
            case "moduleIn": {
                if (stateName === "button") {
                    await this.api.triggerPushButton(moduleIndex, channel);
                } else {
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
    private async onMessage(obj: ioBroker.Message): Promise<void> {
        this.log.debug("message recieved: " + JSON.stringify(obj));
        if (typeof obj === "object" && obj.message) {
            try {
                const shouldReload = await handleMessage(this.api, obj);
                if (shouldReload) await this.checkChanges();
            } catch (e: any) {
                this.log.error(`Error processing recieved message ${JSON.stringify(obj)}: ${e.message}`);
            }
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Innoxel(options);
} else {
    // otherwise start the instance directly
    (() => new Innoxel())();
}
