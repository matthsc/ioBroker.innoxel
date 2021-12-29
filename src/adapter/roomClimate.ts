import { IModuleRoomClimate, IModuleRoomClimateIdentity } from "innoxel-soap";
import { Innoxel } from "../main";

export async function createRoomClimateState(adapter: Innoxel, identity: IModuleRoomClimateIdentity): Promise<void> {
    await adapter.extendObjectAsync(`roomClimate.${identity.index}`, {
        type: "channel",
        common: { name: identity.name },
    });

    const createState = (
        name: string,
        type: ioBroker.CommonType,
        common: Partial<ioBroker.StateCommon> = {},
    ): ReturnType<typeof adapter.extendObjectAsync> =>
        adapter.extendObjectAsync(`roomClimate.${identity.index}.${name}`, {
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
        createState("operatingState", "string", { role: "string", states: ["heating", "cooling"] as any }),
        createState("valveState", "string", { role: "string", states: ["open", "closed"] as any }),
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

export async function updateRoomClimate(adapter: Innoxel, data: IModuleRoomClimate[]): Promise<void> {
    const channelPromises = data.map(async (module) => {
        const statePromises: ioBroker.SetStateChangedPromise[] = [];
        for (const key of Object.keys(module.thermostat)) {
            const obj = module.thermostat[key as keyof IModuleRoomClimate["thermostat"]];

            if (key === "valveState")
                statePromises.push(
                    adapter.setStateChangedAsync(`roomClimate.${module.index}.valveOpen`, obj === "open", true),
                );

            const value = typeof obj === "string" ? obj : obj.value;
            statePromises.push(adapter.setStateChangedAsync(`roomClimate.${module.index}.${key}`, value, true));
        }
        await Promise.all(statePromises);
    });
    await Promise.all(channelPromises);
}
