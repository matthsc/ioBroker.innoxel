/*
 * Created with @iobroker/create-adapter v2.0.1
 */
import "@iobroker/types";

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from "@iobroker/adapter-core";
// Load your modules here
import {
  EndpointError,
  FaultResponseError,
  InnoxelApi,
  type ModuleRoomClimateSetType,
  NetworkError,
  ResponseTagError,
} from "innoxel-soap";
import {
  createDeviceStatusStates,
  updateDeviceStatusStates,
} from "./adapter/deviceStatus.ts";
import { createOrUpdateIdentities } from "./adapter/identities.ts";
import { handleMessage } from "./adapter/messageHandler.ts";
import { createModuleStates, updateModuleStates } from "./adapter/modules.ts";
import { updateRoomClimate } from "./adapter/roomClimate.ts";
import { createWeatherStates, updateWeatherStates } from "./adapter/weather.ts";
import esMain from "./lib/esMain.ts";

const INITIAL_RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_DELAY_MS = 60_000;

interface ITimeoutsKeys {
  change: ioBroker.Timeout;
  weather: ioBroker.Timeout;
  roomTemperature: ioBroker.Timeout;
  deviceStatus: ioBroker.Timeout;
}
type ITimeouts = {
  [key in keyof ITimeoutsKeys]: ioBroker.Timeout;
} & ITimeoutsKeys;

export class Innoxel extends utils.Adapter {
  private api!: InnoxelApi;
  private lastIdXml = "";
  private lastBootId = "";

  private timeouts = Object.create(null) as ITimeouts;
  private reconnectTimeout?: ioBroker.Timeout;
  private stopScheduling = true;
  private masterConnected = false;
  private reconnectAttempted = false;
  private unloading = false;
  private reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
  private initialized = {
    change: false,
    weather: false,
    deviceStatus: false,
  };

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
    await this.setState("info.connection", false, true);

    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // this.config:
    if (
      !config.ipaddress ||
      !config.port ||
      !config.username ||
      !config.password
    ) {
      this.log.error(
        "Innoxel master information missing. Please configure settings in adapter settings.",
      );
      return;
    }

    // create api object
    this.api = this.createApi(
      config.ipaddress,
      config.port,
      config.username,
      config.password,
    );

