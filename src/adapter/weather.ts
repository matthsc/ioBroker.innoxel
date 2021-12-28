import { IModuleWeather, IWeatherData } from "innoxel-soap";
import { Innoxel } from "../main";

type IndexableWeatherData = IModuleWeather & { [key: string]: IWeatherData };

export async function createWeatherStates(adapter: Innoxel, data: IModuleWeather): Promise<void> {
    await adapter.extendObjectAsync("weather", {
        type: "device",
        common: { name: "weather" },
    });
    const promises = Object.keys(data).map((key) => {
        if (ignoreProperty(data, key)) return Promise.resolve(null);

        const [type, unit] = getTypeAndUnit((data as IndexableWeatherData)[key].unit);
        return adapter.extendObjectAsync(`weather.${key}`, {
            type: "state",
            common: {
                name: key,
                read: true,
                write: false,
                type,
                unit,
            },
        });
    });

    await Promise.all(promises);
    await updateWeatherStates(adapter, data);
}

function getTypeAndUnit(unit: string): [ioBroker.CommonType, string] {
    switch (unit) {
        case "-":
            return ["string", ""];
        default:
            return ["number", unit];
    }
}

function ignoreProperty(data: any, key: string): boolean {
    const type = typeof data[key];
    return type === "string" || type === "number";
}

export async function updateWeatherStates(adapter: Innoxel, data: IModuleWeather): Promise<void> {
    const promises = Object.keys(data).map((key) => {
        if (ignoreProperty(data, key)) return Promise.resolve("");

        const obj = (data as IndexableWeatherData)[key];
        return adapter.setStateChangedAsync(`weather.${key}`, obj.value, true);
    });
    await Promise.all(promises);
}
