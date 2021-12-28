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
        const [type, unit] = getTypeAndUnit(data[key].unit);
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
exports.createWeatherStates = createWeatherStates;
function getTypeAndUnit(unit) {
    switch (unit) {
        case "-":
            return ["string", ""];
        default:
            return ["number", unit];
    }
}
function ignoreProperty(data, key) {
    const type = typeof data[key];
    return type === "string" || type === "number";
}
async function updateWeatherStates(adapter, data) {
    const promises = Object.keys(data).map((key) => {
        if (ignoreProperty(data, key))
            return Promise.resolve("");
        const obj = data[key];
        return adapter.setStateChangedAsync(`weather.${key}`, obj.value, true);
    });
    await Promise.all(promises);
}
exports.updateWeatherStates = updateWeatherStates;
//# sourceMappingURL=weather.js.map