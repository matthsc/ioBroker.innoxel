import type { InnoxelApi, ModuleRoomClimateSetType } from "innoxel-soap";

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
  const [module, channel] = parseNumbersFromMessage(obj, 2);
  await api.triggerPushButton(module, channel);
}

async function setDimValue(
  api: InnoxelApi,
  obj: ioBroker.Message,
): Promise<void> {
  const [moduleIndex, channel, dimValue, dimSpeed = 0] =
    parseNumbersFromMessage(obj, 3);
  await api.setDimValue(moduleIndex, channel, dimValue, dimSpeed);
}

function parseNumbersFromMessage(
  obj: ioBroker.Message,
  minLength: number,
): number[] {
  if (typeof obj.message !== "string") {
    throw new Error(`Invalid message payload for ${obj.command}`);
  }
  const nums = obj.message
    .split(":")
    .map((x: string) => Number.parseInt(x, 10));
  if (nums.length < minLength || nums.some(Number.isNaN)) {
    throw new Error(`Invalid numeric arguments for ${obj.command}`);
  }
  return nums;
}

async function setTemperature(
  api: InnoxelApi,
  obj: ioBroker.Message,
): Promise<void> {
  if (typeof obj.message !== "string") {
    throw new Error(`Invalid message payload for ${obj.command}`);
  }
  const [moduleIndexRaw, type, temperatureRaw] = obj.message.split(":");
  const moduleIndex = Number.parseInt(moduleIndexRaw, 10);
  const temperature = Number.parseFloat(temperatureRaw);
  if (Number.isNaN(moduleIndex) || !type || Number.isNaN(temperature)) {
    throw new Error("Invalid arguments for setTemperature");
  }
  await api.setRoomClimate(
    moduleIndex,
    type as ModuleRoomClimateSetType,
    temperature,
  );
}
