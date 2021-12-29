"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateRoomClimate = exports.createRoomClimateState = void 0;
async function createRoomClimateState(adapter, identity) {
    await adapter.extendObjectAsync(`roomClimate.${identity.index}`, {
        type: "channel",
        common: { name: identity.name },
    });
    const createState = (name, type, common = {}) => adapter.extendObjectAsync(`roomClimate.${identity.index}.${name}`, {
        type: "state",
        common: {
            name,
            read: true,
            write: false,
            type,
            ...common,
        },
    });
    await Promise.all([
        createState("operatingState", "string", { role: "string", states: ["heating", "cooling"] }),
        createState("valveState", "string", { role: "string", states: ["open", "closed"] }),
        createState("valveOpen", "boolean", { role: "indicator" }),
        createState("actualTemperatureMean", "number", { role: "value.temperature", unit: "°C" }),
        ...[
            "setTemperatureHeating",
            "setTemperatureCooling",
            "nightSetbackTemperatureHeating",
            "nightSetbackTemperatureCooling",
            "absenceSetbackTemperatureHeating",
            "absenceSetbackTemperatureCooling",
        ].map((name) => createState(name, "number", { role: "level.temperature", unit: "°C" })),
    ]);
}
exports.createRoomClimateState = createRoomClimateState;
async function updateRoomClimate(adapter, data) {
    const channelPromises = data.map(async (module) => {
        const statePromises = [];
        for (const key of Object.keys(module.thermostat)) {
            const obj = module.thermostat[key];
            if (key === "valveState")
                statePromises.push(adapter.setStateChangedAsync(`roomClimate.${module.index}.valveOpen`, obj === "open", true));
            const value = typeof obj === "string" ? obj : obj.value;
            statePromises.push(adapter.setStateChangedAsync(`roomClimate.${module.index}.${key}`, value, true));
        }
        await Promise.all(statePromises);
    });
    await Promise.all(channelPromises);
}
exports.updateRoomClimate = updateRoomClimate;
//# sourceMappingURL=roomClimate.js.map