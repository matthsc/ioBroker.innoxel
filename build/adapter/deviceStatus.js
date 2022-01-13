"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateDeviceStatusStates = exports.createDeviceStatusStates = void 0;
async function createDeviceStatusStates(adapter, data) {
    await adapter.extendObjectAsync("deviceStatus", {
        type: "device",
        common: { name: "deviceStatus" },
    });
    const statePromises = Object.keys(data).map((key) => {
        return adapter.extendObjectAsync(`deviceStatus.${key}`, {
            type: "state",
            common: getCommon(data, key),
        });
    });
    await Promise.all(statePromises);
    await updateDeviceStatusStates(adapter, data);
}
exports.createDeviceStatusStates = createDeviceStatusStates;
function getCommon(dataObj, key) {
    const data = dataObj[key];
    let type;
    let role;
    let unit;
    if (typeof data === "string") {
        type = "string";
        role = "state";
        unit = "";
    }
    else {
        type = "number";
        unit = data.unit;
        switch (data.unit) {
            case "°C":
                role = "value.temperature";
                break;
            case "V":
                role = "value.voltage";
                break;
            case "Byte":
                role = "value";
                break;
            default:
                type = "string";
                role = "state";
        }
        if (key === "statisticsSerialTx")
            type = "number";
    }
    return {
        name: key,
        read: true,
        write: false,
        type,
        role,
        unit,
    };
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