"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleMessage = void 0;
async function handleMessage(api, obj) {
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
exports.handleMessage = handleMessage;
async function triggerInModule(api, obj) {
    const [module, channel] = parseNumbersFromMessage(obj);
    await api.triggerPushButton(module, channel);
}
async function setDimValue(api, obj) {
    const [moduleIndex, channel, dimValue, dimSpeed = 0] = parseNumbersFromMessage(obj);
    await api.setDimValue(moduleIndex, channel, dimValue, dimSpeed);
}
function parseNumbersFromMessage(obj) {
    return obj.message.split(":").map((x) => Number.parseInt(x, 10));
}
//# sourceMappingURL=messageHandler.js.map