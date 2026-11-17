import { expect } from "chai";
import type { IModuleBase } from "innoxel-soap";
import sinon from "sinon";
import type { Innoxel } from "../main.ts";
import { createModuleStates, updateModuleStates } from "./modules.ts";

function createAdapterStub() {
  return {
    extendObject: sinon.stub().resolves(),
    setStateChangedAsync: sinon.stub().resolves(),
    log: { error: sinon.stub() },
  };
}

describe("adapter/modules", () => {
  it("creates states for In, Out, and Dim modules and updates values", async () => {
    const adapter = createAdapterStub();
    const modules = [
      {
        class: "masterInModule",
        index: 1,
        state: "ready",
        channel: [
          { index: 0, ledState: "on" },
          {
            index: 1,
            ledState: "off",
            noxnetError: { errorCode: 1, errorDescription: "err" },
          },
        ],
      },
      {
        class: "masterOutModule",
        index: 12,
        state: "ready",
        channel: { index: 2, outState: "off" },
      },
      {
        class: "masterDimModule",
        index: 3,
        state: "ready",
        channel: [{ index: 0, outState: 65 }],
      },
      {
        class: "masterWeatherModule",
        index: 0,
        state: "ready",
        channel: [{ index: 0 }],
      },
    ] as unknown as IModuleBase[];

    await createModuleStates(adapter as unknown as Innoxel, modules);

    expect(adapter.extendObject).to.have.been.calledWith(
      "moduleIn.001.0.button",
    );
    expect(adapter.extendObject).to.have.been.calledWith(
      "moduleIn.001.0.ledState",
    );
    expect(adapter.extendObject).to.have.been.calledWith(
      "moduleOut.012.2.outState",
    );
    expect(adapter.extendObject).to.have.been.calledWith(
      "moduleDim.003.0.outState",
    );
    expect(adapter.extendObject).to.not.have.been.calledWith(
      "moduleIn.001.1.button",
    );
    expect(adapter.log.error).to.have.been.calledOnceWithExactly(
      "Unknown module type: masterWeatherModule",
    );

    expect(adapter.setStateChangedAsync).to.have.been.calledWithExactly(
      "moduleIn.001.0.ledState",
      true,
      true,
    );
    expect(adapter.setStateChangedAsync).to.have.been.calledWithExactly(
      "moduleOut.012.2.outState",
      false,
      true,
    );
    expect(adapter.setStateChangedAsync).to.have.been.calledWithExactly(
      "moduleDim.003.0.outState",
      65,
      true,
    );
  });

  it("updates module states without recreating objects", async () => {
    const adapter = createAdapterStub();
    const modules = [
      {
        class: "masterInModule",
        index: 2,
        state: "ready",
        channel: [{ index: 1, ledState: "off" }],
      },
    ] as unknown as IModuleBase[];

    await updateModuleStates(adapter as unknown as Innoxel, modules);

    expect(adapter.extendObject).to.not.have.been.called;
    expect(adapter.setStateChangedAsync).to.have.been.calledOnceWithExactly(
      "moduleIn.002.1.ledState",
      false,
      true,
    );
  });
});
