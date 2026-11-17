import { expect } from "chai";
import type { InnoxelApi } from "innoxel-soap";
import sinon from "sinon";
import { handleMessage } from "./messageHandler.ts";

function createMessage(command: string, message: string): ioBroker.Message {
  return { command, message, from: "system.adapter.admin.0", _id: 1 };
}

describe("adapter/messageHandler => handleMessage", () => {
  it("triggers push button on triggerInModule", async () => {
    const api = { triggerPushButton: sinon.stub().resolves() };
    const result = await handleMessage(
      api as unknown as InnoxelApi,
      createMessage("triggerInModule", "2:5"),
    );

    expect(api.triggerPushButton).to.have.been.calledOnceWithExactly(2, 5);
    expect(result).to.deep.equal({ reloadModules: true });
  });

  it("sets dim value with default and explicit dimSpeed", async () => {
    const api = { setDimValue: sinon.stub().resolves() };

    const resDefault = await handleMessage(
      api as unknown as InnoxelApi,
      createMessage("setDimValue", "1:3:75"),
    );
    expect(api.setDimValue).to.have.been.calledWithExactly(1, 3, 75, 0);
    expect(resDefault).to.deep.equal({ reloadModules: true });

    const resExplicit = await handleMessage(
      api as unknown as InnoxelApi,
      createMessage("setDimValue", "1:3:50:4"),
    );
    expect(api.setDimValue).to.have.been.calledWithExactly(1, 3, 50, 4);
    expect(resExplicit).to.deep.equal({ reloadModules: true });
  });

  it("sets room climate temperature on setTemperature", async () => {
    const api = { setRoomClimate: sinon.stub().resolves(21.5) };
    const result = await handleMessage(
      api as unknown as InnoxelApi,
      createMessage("setTemperature", "4:setTemperatureHeating:21.5"),
    );

    expect(api.setRoomClimate).to.have.been.calledOnceWithExactly(
      4,
      "setTemperatureHeating",
      21.5,
    );
    expect(result).to.deep.equal({ reloadRoomClimates: true });
  });

  it("returns empty object for unknown command", async () => {
    const api = {};
    const result = await handleMessage(
      api as unknown as InnoxelApi,
      createMessage("unknown", "1:2"),
    );

    expect(result).to.deep.equal({});
  });
});
