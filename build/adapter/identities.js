"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrUpdateIdentities = void 0;
const util_1 = require("../lib/util");
const roomClimate_1 = require("./roomClimate");
async function createOrUpdateIdentities(adapter, identities) {
    adapter.log.debug("Creating/Updating Identities...");
    const devices = ["In", "Out", "Dim"].map(async (type) => {
        await adapter.createDeviceAsync(`module${type}`);
        await adapter.extendObjectAsync(`module${type}`, {
            type: "device",
            common: {
                name: `${type} Modules`,
            },
        });
    });
    const otherTypes = [["roomClimate", "Thermostats"]];
    devices.push(...otherTypes.map(async ([type, name]) => {
        await adapter.createDeviceAsync(type);
        await adapter.extendObjectAsync(type, {
            type: "device",
            common: { name },
        });
    }));
    await Promise.all(devices);
    await Promise.all(identities.map((idendity) => createOrUpdateIdentity(adapter, idendity)));
    adapter.log.debug("Finished creating/updating identities.");
}
exports.createOrUpdateIdentities = createOrUpdateIdentities;
async function createOrUpdateIdentity(adapter, identity) {
    let device = "module";
    switch (identity.class) {
        case "masterInModule":
            device += "In";
            break;
        case "masterOutModule":
            device += "Out";
            break;
        case "masterDimModule":
            device += "Dim";
            break;
        case "masterRoomClimateModule":
            return await (0, roomClimate_1.createRoomClimateState)(adapter, identity);
        default:
            adapter.log.error("unsupported module type " + JSON.stringify(identity));
            return;
    }
    device += "." + identity.index.toString().padStart(3, "0");
    await adapter.extendObjectAsync(device, { type: "device", common: { name: identity.name } });
    const channelPromises = (0, util_1.asArray)(identity.channel)
        .filter((c) => !("noxnetError" in c))
        .map((channel) => adapter.extendObjectAsync(`${device}.${channel.index}`, {
        type: "channel",
        common: {
            name: channel.name,
            desc: channel.description,
        },
    }));
    await Promise.all(channelPromises);
}
//# sourceMappingURL=identities.js.map