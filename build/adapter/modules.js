"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateModuleStates = exports.createModuleStates = void 0;
const util_1 = require("../lib/util");
function getModuleIndex(module) {
    return module.index.toString().padStart(3, "0");
}
function mapModuleChannels(modules, action) {
    const arr = [];
    for (const module of modules) {
        for (const channel of (0, util_1.asArray)(module.channel)) {
            if (channel.noxnetError)
                continue;
            arr.push(action(module, channel));
        }
    }
    return arr;
}
async function createModuleStates(adapter, modules) {
    await Promise.all(mapModuleChannels(modules, async (module, channel) => {
        const moduleIndex = getModuleIndex(module);
        switch (module.class) {
            case "masterInModule":
                return adapter.extendObjectAsync(`moduleIn.${moduleIndex}.${channel.index}.ledState`, {
                    type: "state",
                    common: {
                        name: "on/off",
                        type: "boolean",
                        role: "switch",
                        def: false,
                        read: true,
                        write: true,
                    },
                });
            case "masterOutModule":
                return adapter.extendObjectAsync(`moduleOut.${moduleIndex}.${channel.index}.outState`, {
                    type: "state",
                    common: {
                        name: "on/off",
                        type: "boolean",
                        role: "switch",
                        def: false,
                        read: true,
                        write: false,
                    },
                });
            case "masterDimModule":
                return adapter.extendObjectAsync(`moduleDim.${moduleIndex}.${channel.index}.outState`, {
                    type: "state",
                    common: {
                        name: "Brightness",
                        def: 0,
                        type: "number",
                        read: true,
                        write: true,
                        min: 0,
                        max: 100,
                        unit: "%",
                        role: "level.dimmer",
                        desc: "Brightness of the dimmer",
                    },
                });
            default:
                adapter.log.error("Unknown module type: " + module.class);
                return;
        }
    }));
    await updateModuleStates(adapter, modules);
}
exports.createModuleStates = createModuleStates;
async function updateModuleStates(adapter, modules) {
    await Promise.all(mapModuleChannels(modules, async (module, channel) => {
        let value;
        let stateName;
        let moduleType;
        switch (module.class) {
            case "masterInModule":
                moduleType = "In";
                value = channel.ledState === "on";
                stateName = "ledState";
                break;
            case "masterOutModule":
                moduleType = "Out";
                value = channel.outState === "on";
                stateName = "outState";
                break;
            case "masterDimModule":
                moduleType = "Dim";
                value = channel.outState;
                stateName = "outState";
                break;
            default:
                return;
        }
        return await adapter.setStateChangedAsync(`module${moduleType}.${getModuleIndex(module)}.${channel.index}.${stateName}`, value, true);
    }));
}
exports.updateModuleStates = updateModuleStates;
//# sourceMappingURL=modules.js.map