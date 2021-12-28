import { ModuleIdentityType } from "innoxel-soap";
import { asArray } from "../lib/util";
import { Innoxel } from "../main";
import { createRoomClimateState } from "./roomClimate";

export async function createOrUpdateIdentities(adapter: Innoxel, identities: ModuleIdentityType[]): Promise<void> {
    adapter.log.info("Creating Identities...");
    const devices = ["In", "Out", "Dim"].map(async (type) => {
        await adapter.createDeviceAsync(`module${type}`);
        await adapter.extendObjectAsync(`module${type}`, {
            type: "device",
            common: {
                name: `${type} Modules`,
            },
        });
    });
    const otherTypes: Array<[string, string]> = [["roomClimate", "Thermostats"]];
    devices.push(
        ...otherTypes.map(async ([type, name]) => {
            await adapter.createDeviceAsync(type);
            await adapter.extendObjectAsync(type, {
                type: "device",
                common: { name },
            });
        }),
    );
    await Promise.all(devices);
    await Promise.all(identities.map((idendity) => createOrUpdateIdentity(adapter, idendity)));
    adapter.log.info("Identities created");
}

async function createOrUpdateIdentity(adapter: Innoxel, identity: ModuleIdentityType): Promise<void> {
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
            return await createRoomClimateState(adapter, identity);
        default:
            adapter.log.error("unsupported module type " + JSON.stringify(identity));
            return;
    }
    device += "." + identity.index.toString().padStart(3, "0");

    await adapter.extendObjectAsync(device, { type: "device", common: { name: identity.name } });

    const channelPromises = asArray(identity.channel).map((channel) =>
        adapter.extendObjectAsync(`${device}.${channel.index}`, {
            type: "channel",
            common: {
                name: channel.name,
                desc: channel.description,
            },
        }),
    );
    await Promise.all(channelPromises);
}
