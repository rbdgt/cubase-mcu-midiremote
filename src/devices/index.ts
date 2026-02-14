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
    const device = new (deviceType === "main" ? MainDevice : ExtenderDevice)(
      driver,
      surface,
      globalState,
      timerUtils,
      deviceIndex * 8, // Each device handles 8 channels
      nextDeviceXPosition,
    ) as MainDevice | ExtenderDevice;

    nextDeviceXPosition += device.surfaceWidth;
    return device;
  });

  // 2. Hardcoded iCON Detection logic (Replacing the old generic loop)
  // This ensures Cubase only looks for your specific iCON hardware.
  const detectionUnit = driver.makeDetectionUnit();
  let nextExtenderId = 1;

  for (const device of devices) {
    const portPair = detectionUnit.detectPortPair(device.ports.input, device.ports.output);

    if (device instanceof MainDevice) {
      // Main Pro X detection string 
      portPair
        .expectInputNameContains("QCON Pro X")
        .expectOutputNameContains("QCON Pro X");
        //.expectInputNameContains("iCON QCON Pro X V2.10")
        //.expectOutputNameContains("iCON QCON Pro X V2.10");
    } else {
      // XS Extender detection string [cite: 481]
      portPair
      .expectInputNameContains(`QCON XS${nextExtenderId}`)
      .expectOutputNameContains(`QCON XS${nextExtenderId}`);
        //.expectInputNameContains(`iCON QCON XS${nextExtenderId} V2.08`)
        //.expectOutputNameContains(`iCON QCON XS${nextExtenderId} V2.08`);
      nextExtenderId++;
    }
  }

  return devices;
}