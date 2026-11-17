import { expect } from "chai";
import type { IDeviceStatusResponse } from "innoxel-soap";
import sinon from "sinon";
import type { Innoxel } from "../main.ts";
import {
  createDeviceStatusStates,
  updateDeviceStatusStates,
} from "./deviceStatus.ts";

function createAdapterStub() {
  return {
    extendObject: sinon.stub().resolves(),
    setStateChangedAsync: sinon.stub().resolves(),
  };
}

describe("adapter/deviceStatus", () => {
  const statusData = {
    baseVoltageMain: { "#text": 24.1, unit: "V" },
    baseTemperatureCPU: { "#text": 42.5, unit: "°C" },
    hostMemoryTotal: { "#text": 1024, unit: "Byte" },
    baseSupplyStateCAN1: "ok",
    statisticsSerialTx: { "#text": 99, unit: "frames" },
    statisticsTotalRunTime: { "#text": "10h", unit: "h" },
  } as unknown as IDeviceStatusResponse;

  it("creates deviceStatus states with expected types, roles, and updates values", async () => {
    const adapter = createAdapterStub();
    await createDeviceStatusStates(adapter as unknown as Innoxel, statusData);

    expect(adapter.extendObject).to.have.been.calledWith("deviceStatus", {
      type: "device",
      common: { name: "deviceStatus" },
    });
    expect(adapter.extendObject).to.have.been.calledWith(
      "deviceStatus.baseVoltageMain",
      sinon.match.hasNested("common.role", "value.voltage"),
    );
    expect(adapter.extendObject).to.have.been.calledWith(
      "deviceStatus.baseTemperatureCPU",
      sinon.match.hasNested("common.role", "value.temperature"),
    );
    expect(adapter.extendObject).to.have.been.calledWith(
      "deviceStatus.hostMemoryTotal",
      sinon.match.hasNested("common.role", "value"),
    );
    expect(adapter.extendObject).to.have.been.calledWith(
      "deviceStatus.baseSupplyStateCAN1",
      sinon.match.hasNested("common.type", "string"),
    );
    expect(adapter.extendObject).to.have.been.calledWith(
      "deviceStatus.statisticsSerialTx",
      sinon.match.hasNested("common.type", "number"),
    );
    expect(adapter.extendObject).to.have.been.calledWith(
      "deviceStatus.statisticsTotalRunTime",
      sinon.match.hasNested("common.type", "string"),
    );

    expect(adapter.setStateChangedAsync).to.have.been.calledWithExactly(
      "deviceStatus.baseVoltageMain",
      24.1,
      true,
    );
    expect(adapter.setStateChangedAsync).to.have.been.calledWithExactly(
      "deviceStatus.baseSupplyStateCAN1",
      "ok",
      true,
    );
  });

  it("updates deviceStatus states directly", async () => {
    const adapter = createAdapterStub();
    await updateDeviceStatusStates(adapter as unknown as Innoxel, statusData);

    expect(adapter.extendObject).to.not.have.been.called;
    expect(adapter.setStateChangedAsync).to.have.been.calledWithExactly(
      "deviceStatus.statisticsSerialTx",
      99,
      true,
    );
  });
});
