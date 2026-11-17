import type { IModuleWeather, IWeatherData } from "innoxel-soap";
import type { Innoxel } from "../main.ts";

type IndexableWeatherData = IModuleWeather & { [key: string]: IWeatherData };

export async function createWeatherStates(
  adapter: Innoxel,
  data: IModuleWeather,
): Promise<void> {
  await adapter.extendObject("weather", {
    type: "device",
    common: { name: "weather" },
  });
  const promises = Object.keys(data).map((key) => {
    if (ignoreProperty(data, key)) return Promise.resolve(null);

    return adapter.extendObject(`weather.${key}`, {
      type: "state",
      common: getCommon(data as IndexableWeatherData, key),
    });
  });

  if ("precipitation" in data) {
    promises.push(
      adapter.extendObject("weather.rain", {
        type: "state",
        common: {
          name: "rain",
          read: true,
          write: false,
          type: "boolean",
          role: "sensor.rain",
        },
      }),
    );
  }

  await Promise.all(promises);
  await updateWeatherStates(adapter, data);
}

function getCommon(
  dataObj: IndexableWeatherData,
  key: string,
): Partial<ioBroker.StateCommon> {
  const data = dataObj[key];

  let role: string;

  const isPrecipitation = key === "precipitation";

  if (isPrecipitation) {
    role = "value.precipitation.type";
  } else if (key.startsWith("sun")) {
    role = "value.brightness";
  } else if (key.startsWith("temp")) {
    role =
      key === "temperatureAir"
        ? "value.temperature"
        : "value.temperature.feelslike";
  } else if (key.startsWith("wind")) {
    role = "value.speed.wind";
  } else {
    // fallback for unknown keys
    role = "state";
  }

  return {
    name: key,
    read: true,
    write: false,
    type: "number",
    states: isPrecipitation ? { "0": "no", "1": "yes" } : undefined,
    role,
    unit: isPrecipitation ? "" : data.unit,
  };
}

function ignoreProperty(data: unknown, key: string): boolean {
  const type = typeof (data as Record<string, unknown>)[key];
  return type === "string" || type === "number";
}

export async function updateWeatherStates(
  adapter: Innoxel,
  data: IModuleWeather,
): Promise<void> {
  const promises = Object.keys(data).map((key) => {
    if (ignoreProperty(data, key)) return Promise.resolve();

    const obj = (data as IndexableWeatherData)[key];
    const value = obj.value;
    if (key === "precipitation") {
      const isRaining = value !== "dry";
      return Promise.all([
        adapter.setStateChangedAsync(`weather.${key}`, isRaining ? 1 : 0, true),
        adapter.setStateChangedAsync("weather.rain", isRaining, true),
      ]);
    }
    return adapter.setStateChangedAsync(`weather.${key}`, value, true);
  });
  await Promise.all(promises);
}