    // connect to innoxel master and listen on state changes
    await this.setupConnection();
    for (const state of ["*.button", "moduleDim.*.outState", "roomClimate.*"])
      await this.subscribeStatesAsync(state);
  }

  private async setupConnection(): Promise<void> {
    if (this.unloading) return;
    try {
      await this.reconnect();
    } catch (error: unknown) {
      await this.handleConnectionError(error, "setupConnection");
    }
  }

  private async reconnect(): Promise<void> {
    this.cleanup();
    await this.updateLastIds();
    this.masterConnected = true;
    this.reconnectAttempted = false;
    this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;

    this.stopScheduling = false;
    await Promise.all([
      this.runAndSchedule(
        "change",
        this.config.changeInterval,
        this.checkChanges,
      ),
      this.runAndSchedule(
        "roomTemperature",
        this.config.roomTemperatureInterval,
        this.updateRoomTemperatures,
      ),
      this.runAndSchedule(
        "weather",
        this.config.weatherInterval,
        this.updateWeather,
      ),
      this.runAndSchedule(
        "deviceStatus",
        this.config.deviceStatusInterval,
        this.updateDeviceStatus,
      ),
    ]);
    if (this.masterConnected && !this.unloading) {
      await this.setState("info.connection", true, true);
      this.log.info("Successfully connected to Innoxel Master");
    }
  }

  private async updateLastIds(): Promise<boolean> {
    const xml = await this.api.getBootAndStateIdXml();
    if (this.lastIdXml === xml) {
      return false;
    }

    const [bootId, stateId] = await this.api.getBootAndStateIds(xml);
    await Promise.all([
      this.setStateChangedAsync("info.bootId", bootId, true),
      this.setStateChangedAsync("info.stateId", stateId, true),
    ]);
    if (this.lastBootId !== bootId) {
      await this.updateIdentities();
      this.lastBootId = bootId;
    }
    this.lastIdXml = xml;
    return true;
  }

  private checkChanges = async (): Promise<void> => {
    const first = !this.initialized.change;
    if ((await this.updateLastIds()) || first) {
      const data = await this.api.getModuleStates();
      await (first
        ? createModuleStates(this, data)
        : updateModuleStates(this, data));
      this.initialized.change = true;
    }
  };
  private updateRoomTemperatures = async (): Promise<void> => {
    const data = await this.api.getRoomClimate([-1]);
    await updateRoomClimate(this, data);
  };

  private updateWeather = async (): Promise<void> => {
    const first = !this.initialized.weather;
    const weather = await this.api.getWeather();
    await (first
      ? createWeatherStates(this, weather)
      : updateWeatherStates(this, weather));
    this.initialized.weather = true;
  };

  private updateDeviceStatus = async (): Promise<void> => {
    const first = !this.initialized.deviceStatus;
    const data = await this.api.getDeviceState();
    await (first
      ? createDeviceStatusStates(this, data)
      : updateDeviceStatusStates(this, data));
    this.initialized.deviceStatus = true;
  };

  private async updateIdentities(): Promise<void> {
    const data = await this.api.getIdentities();
    await createOrUpdateIdentities(this, data);
  }

  private async runAndSchedule(
    key: keyof ITimeouts,
    timeout: number,
    handler: () => Promise<void>,
  ): Promise<void> {
    if (timeout <= 0 || this.stopScheduling || this.unloading) return;

    try {
      await handler();
    } catch (err: unknown) {
      await this.handleConnectionError(err, `runAndSchedule ${key}`);
      return;
    }

    if (!this.stopScheduling && !this.unloading) {
      this.clearTimeout(this.timeouts[key]);
      this.timeouts[key] = this.setTimeout(() => {
        void this.runAndSchedule(key, timeout, handler);
      }, timeout * 1000) as ioBroker.Timeout;
    }
  }

  private isPermanentError(error: unknown): boolean {
    if (error instanceof EndpointError) {
      return error.statusCode === 401 || error.statusCode === 404;
    }
    return error instanceof ResponseTagError;
  }

  private async handleConnectionError(
    error: unknown,
    prefix: string,
  ): Promise<void> {
    if (this.isPermanentError(error)) {
      this.masterConnected = false;
      this.cleanup();
      await this.setState("info.connection", false, true);
      this.logError(error, prefix);
      this.terminate("terminating adapter because of previous error");
      return;
    }

    const wasConnected = this.masterConnected;
    this.masterConnected = false;
    this.lastIdXml = "";
    this.cleanup();

    if (wasConnected || !this.reconnectAttempted) {
      this.reconnectAttempted = true;
      await this.setState("info.connection", false, true);
      this.logError(error, prefix);
    } else {
      this.logError(error, prefix, "debug");
    }

    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.unloading || this.reconnectTimeout) return;

    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(
      this.reconnectDelayMs * 2,
      MAX_RECONNECT_DELAY_MS,
    );
    this.log.debug(`Scheduling reconnect in ${delay / 1000}s`);
    this.reconnectTimeout = this.setTimeout(() => {
      this.reconnectTimeout = undefined;
      void this.setupConnection();
    }, delay) as ioBroker.Timeout;
  }

  private cleanup(): void {
    this.stopScheduling = true;
    const keys = Object.keys(this.timeouts) as (keyof ITimeoutsKeys)[];
    for (const key of keys) {
      this.clearTimeout(this.timeouts[key]);
    }
    if (this.reconnectTimeout) {
      this.clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }
  }

  private logError(
    error: unknown,
    prefix: string,
    level: "error" | "debug" = "error",
  ): void {
    this.log[level](`${prefix}: ${this.formatError(error)}`);
  }

  private formatError(error: unknown): string {
    if (error instanceof NetworkError) {
      return `Error connecting to Innoxel Master: ${error.message}`;
    }
    if (error instanceof EndpointError) {
      if (error.statusCode === 401) {
        return `Cannot authenticate to Innoxel Master, please check username/password: retrieved ${
          error.statusCode
        } - ${error.message || "<no message>"}`;
      }
      return `Error from Innoxel Master: ${error.statusCode} - ${error.message}`;
    }
    if (error instanceof ResponseTagError) {
      return `Wrong response tag for action '${error.action}': ${error.response}`;
    }
    if (error instanceof FaultResponseError) {
      return `Fault response recieved from Innoxel Master: ${error.fault}`;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return JSON.stringify(error);
  }

  /**
   * Is called when adapter shuts down - callback has to be called under any circumstances!
   */
  private onUnload(callback: () => void): void {
    try {
      this.unloading = true;
      this.cleanup();
      this.log.info("cleaned everything up...");
      callback();
    } catch {
      callback();
    }
  }

  /**
   * Is called if a subscribed state changes
   */
  private async onStateChange(
    id: string,
    state: ioBroker.State | null | undefined,
  ): Promise<void> {
    if (!state) {
      // The state was deleted
      return;
    }
    if (state.ack) {
      // ignore acknowledged states
      return;
    }

    this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);

    try {
      const idParts = id.split(".");
      const moduleType = idParts[2];
      const moduleIndex = Number.parseInt(idParts[3], 10);
      if (moduleType === "roomClimate") {
        const temperatureType =
          idParts[4] as unknown as ModuleRoomClimateSetType;
        await this.api.setRoomClimate(
          moduleIndex,
          temperatureType,
          state.val as number,
        );
        await this.updateRoomTemperatures();
      } else {
        const channel = Number.parseInt(idParts[4], 10);
        const stateName = idParts[5];
        switch (moduleType) {
          case "moduleDim": {
            if (stateName === "outState") {
              await this.api.setDimValue(
                moduleIndex,
                channel,
                state.val as number,
              );
            } else if (stateName === "button") {
              const dimmerStateParts = [...idParts];
              dimmerStateParts[5] = "outState";
              const dimmerStateId = dimmerStateParts.join(".");
              const dimmerState = await this.getStateAsync(dimmerStateId);
              await this.api.setDimValue(
                moduleIndex,
                channel,
                (dimmerState?.val as number) > 0 ? 0 : 100,
              );
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
      }
    } catch (e: unknown) {
      const err = e as Error;
      this.log.error(
        `Error processing state change for ${id} (val=${state.val}): ${err.message}`,
      );
      this.log.debug(err.toString());
    }

    try {
      await this.checkChanges();
    } catch (err: unknown) {
      await this.handleConnectionError(err, "onStateChange checkChanges");
    }
  }

  private createApi(
    ip: string,
    port: number,
    user: string,
    password: string,
  ): InnoxelApi {
    return new InnoxelApi({
      ip,
      port,
      user,
      password,
      soapLogger:
        this.log.level !== "silly"
          ? undefined
          : (status, message) => {
              this.log.silly(`${status}: ${message}`);
            },
    });
  }

  private async handleTestConnection(obj: ioBroker.Message): Promise<void> {
    if (!obj.callback) return;

    const payload =
      typeof obj.message === "string"
        ? (JSON.parse(obj.message) as Record<string, unknown>)
        : (obj.message as Record<string, unknown>);

    const ipaddress = payload.ipaddress;
    const port = Number(payload.port);
    const username = payload.username;
    const password = payload.password;

    if (
      typeof ipaddress !== "string" ||
      !ipaddress ||
      !Number.isFinite(port) ||
      port <= 0 ||
      typeof username !== "string" ||
      !username ||
      typeof password !== "string" ||
      !password
    ) {
      this.sendTo(
        obj.from,
        obj.command,
        { error: "Innoxel master information missing." },
        obj.callback,
      );
      return;
    }

    try {
      const testApi = this.createApi(ipaddress, port, username, password);
      await testApi.getBootAndStateIdXml();
      this.sendTo(
        obj.from,
        obj.command,
        { result: "Successfully connected to Innoxel Master" },
        obj.callback,
      );
    } catch (error: unknown) {
      this.sendTo(
        obj.from,
        obj.command,
        { error: this.formatError(error) },
        obj.callback,
      );
    }
  }

  /**
   * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
   * Using this method requires "common.messagebox" property to be set to true in io-package.json
   */
  private async onMessage(obj: ioBroker.Message): Promise<void> {
    this.log.debug(`message recieved: ${JSON.stringify(obj)}`);
    if (typeof obj === "object" && obj.message) {
      if (obj.command === "testConnection") {
        await this.handleTestConnection(obj);
        return;
      }
      try {
        const shouldReload = await handleMessage(this.api, obj);
        if (shouldReload.reloadModules) await this.checkChanges();
        if (shouldReload.reloadRoomClimates)
          await this.updateRoomTemperatures();
        if (obj.callback) {
          const response =
            shouldReload.reloadModules || shouldReload.reloadRoomClimates
              ? { result: "ok" }
              : { error: `Unknown command: ${obj.command}` };
          this.sendTo(obj.from, obj.command, response, obj.callback);
        }
      } catch (e: unknown) {
        const errorMessage = this.formatError(e);
        this.log.error(
          `Error processing recieved message ${JSON.stringify(obj)}: ${errorMessage}`,
        );
        if (obj.callback) {
          this.sendTo(
            obj.from,
            obj.command,
            { error: errorMessage },
            obj.callback,
          );
        }
      }
    }
  }
}

// if (require.main !== module) {
//   // Export the constructor in compact mode
//   module.exports = (options: Partial<utils.AdapterOptions> | undefined) =>
//     new Innoxel(options);
// } else {
//   // otherwise start the instance directly
//   (() => new Innoxel())();
// }

// if (require.main !== module) {
// Export the constructor for compact mode
export default (options: Partial<utils.AdapterOptions> | undefined) =>
  new Innoxel(options);
// } else {
if (esMain(import.meta)) {
  // otherwise start the instance directly
  (() => new Innoxel())();
}
