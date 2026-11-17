import { expect } from "chai";
import type { ModuleIdentityType } from "innoxel-soap";
import sinon from "sinon";
import type { Innoxel } from "../main.ts";
import { createOrUpdateIdentities } from "./identities.ts";

function createAdapterStub() {
  return {
    extendObject: sinon.stub().resolves(),
    log: { debug: sinon.stub(), error: sinon.stub() },
  };
}

describe("adapter/identities => createOrUpdateIdentities", () => {
  it("creates device/channel objects, skips noxnetError, delegates thermostat, logs unknown", async () => {
    const adapter = createAdapterStub();
    const identities = [
      {
        class: "masterInModule",
        index: 1,
        name: "Hall",
        description: "",
        channel: [
          { index: 0, name: "Light", description: "Main" },
          {
            index: 1,
            name: "Broken",
            description: "",
            noxnetError: { errorCode: 2, errorDescription: "fail" },
          },
        ],
      },
      {
        class: "masterOutModule",
        index: 2,
        name: "Relay",
        description: "",
        channel: { index: 0, name: "Fan", description: "Bath" },
      },
      {
        class: "masterDimModule",
        index: 3,
        name: "Dimmer",
        description: "",
        channel: [],
      },
      {
        class: "masterRoomClimateModule",
        index: 4,
        name: "Living Room",
        description: "",
      },
      {
        class: "unknownModule",
        index: 9,
        name: "Bad",
        description: "",
      },
    ] as unknown as ModuleIdentityType[];

    await createOrUpdateIdentities(adapter as unknown as Innoxel, identities);

    expect(adapter.extendObject).to.have.been.calledWith("moduleIn.001", {
      type: "device",
      common: { name: "Hall" },
    });
    expect(adapter.extendObject).to.have.been.calledWith("moduleIn.001.0", {
      type: "channel",
      common: { name: "Light", desc: "Main" },
    });
    expect(adapter.extendObject).to.not.have.been.calledWith("moduleIn.001.1");
    expect(adapter.extendObject).to.have.been.calledWith("moduleOut.002.0", {
      type: "channel",
      common: { name: "Fan", desc: "Bath" },
    });
    expect(adapter.extendObject).to.have.been.calledWith("moduleDim.003", {
      type: "device",
      common: { name: "Dimmer" },
    });
    expect(adapter.extendObject).to.have.been.calledWith("roomClimate.4", {
      type: "channel",
      common: { name: "Living Room" },
    });
    expect(adapter.log.error).to.have.been.calledOnce;
  });
});
