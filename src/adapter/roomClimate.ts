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
        ].map((name) =>
            createState(name, "number", {
                role: "level.temperature",
                unit: "°C",
                read: true,
                write: true,
            }),
        ),
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

            let value: ioBroker.StateValue | ioBroker.SettableState = typeof obj === "string" ? obj : obj.value;
            if (value === undefined) {
                if (key.includes("Temperature")) value = 0;
                else if (key.includes("State")) value = "unknown";

                value = { val: value, q: 1 };
            }
            statePromises.push(adapter.setStateChangedAsync(`roomClimate.${module.index}.${key}`, value, true));
        }
        await Promise.all(statePromises);
    });
    await Promise.all(channelPromises);
}
