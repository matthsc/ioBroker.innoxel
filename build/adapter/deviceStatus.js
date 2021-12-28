"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateDeviceStatusStates = exports.createDeviceStatusStates = void 0;
async function createDeviceStatusStates(adapter, data) {
    await adapter.extendObjectAsync("deviceStatus", {
        type: "device",
        common: { name: "deviceStatus" },
    });
    const statePromises = Object.keys(data).map((key) => {
        const [type, unit] = getTypeAndUnit(data[key]);
        return adapter.extendObjectAsync(`deviceStatus.${key}`, {
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
    await Promise.all(statePromises);
    await updateDeviceStatusStates(adapter, data);
}
exports.createDeviceStatusStates = createDeviceStatusStates;
function getTypeAndUnit(obj) {
    if (typeof obj === "string")
        return ["string", ""];
    const type = typeof obj["#text"];
    switch (obj.unit) {
        case "-":
            return [type, ""];
        default:
            return [type, obj.unit];
    }
}
async function updateDeviceStatusStates(adapter, data) {
    const promises = Object.keys(data).map((key) => {
        const obj = data[key];
        const value = typeof obj === "string" ? obj : obj["#text"];
        return adapter.setStateChangedAsync(`deviceStatus.${key}`, value, true);
    });
    await Promise.all(promises);
}
exports.updateDeviceStatusStates = updateDeviceStatusStates;
//# sourceMappingURL=deviceStatus.js.map