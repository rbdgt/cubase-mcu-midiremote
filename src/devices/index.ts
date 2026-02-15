import { ExtenderDevice } from "./ExtenderDevice";
import { MainDevice } from "./MainDevice";
import { config } from "/config"; // Still needed for user preferences
import { GlobalState } from "/state";
import { TimerUtils } from "/util";

export { Device } from "./Device";
export { ExtenderDevice } from "./ExtenderDevice";
export { MainDevice } from "./MainDevice";

/**
 * This function creates the actual software objects for your QCon Pro X hardware.
 */
export function createDevices(
  driver: MR_DeviceDriver,
  surface: MR_DeviceSurface,
  globalState: GlobalState,
  timerUtils: TimerUtils,
): Array<MainDevice | ExtenderDevice> {
  let nextDeviceXPosition = 0;

  // 1. Create the device objects based on your config.ts settings
  const devices = config.devices.map((deviceType, deviceIndex) => {
    const portIndex = deviceIndex + 1; // Start port index at 1 for better readability in MIDI monitoring tools
    const device = new (deviceType === "main" ? MainDevice : ExtenderDevice)(
      driver,
      surface,
      globalState,
      timerUtils,
      deviceIndex * 8, // Each device handles 8 channels
      nextDeviceXPosition,
      portIndex
    ) as MainDevice | ExtenderDevice;

    nextDeviceXPosition += device.surfaceWidth;
    return device;
  });

  // 2. Detection logic with proper extender numbering and port pairing
  const detectionUnit = driver.makeDetectionUnit();
  let nextExtenderId = 1; // Start extender numbering at 1

  for (const device of devices) {
    const portPair = detectionUnit.detectPortPair(device.ports.input, device.ports.output);

    if (device instanceof MainDevice) {
      portPair
        .expectInputNameStartsWith(`iCON QCON Pro X `)
        .expectOutputNameStartsWith(`iCON QCON Pro X `);
    } else {
      portPair
        .expectInputNameStartsWith(`iCON QCON Pro XS${nextExtenderId}`)
        .expectOutputNameStartsWith(`iCON QCON Pro XS${nextExtenderId}`);
      nextExtenderId++;
    }
  }

  return devices;
}