import { ChannelSurfaceElements, DeviceSurface } from "../device-configs";
import { deviceConfig } from "/config";
import { MidiPortPair } from "/midi/MidiPortPair";
import { LcdManager } from "/midi/managers/lcd";
import { GlobalState } from "/state";
import { TimerUtils } from "/util";

/**
 * A `Device` represents a physical device and manages its MIDI ports and surface elements [cite: 828]
 */
export abstract class Device {
  surfaceWidth: number;
  channelElements: ChannelSurfaceElements[];

  ports: MidiPortPair;
  lcdManager: LcdManager;

  constructor(
    driver: MR_DeviceDriver,
    public firstChannelIndex: number,
    deviceSurface: DeviceSurface,
    globalState: GlobalState,
    timerUtils: TimerUtils,
    isExtender: boolean,
    portIndex: number,
  ) {
    this.surfaceWidth = deviceSurface.width;
    this.channelElements = deviceSurface.channelElements;

    this.ports = new MidiPortPair(driver, isExtender, portIndex);
    this.lcdManager = new LcdManager(this, globalState, timerUtils);
  }
}