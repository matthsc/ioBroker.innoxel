import type {
  IChannelBase,
  IChannelDim,
  IChannelIn,
  IChannelOut,
  IModuleBase,
} from "innoxel-soap";
import { asArray } from "../lib/util";
import type { Innoxel } from "../main";

function getModuleIndex(module: IModuleBase): string {
  return module.index.toString().padStart(3, "0");
}

function mapModuleChannels<T>(
  modules: IModuleBase[],
  action: (module: IModuleBase, channel: IChannelBase) => T,
): T[] {
  const arr = [];
  for (const module of modules) {
    const channels = asArray(module.channel).filter(
      (channel) => channel && !channel.noxnetError,
    );
    for (const channel of channels) {
      arr.push(action(module, channel));
    }
  }
  return arr;
}

export async function createModuleStates(
  adapter: Innoxel,
  modules: IModuleBase[],
): Promise<void> {
  await Promise.all(
    mapModuleChannels(modules, async (module, channel) => {
      const moduleIndex = getModuleIndex(module);

      switch (module.class) {
        case "masterInModule":
          await adapter.extendObjectAsync(
            `moduleIn.${moduleIndex}.${channel.index}.button`,
            {
              type: "state",
              common: {
                name: "Button",
                type: "boolean",
                role: "button",
                read: false,
                write: true,
              },
            },
          );
          return adapter.extendObjectAsync(
            `moduleIn.${moduleIndex}.${channel.index}.ledState`,
            {
              type: "state",
              common: {
                name: "on/off",
                type: "boolean",
                role: "switch",
                def: false,
                read: true,
                write: false,
              },
            },
          );
        case "masterOutModule":
          await adapter.extendObjectAsync(
            `moduleOut.${moduleIndex}.${channel.index}.button`,
            {
              type: "state",
              common: {
                name: "Button",
                type: "boolean",
                role: "button",
                read: false,
                write: true,
              },
            },
          );
          return adapter.extendObjectAsync(
            `moduleOut.${moduleIndex}.${channel.index}.outState`,
            {
              type: "state",
              common: {
                name: "on/off",
                type: "boolean",
                role: "switch",
                def: false,
                read: true,
                write: false,
              },
            },
          );
        case "masterDimModule":
          await adapter.extendObjectAsync(
            `moduleDim.${moduleIndex}.${channel.index}.button`,
            {
              type: "state",
              common: {
                name: "Button",
                type: "boolean",
                role: "button",
                read: false,
                write: true,
              },
            },
          );
          return adapter.extendObjectAsync(
            `moduleDim.${moduleIndex}.${channel.index}.outState`,
            {
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
            },
          );
        default:
          adapter.log.error(`Unknown module type: ${module.class}`);
          return;
      }
    }),
  );

  await updateModuleStates(adapter, modules);
}

export async function updateModuleStates(
  adapter: Innoxel,
  modules: IModuleBase[],
): Promise<void> {
  await Promise.all(
    mapModuleChannels(modules, async (module, channel) => {
      let value: ioBroker.StateValue;
      let stateName: string;
      let moduleType: string;
      switch (module.class) {
        case "masterInModule":
          moduleType = "In";
          value = (channel as IChannelIn).ledState === "on";
          stateName = "ledState";
          break;
        case "masterOutModule":
          moduleType = "Out";
          value = (channel as IChannelOut).outState === "on";
          stateName = "outState";
          break;
        case "masterDimModule":
          moduleType = "Dim";
          value = (channel as IChannelDim).outState;
          stateName = "outState";
          break;
        default:
          return;
      }

      return await adapter.setStateChangedAsync(
        `module${moduleType}.${getModuleIndex(module)}.${channel.index}.${stateName}`,
        value,
        true,
      );
    }),
  );
}
