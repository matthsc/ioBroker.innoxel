import { expect } from "chai";
import type { IModuleWeather } from "innoxel-soap";
import sinon from "sinon";
import type { Innoxel } from "../main.ts";
import { createWeatherStates, updateWeatherStates } from "./weather.ts";

function createAdapterStub() {
  return {
    extendObject: sinon.stub().resolves(),
    setStateChangedAsync: sinon.stub().resolves(),
  };
}

describe("adapter/weather", () => {
  const weatherData = {
    class: "masterWeatherModule",
    index: 0,
    state: "ready",
    temperatureAir: { unit: "°C", value: 18.5 },
    temperatureAirFelt: { unit: "°C", value: 17.0 },
    windSpeed: { unit: "m/s", value: 3.2 },
    sunBrightnessEast: { unit: "lx", value: 1200 },
    precipitation: { unit: "", value: "no" },
    customMetric: { unit: "%", value: 50 },
  } as unknown as IModuleWeather;

  it("creates weather states with mapped roles and ignores scalar properties", async () => {
    const adapter = createAdapterStub();
    await createWeatherStates(adapter as unknown as Innoxel, weatherData);

    expect(adapter.extendObject).to.have.been.calledWith("weather", {
      type: "device",
      common: { name: "weather" },
    });
    expect(adapter.extendObject).to.not.have.been.calledWith("weather.class");
    expect(adapter.extendObject).to.not.have.been.calledWith("weather.index");
    expect(adapter.extendObject).to.have.been.calledWith(
      "weather.temperatureAir",
      sinon.match.hasNested("common.role", "value.temperature"),
    );
    expect(adapter.extendObject).to.have.been.calledWith(
      "weather.temperatureAirFelt",
      sinon.match.hasNested("common.role", "value.temperature.feelslike"),
    );
    expect(adapter.extendObject).to.have.been.calledWith(
      "weather.windSpeed",
      sinon.match.hasNested("common.role", "value.speed.wind"),
    );
    expect(adapter.extendObject).to.have.been.calledWith(
      "weather.sunBrightnessEast",
      sinon.match.hasNested("common.role", "value.brightness"),
    );
    expect(adapter.extendObject).to.have.been.calledWith(
      "weather.precipitation",
      sinon.match.hasNested("common.role", "value.precipitation.type"),
    );
    expect(adapter.extendObject).to.have.been.calledWith(
      "weather.customMetric",
      sinon.match.hasNested("common.role", "state"),
    );
    expect(adapter.setStateChangedAsync).to.have.been.calledWithExactly(
      "weather.precipitation",
      0,
      true,
    );
  });

  it("maps precipitation 'yes' to 1 on update", async () => {
    const adapter = createAdapterStub();
    await updateWeatherStates(adapter as unknown as Innoxel, {
      ...weatherData,
      precipitation: { unit: "", value: "yes" },
    });

    expect(adapter.setStateChangedAsync).to.have.been.calledWithExactly(
      "weather.precipitation",
      1,
      true,
    );
  });
});
