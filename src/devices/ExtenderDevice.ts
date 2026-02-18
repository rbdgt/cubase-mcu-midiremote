import { Device } from "./Device";
import { LedButton } from "../decorators/surface-elements/LedButton";
import { TouchSensitiveMotorFader } from "../decorators/surface-elements/TouchSensitiveFader";
import { LedPushEncoder } from "../decorators/surface-elements/LedPushEncoder";
import { GlobalState } from "/state";
import { TimerUtils, createElements } from "/util";

// Single source of truth for channel strip UI dimensions
export const ChannelLayout = {
  width: 3.75,
  btnHSpacing: 2.35,
  encoder: { y: 8.8, w: 3.6, h: 3.6, offsetX: 3.1 },
  display: { y: 3, w: 3.75, h: 2, offsetX: 3.1 },
  buttons: { startY: 13, w: 1.8, h: 1.5, offsetX: 4 },
  fader:   { y: 24.4, w: 1.8, h: 12, offsetX: 4 }
};

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
    const channelElements = createElements(8, (index) => {
      const currentX = surfaceXPosition + index * ChannelLayout.width;
      const encX = currentX + ChannelLayout.encoder.offsetX;
      const btnX = currentX + ChannelLayout.buttons.offsetX;

      const encoder = new LedPushEncoder(surface, encX, ChannelLayout.encoder.y, ChannelLayout.encoder.w, ChannelLayout.encoder.h);
      
      // Primary Display row
      surface.makeLabelField(currentX + ChannelLayout.display.offsetX, ChannelLayout.display.y, ChannelLayout.display.w, ChannelLayout.display.h).relateTo(encoder); 

      return {
        index,
        encoder,
        scribbleStrip: {
          trackTitle: surface.makeCustomValueVariable("scribbleStripTrackTitle"),
          meterPeakLevel: surface.makeCustomValueVariable("Meter Peak Level"),
        },
        vuMeter: surface.makeCustomValueVariable("vuMeter"),
        buttons: {
          record: new LedButton(surface, { position: [btnX, ChannelLayout.buttons.startY, ChannelLayout.buttons.w, ChannelLayout.buttons.h], isChannelButton: true }),
          solo: new LedButton(surface, { position: [btnX, ChannelLayout.buttons.startY + ChannelLayout.btnHSpacing, ChannelLayout.buttons.w, ChannelLayout.buttons.h], isChannelButton: true }),
          mute: new LedButton(surface, { position: [btnX, ChannelLayout.buttons.startY + ChannelLayout.btnHSpacing * 2, ChannelLayout.buttons.w, ChannelLayout.buttons.h], isChannelButton: true }),
          select: new LedButton(surface, { position: [btnX, ChannelLayout.buttons.startY + ChannelLayout.btnHSpacing * 3, ChannelLayout.buttons.w, ChannelLayout.buttons.h], isChannelButton: true }),
        },
        fader: new TouchSensitiveMotorFader(surface, btnX, ChannelLayout.fader.y, ChannelLayout.fader.w, ChannelLayout.fader.h),
      };
    });

    const extenderWidth = (8 * ChannelLayout.width) + 3.1;
    super(driver, firstChannelIndex, { width: extenderWidth, channelElements }, globalState, timerUtils, true, portIndex);
  }
}