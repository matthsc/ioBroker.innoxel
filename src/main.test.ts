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
  stopScheduling: boolean;
  log: {
    debug: sinon.SinonStub;
    info: sinon.SinonStub;
    error: sinon.SinonStub;
    level: string;
  };
  setState: sinon.SinonStub;
  setStateChangedAsync: sinon.SinonStub;
  getStateAsync: sinon.SinonStub;
  subscribeStatesAsync: sinon.SinonStub;
  clearTimeout: sinon.SinonStub;
  setTimeout: sinon.SinonStub;
  terminate: sinon.SinonStub;
  checkChanges: sinon.SinonStub;
  updateRoomTemperatures: sinon.SinonStub;
  onReady(): Promise<void>;
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
  instance.api = {
    setRoomClimate: sinon.stub().resolves(21),
    setDimValue: sinon.stub().resolves(),
    triggerOutModule: sinon.stub().resolves(),
    triggerPushButton: sinon.stub().resolves(),
  };
  instance.log = {
    debug: sinon.stub(),
    info: sinon.stub(),
    error: sinon.stub(),
    level: "info",
  };
  instance.setState = sinon.stub().resolves();
  instance.setStateChangedAsync = sinon.stub().resolves();
  instance.getStateAsync = sinon.stub().resolves({ val: 0 });
  instance.subscribeStatesAsync = sinon.stub().resolves();
  instance.clearTimeout = sinon.stub();
  instance.setTimeout = sinon.stub();
  instance.terminate = sinon.stub();
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
});
