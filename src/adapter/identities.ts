import type { ModuleIdentityType } from "innoxel-soap";
import { asArray } from "../lib/util.ts";
import type { Innoxel } from "../main.ts";
import { createRoomClimateState } from "./roomClimate.ts";

export async function createOrUpdateIdentities(
  adapter: Innoxel,
  identities: ModuleIdentityType[],
): Promise<void> {
  adapter.log.debug("Creating/Updating Identities...");
  const devices = ["In", "Out", "Dim"].map(async (type) => {
    await adapter.extendObject(`module${type}`, { type: "device" });
    await adapter.extendObject(`module${type}`, {
      type: "device",
      common: {
        name: `${type} Modules`,
      },
    });
  });
  const otherTypes: Array<[string, string]> = [["roomClimate", "Thermostats"]];
  devices.push(
    ...otherTypes.map(async ([type, name]) => {
      await adapter.extendObject(type, { type: "device" });
      await adapter.extendObject(type, {
        type: "device",
        common: { name },
      });
    }),
  );
  await Promise.all(devices);
  await Promise.all(
    identities.map((idendity) => createOrUpdateIdentity(adapter, idendity)),
  );
  adapter.log.debug("Finished creating/updating identities.");
}

async function createOrUpdateIdentity(
  adapter: Innoxel,
  identity: ModuleIdentityType,
): Promise<void> {
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
      adapter.log.error(`unsupported module type ${JSON.stringify(identity)}`);
      return;
  }
  device += `.${identity.index.toString().padStart(3, "0")}`;

  await adapter.extendObject(device, {
    type: "device",
    common: { name: identity.name },
  });

  const channelPromises = asArray(identity.channel)
    .filter((channel) => channel && !channel.noxnetError)
    .map((channel) =>
      adapter.extendObject(`${device}.${channel.index}`, {
        type: "channel",
        common: {
          name: channel.name,
          desc: channel.description,
        },
      }),
    );
  await Promise.all(channelPromises);
}
