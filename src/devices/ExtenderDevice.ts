import { Device } from "./Device";
import { LedButton } from "../decorators/surface-elements/LedButton";
import { TouchSensitiveMotorFader } from "../decorators/surface-elements/TouchSensitiveFader";
import { LedPushEncoder } from "../decorators/surface-elements/LedPushEncoder";
import { GlobalState } from "/state";
import { TimerUtils, createElements } from "/util";

// QCon Pro X / XS specific hardware constants [cite: 476, 477]
const channelWidth = 3.75; 
const buttonRowHeight = 2.35;
const surfaceHeight = 39.5;

export class ExtenderDevice extends Device {
  constructor(
    driver: MR_DeviceDriver,
    surface: MR_DeviceSurface,
    globalState: GlobalState,
    timerUtils: TimerUtils,
    firstChannelIndex: number,
    surfaceXPosition: number,
    portIndex: number,
  ) {
    // 1. Create Functional & Visual Channel Elements [cite: 478, 479]
    const channelElements = createElements(8, (index) => {
      const currentX = surfaceXPosition + index * channelWidth;
      const encoder = new LedPushEncoder(surface, 3.1 + currentX, 8.8, 3.6, 3.6);
      
      // VISUAL FIX: Add label fields so Cubase draws the LCD screens [cite: 443, 604]
      // Primary Display row
      surface.makeLabelField(3.1 + currentX, 3, 3.75, 2).relateTo(encoder); 

      return {
        index,
        encoder,
        scribbleStrip: {
          trackTitle: surface.makeCustomValueVariable("scribbleStripTrackTitle"),
          meterPeakLevel: surface.makeCustomValueVariable("Meter Peak Level"),
        },
        vuMeter: surface.makeCustomValueVariable("vuMeter"),
        buttons: {
          record: new LedButton(surface, { position: [4 + currentX, 13, 1.8, 1.5], isChannelButton: true }),
          solo: new LedButton(surface, { position: [4 + currentX, 13 + buttonRowHeight, 1.8, 1.5], isChannelButton: true }),
          mute: new LedButton(surface, { position: [4 + currentX, 13 + buttonRowHeight * 2, 1.8, 1.5], isChannelButton: true }),
          select: new LedButton(surface, { position: [4 + currentX, 13 + buttonRowHeight * 3, 1.8, 1.5], isChannelButton: true }),
        },
        fader: new TouchSensitiveMotorFader(surface, 4 + currentX, 24.4, 1.8, 12),
      };
    });

    const extenderWidth = (8 * channelWidth) + 3.1;

    // 2. Initialize parent device
    super(driver, firstChannelIndex, { width: extenderWidth, channelElements }, globalState, timerUtils, true, portIndex);
    
    // VISUAL FIX: Define the chassis background [cite: 387, 448]
    // This removes the "black square" by defining a frame for the device
    // surface.makeBlindPanel(surfaceXPosition, 0, extenderWidth, surfaceHeight);

    // VISUAL FIX: Add the silver display bar common to iCON devices [cite: 449, 453]
    // surface.makeBlindPanel(surfaceXPosition + 1.5, 1.5, extenderWidth - 3, 5);
  }
}