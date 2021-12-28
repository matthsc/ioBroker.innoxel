import { IDeviceStatusData, IDeviceStatusResponse } from "innoxel-soap";
import { Innoxel } from "../main";

type IndexableDeviceStatusResponse = IDeviceStatusResponse & { [key: string]: IDeviceStatusData | string };

export async function createDeviceStatusStates(adapter: Innoxel, data: IDeviceStatusResponse): Promise<void> {
    await adapter.extendObjectAsync("deviceStatus", {
        type: "device",
        common: { name: "deviceStatus" },
    });
    const statePromises = Object.keys(data).map((key) => {
        const [type, unit] = getTypeAndUnit((data as IndexableDeviceStatusResponse)[key]);
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

function getTypeAndUnit(obj: string | IDeviceStatusData): [ioBroker.CommonType, string] {
    if (typeof obj === "string") return ["string", ""];

    const type = typeof obj["#text"] as ioBroker.CommonType;
    switch (obj.unit) {
        case "-":
            return [type, ""];
        default:
            return [type, obj.unit];
    }
}

export async function updateDeviceStatusStates(adapter: Innoxel, data: IDeviceStatusResponse): Promise<void> {
    const promises = Object.keys(data).map((key) => {
        const obj = (data as IndexableDeviceStatusResponse)[key];
        const value = typeof obj === "string" ? obj : obj["#text"];
        return adapter.setStateChangedAsync(`deviceStatus.${key}`, value, true);
    });
    await Promise.all(promises);
}
