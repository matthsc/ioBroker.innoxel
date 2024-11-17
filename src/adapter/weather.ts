import type { IModuleWeather, IWeatherData } from "innoxel-soap";
import type { Innoxel } from "../main";

type IndexableWeatherData = IModuleWeather & { [key: string]: IWeatherData };

export async function createWeatherStates(
  adapter: Innoxel,
  data: IModuleWeather,
): Promise<void> {
  await adapter.extendObjectAsync("weather", {
    type: "device",
    common: { name: "weather" },
  });
  const promises = Object.keys(data).map((key) => {
    if (ignoreProperty(data, key)) return Promise.resolve(null);

    return adapter.extendObjectAsync(`weather.${key}`, {
      type: "state",
      common: getCommon(data as IndexableWeatherData, key),
    });
  });

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
    states: isPrecipitation ? ["yes", "no"] : undefined,
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
    let value = obj.value;
    if (key === "precipitation") {
      value = value === "no" ? 0 : 1;
    }
    return adapter.setStateChangedAsync(`weather.${key}`, value, true);
  });
  await Promise.all(promises);
}
