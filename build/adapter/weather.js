"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateWeatherStates = exports.createWeatherStates = void 0;
async function createWeatherStates(adapter, data) {
    await adapter.extendObjectAsync("weather", {
        type: "device",
        common: { name: "weather" },
    });
    const promises = Object.keys(data).map((key) => {
        if (ignoreProperty(data, key))
            return Promise.resolve(null);
        return adapter.extendObjectAsync(`weather.${key}`, {
            type: "state",
            common: getCommon(data, key),
        });
    });
    await Promise.all(promises);
    await updateWeatherStates(adapter, data);
}
exports.createWeatherStates = createWeatherStates;
function getCommon(dataObj, key) {
    const data = dataObj[key];
    let role;
    const isPrecipitation = key === "precipitation";
    if (isPrecipitation) {
        role = "value.precipitation.type";
    }
    else if (key.startsWith("sun")) {
        role = "value.brightness";
    }
    else if (key.startsWith("temp")) {
        role = key === "temperatureAir" ? "value.temperature" : "value.temperature.feelslike";
    }
    else if (key.startsWith("wind")) {
        role = "value.speed.wind";
    }
    else {
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
function ignoreProperty(data, key) {
    const type = typeof data[key];
    return type === "string" || type === "number";
}
async function updateWeatherStates(adapter, data) {
    const promises = Object.keys(data).map((key) => {
        if (ignoreProperty(data, key))
            return Promise.resolve();
        const obj = data[key];
        let value = obj.value;
        if (key === "precipitation") {
            value = value === "no" ? 0 : 1;
        }
        return adapter.setStateChangedAsync(`weather.${key}`, value, true);
    });
    await Promise.all(promises);
}
exports.updateWeatherStates = updateWeatherStates;
//# sourceMappingURL=weather.js.map