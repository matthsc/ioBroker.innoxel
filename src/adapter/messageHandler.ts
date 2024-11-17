import type InnoxelApi from "innoxel-soap";

export interface IHandleMessageResult {
  reloadModules?: boolean;
  reloadRoomClimates?: boolean;
}

export async function handleMessage(
  api: InnoxelApi,
  obj: ioBroker.Message,
): Promise<IHandleMessageResult> {
  switch (obj.command) {
    case "triggerInModule":
      await triggerInModule(api, obj);
      return { reloadModules: true };
    case "setDimValue":
      await setDimValue(api, obj);
      return { reloadModules: true };
    case "setTemperature":
      await setTemperature(api, obj);
      return { reloadRoomClimates: true };
    default:
      return {};
  }
}

async function triggerInModule(
  api: InnoxelApi,
  obj: ioBroker.Message,
): Promise<void> {
  const [module, channel] = parseNumbersFromMessage(obj);
  await api.triggerPushButton(module, channel);
}

async function setDimValue(
  api: InnoxelApi,
  obj: ioBroker.Message,
): Promise<void> {
  const [moduleIndex, channel, dimValue, dimSpeed = 0] =
    parseNumbersFromMessage(obj);
  await api.setDimValue(moduleIndex, channel, dimValue, dimSpeed);
}

function parseNumbersFromMessage(obj: ioBroker.Message): number[] {
  return obj.message.split(":").map((x: string) => Number.parseInt(x, 10));
}

async function setTemperature(
  api: InnoxelApi,
  obj: ioBroker.Message,
): Promise<void> {
  const [moduleIndex, type, temperature] = obj.message.split(":");
  await api.setRoomClimate(
    Number.parseInt(moduleIndex, 10),
    type,
    Number.parseFloat(temperature),
  );
}
