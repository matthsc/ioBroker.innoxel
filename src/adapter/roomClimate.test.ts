import { expect } from "chai";
import type {
  IModuleRoomClimate,
  IModuleRoomClimateIdentity,
} from "innoxel-soap";
import sinon from "sinon";
import type { Innoxel } from "../main.ts";
import { createRoomClimateState, updateRoomClimate } from "./roomClimate.ts";

function createAdapterStub() {
  return {
    extendObject: sinon.stub().resolves(),
    setStateChangedAsync: sinon.stub().resolves(),
  };
}

describe("adapter/roomClimate", () => {
  it("creates thermostat channel and states", async () => {
    const adapter = createAdapterStub();
    await createRoomClimateState(
      adapter as unknown as Innoxel,
      {
        class: "masterRoomClimateModule",
        index: 2,
        name: "Office",
        description: "",
      } as IModuleRoomClimateIdentity,
    );

    expect(adapter.extendObject).to.have.been.calledWith("roomClimate.2", {
      type: "channel",
      common: { name: "Office" },
    });
    expect(adapter.extendObject).to.have.been.calledWith(
      "roomClimate.2.valveOpen",
    );
    expect(adapter.extendObject).to.have.been.calledWith(
      "roomClimate.2.setTemperatureHeating",
    );
  });

  it("updates valveOpen boolean and sets q=1 fallback for undefined values", async () => {
    const adapter = createAdapterStub();
    const data = [
      {
        index: 2,
        thermostat: {
          operatingState: "heating",
          valveState: "open",
          actualTemperatureMean: { unit: "°C", value: 21.3 },
          setTemperatureHeating: { unit: "°C", value: undefined },
          alarmState: { value: undefined },
        },
      },
    ] as unknown as IModuleRoomClimate[];

    await updateRoomClimate(adapter as unknown as Innoxel, data);

    expect(adapter.setStateChangedAsync).to.have.been.calledWithExactly(
      "roomClimate.2.valveOpen",
      true,
      true,
    );
    expect(adapter.setStateChangedAsync).to.have.been.calledWithExactly(
      "roomClimate.2.actualTemperatureMean",
      21.3,
      true,
    );
    expect(adapter.setStateChangedAsync).to.have.been.calledWithExactly(
      "roomClimate.2.setTemperatureHeating",
      { val: 0, q: 1 },
      true,
    );
  });
});
