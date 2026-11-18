import type {
  IChannelBase,
  IChannelDim,
  IChannelIn,
  IChannelOut,
  IModuleBase,
} from "innoxel-soap";
import { asArray } from "../lib/util.ts";
import type { Innoxel } from "../main.ts";

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

const MODULE_STATE_CONFIG: Record<
  string,
  { prefix: string; stateName: string; common: ioBroker.StateCommon }
> = {
  masterInModule: {
    prefix: "moduleIn",
    stateName: "ledState",
    common: {
      name: "on/off",
      type: "boolean",
      role: "switch",
      def: false,
      read: true,
      write: false,
    },
  },
  masterOutModule: {
    prefix: "moduleOut",
    stateName: "outState",
    common: {
      name: "on/off",
      type: "boolean",
      role: "switch",
      def: false,
      read: true,
      write: false,
    },
  },
  masterDimModule: {
    prefix: "moduleDim",
    stateName: "outState",
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
};

export async function createModuleStates(
  adapter: Innoxel,
  modules: IModuleBase[],
): Promise<void> {
  await Promise.all(
    mapModuleChannels(modules, async (module, channel) => {
      const cfg = MODULE_STATE_CONFIG[module.class];
      if (!cfg) {
        adapter.log.error(`Unknown module type: ${module.class}`);
        return;
      }

      const base = `${cfg.prefix}.${getModuleIndex(module)}.${channel.index}`;
      await adapter.extendObject(`${base}.button`, {
        type: "state",
        common: {
          name: "Button",
          type: "boolean",
          role: "button",
          read: false,
          write: true,
        },
      });
      return adapter.extendObject(`${base}.${cfg.stateName}`, {
        type: "state",
        common: cfg.common,
      });
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
