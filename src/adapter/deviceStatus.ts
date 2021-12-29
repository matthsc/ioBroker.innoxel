import { IDeviceStatusData, IDeviceStatusResponse } from "innoxel-soap";
import { Innoxel } from "../main";

type IndexableDeviceStatusResponse = IDeviceStatusResponse & { [key: string]: IDeviceStatusData | string };

export async function createDeviceStatusStates(adapter: Innoxel, data: IDeviceStatusResponse): Promise<void> {
    await adapter.extendObjectAsync("deviceStatus", {
        type: "device",
        common: { name: "deviceStatus" },
    });
    const statePromises = Object.keys(data).map((key) => {
        return adapter.extendObjectAsync(`deviceStatus.${key}`, {
            type: "state",
            common: getCommon(data as IndexableDeviceStatusResponse, key),
        });
    });

    await Promise.all(statePromises);
    await updateDeviceStatusStates(adapter, data);
}

function getCommon(dataObj: IndexableDeviceStatusResponse, key: string): Partial<ioBroker.StateCommon> {
    const data = dataObj[key];

    let type: ioBroker.CommonType;
    let role: string;
    let unit: string;

    if (typeof data === "string") {
        type = "string";
        role = "state";
        unit = "";
    } else {
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

        if (key === "statisticsSerialTx") type = "number";
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

export async function updateDeviceStatusStates(adapter: Innoxel, data: IDeviceStatusResponse): Promise<void> {
    const promises = Object.keys(data).map((key) => {
        const obj = (data as IndexableDeviceStatusResponse)[key];
        const value = typeof obj === "string" ? obj : obj["#text"];
        return adapter.setStateChangedAsync(`deviceStatus.${key}`, value, true);
    });
    await Promise.all(promises);
}
