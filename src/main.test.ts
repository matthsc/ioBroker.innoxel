import { expect } from "chai";
import {
  EndpointError,
  FaultResponseError,
  NetworkError,
  ResponseTagError,
} from "innoxel-soap";
import sinon from "sinon";
import { Innoxel } from "./main.ts";

interface InnoxelInternals {
  config: Partial<ioBroker.AdapterConfig>;
  api: Record<string, sinon.SinonStub>;
  timeouts: Record<string, ioBroker.Timeout>;
  reconnectTimeout?: ioBroker.Timeout;
  stopScheduling: boolean;
  masterConnected: boolean;
  reconnectAttempted: boolean;
  unloading: boolean;
  reconnectDelayMs: number;
  lastIdXml: string;
  lastBootId: string;
  initialized: {
    change: boolean;
    weather: boolean;
    deviceStatus: boolean;
  };
  log: {
    debug: sinon.SinonStub;
    info: sinon.SinonStub;
    error: sinon.SinonStub;
    level: string;
  };
  setState: sinon.SinonStub;
  setStateChangedAsync: sinon.SinonStub;
  extendObject: sinon.SinonStub;
  getStateAsync: sinon.SinonStub;
  subscribeStatesAsync: sinon.SinonStub;
  clearTimeout: sinon.SinonStub;
  setTimeout: sinon.SinonStub;
  terminate: sinon.SinonStub;
  sendTo: sinon.SinonStub;
  createApi: sinon.SinonStub;
  checkChanges: sinon.SinonStub;
  updateRoomTemperatures: sinon.SinonStub;
  onReady(): Promise<void>;
  setupConnection(): Promise<void>;
  runAndSchedule(
    key: string,
    timeout: number,
    handler: () => Promise<void>,
  ): Promise<void>;
  onStateChange(
    id: string,
    state: ioBroker.State | null | undefined,
  ): Promise<void>;
  onMessage(obj: ioBroker.Message): Promise<void>;
  onUnload(callback: () => void): void;
  logError(error: unknown, prefix: string): void;
}

function createInnoxelStub(): InnoxelInternals {
  const instance = Object.create(Innoxel.prototype) as InnoxelInternals;
  instance.config = {};
  instance.timeouts = Object.create(null);
  instance.stopScheduling = true;
  instance.masterConnected = false;
  instance.reconnectAttempted = false;
  instance.unloading = false;
  instance.reconnectDelayMs = 5_000;
  instance.lastIdXml = "";
  instance.lastBootId = "";
  instance.initialized = {
    change: false,
    weather: false,
    deviceStatus: false,
  };
  instance.api = {
    setRoomClimate: sinon.stub().resolves(21),
    setDimValue: sinon.stub().resolves(),
    triggerOutModule: sinon.stub().resolves(),
    triggerPushButton: sinon.stub().resolves(),
    getBootAndStateIdXml: sinon.stub().resolves("<xml />"),
    getBootAndStateIds: sinon.stub().resolves(["1", "1"]),
    getIdentities: sinon.stub().resolves([]),
  };
  instance.log = {
    debug: sinon.stub(),
    info: sinon.stub(),
    error: sinon.stub(),
    level: "info",
  };
  instance.setState = sinon.stub().resolves();
  instance.setStateChangedAsync = sinon.stub().resolves();
  instance.extendObject = sinon.stub().resolves();
  instance.getStateAsync = sinon.stub().resolves({ val: 0 });
  instance.subscribeStatesAsync = sinon.stub().resolves();
  instance.clearTimeout = sinon.stub();
  instance.setTimeout = sinon.stub();
  instance.terminate = sinon.stub();
  instance.sendTo = sinon.stub();
  instance.createApi = sinon.stub().returns(instance.api);
  instance.checkChanges = sinon.stub().resolves();
  instance.updateRoomTemperatures = sinon.stub().resolves();
  return instance;
}

