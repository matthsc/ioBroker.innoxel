import InnoxelApi from "innoxel-soap";

export async function handleMessage(api: InnoxelApi, obj: ioBroker.Message): Promise<boolean> {
    switch (obj.command) {
        case "triggerInModule":
            await triggerInModule(api, obj);
            break;
        case "setDimValue":
            await setDimValue(api, obj);
            break;
        default:
            return false;
    }
    return true;
}

async function triggerInModule(api: InnoxelApi, obj: ioBroker.Message): Promise<void> {
    const [module, channel] = parseNumbersFromMessage(obj);
    await api.triggerPushButton(module, channel);
}

async function setDimValue(api: InnoxelApi, obj: ioBroker.Message): Promise<void> {
    const [moduleIndex, channel, dimValue, dimSpeed = 0] = parseNumbersFromMessage(obj);
    await api.setDimValue(moduleIndex, channel, dimValue, dimSpeed);
}

function parseNumbersFromMessage(obj: ioBroker.Message): number[] {
    return obj.message.split(":").map((x: string) => Number.parseInt(x, 10));
}