describe("Innoxel adapter", () => {
  describe("onReady", () => {
    it("resets info.connection and stops when config is incomplete", async () => {
      const adapter = createInnoxelStub();
      adapter.config = { ipaddress: "127.0.0.1" };

      await adapter.onReady();

      expect(adapter.setState).to.have.been.calledOnceWithExactly(
        "info.connection",
        false,
        true,
      );
      expect(adapter.log.error).to.have.been.calledOnce;
      expect(adapter.subscribeStatesAsync).to.not.have.been.called;
    });

    it("subscribes to states before connecting", async () => {
      const adapter = createInnoxelStub();
      adapter.config = {
        ipaddress: "127.0.0.1",
        port: 5001,
        username: "admin",
        password: "secret",
        changeInterval: 0,
        roomTemperatureInterval: 0,
        weatherInterval: 0,
        deviceStatusInterval: 0,
      };

      await adapter.onReady();

      expect(adapter.subscribeStatesAsync).to.have.been.calledThrice;
      expect(
        adapter.subscribeStatesAsync.lastCall.calledBefore(
          adapter.api.getBootAndStateIdXml.firstCall,
        ),
      ).to.equal(true);
    });
  });

  describe("onStateChange", () => {
    it("ignores deleted or acknowledged states", async () => {
      const adapter = createInnoxelStub();

      await adapter.onStateChange("innoxel.0.moduleIn.001.0.button", null);
      await adapter.onStateChange("innoxel.0.moduleIn.001.0.button", {
        val: true,
        ack: true,
        ts: 0,
        lc: 0,
        from: "",
      });

      expect(adapter.checkChanges).to.not.have.been.called;
    });

    it("dispatches roomClimate state changes", async () => {
      const adapter = createInnoxelStub();

      await adapter.onStateChange(
        "innoxel.0.roomClimate.2.setTemperatureHeating",
        { val: 22.5, ack: false, ts: 0, lc: 0, from: "" },
      );

      expect(adapter.api.setRoomClimate).to.have.been.calledOnceWithExactly(
        2,
        "setTemperatureHeating",
        22.5,
      );
      expect(adapter.updateRoomTemperatures).to.have.been.calledOnce;
      expect(adapter.checkChanges).to.have.been.calledOnce;
    });

    it("dispatches moduleDim outState and toggles moduleDim button", async () => {
      const adapter = createInnoxelStub();

      await adapter.onStateChange("innoxel.0.moduleDim.001.2.outState", {
        val: 40,
        ack: false,
        ts: 0,
        lc: 0,
        from: "",
      });
      expect(adapter.api.setDimValue).to.have.been.calledWithExactly(1, 2, 40);

      adapter.getStateAsync.resolves({ val: 60 });
      await adapter.onStateChange("innoxel.0.moduleDim.001.2.button", {
        val: true,
        ack: false,
        ts: 0,
        lc: 0,
        from: "",
      });
      expect(adapter.getStateAsync).to.have.been.calledOnceWithExactly(
        "innoxel.0.moduleDim.001.2.outState",
      );
      expect(adapter.api.setDimValue).to.have.been.calledWithExactly(1, 2, 0);
    });

    it("dispatches moduleOut and moduleIn button and logs API errors", async () => {
      const adapter = createInnoxelStub();

      await adapter.onStateChange("innoxel.0.moduleOut.003.1.button", {
        val: true,
        ack: false,
        ts: 0,
        lc: 0,
        from: "",
      });
      expect(adapter.api.triggerOutModule).to.have.been.calledOnceWithExactly(
        3,
        1,
      );

      adapter.api.triggerPushButton.rejects(new Error("boom"));
      await adapter.onStateChange("innoxel.0.moduleIn.004.0.button", {
        val: true,
        ack: false,
        ts: 0,
        lc: 0,
        from: "",
      });
      expect(adapter.log.error).to.have.been.calledOnce;
      expect(adapter.checkChanges).to.have.been.calledTwice;
    });
  });

  describe("onMessage", () => {
    it("reloads modules or room climates based on handled command", async () => {
      const adapter = createInnoxelStub();

      await adapter.onMessage({
        command: "triggerInModule",
        message: "1:0",
        from: "admin.0",
        _id: 1,
      });
      expect(adapter.api.triggerPushButton).to.have.been.calledOnceWithExactly(
        1,
        0,
      );
      expect(adapter.checkChanges).to.have.been.calledOnce;

      await adapter.onMessage({
        command: "setTemperature",
        message: "2:setTemperatureCooling:23",
        from: "admin.0",
        _id: 2,
      });
      expect(adapter.updateRoomTemperatures).to.have.been.calledOnce;
    });

    it("logs errors thrown during message handling", async () => {
      const adapter = createInnoxelStub();
      adapter.api.triggerPushButton.rejects(new Error("bad"));

      await adapter.onMessage({
        command: "triggerInModule",
        message: "1:0",
        from: "admin.0",
        _id: 1,
      });

      expect(adapter.log.error).to.have.been.calledOnce;
      expect(adapter.sendTo).to.not.have.been.called;
    });

    it("sends callback response on success and error when callback is provided", async () => {
      const adapter = createInnoxelStub();
      const callback = {
        message: {},
        id: 1,
        ack: false,
        time: 0,
      } as ioBroker.MessageCallbackInfo;

      await adapter.onMessage({
        command: "triggerInModule",
        message: "1:0",
        from: "javascript.0",
        callback,
        _id: 1,
      });

      expect(adapter.sendTo).to.have.been.calledOnceWithExactly(
        "javascript.0",
        "triggerInModule",
        { result: "ok" },
        callback,
      );

      adapter.sendTo.resetHistory();
      adapter.api.triggerPushButton.rejects(new Error("bad"));

      await adapter.onMessage({
        command: "triggerInModule",
        message: "1:0",
        from: "javascript.0",
        callback,
        _id: 2,
      });

      expect(adapter.sendTo).to.have.been.calledOnceWithExactly(
        "javascript.0",
        "triggerInModule",
        { error: "bad" },
        callback,
      );
    });

    it("tests connection and replies with result or formatted error", async () => {
      const adapter = createInnoxelStub();
      const callback = {
        message: {},
        id: 1,
        ack: false,
        time: 0,
      } as ioBroker.MessageCallbackInfo;

      await adapter.onMessage({
        command: "testConnection",
        message: {
          ipaddress: "192.168.0.10",
          port: 5001,
          username: "admin",
          password: "secret",
        },
        from: "system.adapter.admin.0",
        callback,
        _id: 3,
      });

      expect(adapter.createApi).to.have.been.calledOnceWithExactly(
        "192.168.0.10",
        5001,
        "admin",
        "secret",
      );
      expect(adapter.sendTo).to.have.been.calledOnceWithExactly(
        "system.adapter.admin.0",
        "testConnection",
        { result: "Successfully connected to Innoxel Master" },
        callback,
      );

      adapter.sendTo.resetHistory();
      adapter.api.getBootAndStateIdXml.rejects(
        new EndpointError(401, "Unauthorized"),
      );

      await adapter.onMessage({
        command: "testConnection",
        message: {
          ipaddress: "192.168.0.10",
          port: 5001,
          username: "admin",
          password: "wrong",
        },
        from: "system.adapter.admin.0",
        callback,
        _id: 4,
      });

      expect(adapter.sendTo).to.have.been.calledOnce;
      expect(adapter.sendTo).to.have.been.calledWithMatch(
        "system.adapter.admin.0",
        "testConnection",
        { error: sinon.match("Cannot authenticate to Innoxel Master") },
        callback,
      );
    });

    it("replies with error on invalid testConnection JSON or uninitialized api", async () => {
      const adapter = createInnoxelStub();
      const callback = {
        message: {},
        id: 1,
        ack: false,
        time: 0,
      } as ioBroker.MessageCallbackInfo;

      await adapter.onMessage({
        command: "testConnection",
        message: "{invalid",
        from: "system.adapter.admin.0",
        callback,
        _id: 5,
      });
      expect(adapter.sendTo).to.have.been.calledOnceWithExactly(
        "system.adapter.admin.0",
        "testConnection",
        { error: "Invalid message payload." },
        callback,
      );

      adapter.sendTo.resetHistory();
      adapter.api = undefined as unknown as Record<string, sinon.SinonStub>;
      await adapter.onMessage({
        command: "triggerInModule",
        message: "1:0",
        from: "javascript.0",
        callback,
        _id: 6,
      });
      expect(adapter.sendTo).to.have.been.calledOnceWithExactly(
        "javascript.0",
        "triggerInModule",
        { error: "Adapter not initialized." },
        callback,
      );
    });
  });

  describe("onUnload", () => {
    it("clears timeouts and invokes callback", () => {
      const adapter = createInnoxelStub();
      const timeout = {} as ioBroker.Timeout;
      adapter.timeouts.change = timeout;
      adapter.stopScheduling = false;
      const cb = sinon.stub();

      adapter.onUnload(cb);

      expect(adapter.stopScheduling).to.equal(true);
      expect(adapter.clearTimeout).to.have.been.calledOnceWithExactly(timeout);
      expect(cb).to.have.been.calledOnce;
    });
  });

  describe("logError", () => {
    it("formats NetworkError, EndpointError, ResponseTagError, and FaultResponseError", () => {
      const adapter = createInnoxelStub();

      adapter.logError(new NetworkError(new Error("ECONNREFUSED")), "p");
      adapter.logError(new EndpointError(401, "Unauthorized"), "p");
      adapter.logError(new EndpointError(500, "Server"), "p");
      adapter.logError(new ResponseTagError("getState", {}), "p");
      adapter.logError(new FaultResponseError("fault"), "p");

      expect(adapter.log.error).to.have.been.calledWithMatch(
        "p: Error connecting to Innoxel Master: ECONNREFUSED",
      );
      expect(adapter.log.error).to.have.been.calledWithMatch(
        "Cannot authenticate to Innoxel Master",
      );
      expect(adapter.log.error).to.have.been.calledWithMatch(
        "Error from Innoxel Master: 500 - Server",
      );
      expect(adapter.log.error).to.have.been.calledWithMatch(
        "Wrong response tag for action 'getState'",
      );
      expect(adapter.log.error).to.have.been.calledWithMatch(
        "Fault response recieved from Innoxel Master",
      );
    });
  });

  describe("reconnect and backoff", () => {
    it("retries with exponential backoff without spamming errors or terminating on transient failure", async () => {
      const adapter = createInnoxelStub();
      adapter.config = {
        changeInterval: 0,
        roomTemperatureInterval: 0,
        weatherInterval: 0,
        deviceStatusInterval: 0,
      };
      adapter.api.getBootAndStateIdXml.rejects(
        new NetworkError(new Error("ECONNREFUSED")),
      );
      const fakeTimer = {} as ioBroker.Timeout;
      adapter.setTimeout.returns(fakeTimer);

      // First failure logs error once and schedules 5s reconnect
      await adapter.setupConnection();
      expect(adapter.terminate).to.not.have.been.called;
      expect(adapter.setState).to.have.been.calledWithExactly(
        "info.connection",
        false,
        true,
      );
      expect(adapter.log.error).to.have.been.calledOnce;
      expect(adapter.setTimeout.firstCall.args[1]).to.equal(5_000);

      // Simulate timer firing for second failure: logs debug only and backs off to 10s
      const retryCallback = adapter.setTimeout.firstCall
        .args[0] as () => void;
      retryCallback();
      await new Promise((resolve) => setImmediate(resolve));

      expect(adapter.log.error).to.have.been.calledOnce;
      expect(adapter.log.debug).to.have.been.calledWithMatch(
        "setupConnection: Error connecting to Innoxel Master: ECONNREFUSED",
      );
      expect(adapter.setTimeout.secondCall.args[1]).to.equal(10_000);

      // Master comes online: reconnects and resets backoff
      adapter.api.getBootAndStateIdXml.resolves("<xml />");
      const secondRetryCallback = adapter.setTimeout.secondCall
        .args[0] as () => void;
      secondRetryCallback();
      await new Promise((resolve) => setImmediate(resolve));

      expect(adapter.masterConnected).to.equal(true);
      expect(adapter.reconnectDelayMs).to.equal(5_000);
      expect(adapter.setState).to.have.been.calledWithExactly(
        "info.connection",
        true,
        true,
      );
      expect(adapter.log.info).to.have.been.calledWithExactly(
        "Successfully connected to Innoxel Master",
      );
    });

    it("terminates immediately on permanent 401, 404, or ResponseTagError", async () => {
      for (const error of [
        new EndpointError(401, "Unauthorized"),
        new EndpointError(404, "Not Found"),
        new ResponseTagError("getBootAndStateId", {}),
      ]) {
        const adapter = createInnoxelStub();
        adapter.api.getBootAndStateIdXml.rejects(error);

        await adapter.setupConnection();

        expect(adapter.terminate).to.have.been.calledOnce;
        expect(adapter.setTimeout).to.not.have.been.called;
        expect(adapter.log.error).to.have.been.calledOnce;
      }
    });

    it("pauses polling and schedules reconnect when a scheduled poll fails", async () => {
      const adapter = createInnoxelStub();
      const pollTimeout = {} as ioBroker.Timeout;
      adapter.timeouts.weather = pollTimeout;
      adapter.stopScheduling = false;
      adapter.masterConnected = true;
      adapter.lastIdXml = "<old />";

      const failingHandler = sinon
        .stub()
        .rejects(new NetworkError(new Error("ETIMEDOUT")));

      await adapter.runAndSchedule("change", 30, failingHandler);

      expect(adapter.masterConnected).to.equal(false);
      expect(adapter.stopScheduling).to.equal(true);
      expect(adapter.lastIdXml).to.equal("");
      expect(adapter.clearTimeout).to.have.been.calledWithExactly(pollTimeout);
      expect(adapter.setState).to.have.been.calledWithExactly(
        "info.connection",
        false,
        true,
      );
      expect(adapter.log.error).to.have.been.calledOnce;
      expect(adapter.setTimeout).to.have.been.calledOnce;
      expect(adapter.setTimeout.firstCall.args[1]).to.equal(5_000);
    });

    it("clears pending reconnectTimeout on unload", () => {
      const adapter = createInnoxelStub();
      const reconnectTimer = {} as ioBroker.Timeout;
      adapter.reconnectTimeout = reconnectTimer;
      const cb = sinon.stub();

      adapter.onUnload(cb);

      expect(adapter.unloading).to.equal(true);
      expect(adapter.reconnectTimeout).to.equal(undefined);
      expect(adapter.clearTimeout).to.have.been.calledWithExactly(
        reconnectTimer,
      );
      expect(cb).to.have.been.calledOnce;
    });
  });
});
