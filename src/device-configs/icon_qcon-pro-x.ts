/**
 * @vendor iCON
 * @device QCon Pro X
 */

import { ChannelSurfaceElements, DeviceConfig } from ".";
import { JogWheel } from "/decorators/surface-elements/JogWheel";
import { Lamp } from "/decorators/surface-elements/Lamp";
import { LedButton } from "/decorators/surface-elements/LedButton";
import { LedPushEncoder } from "/decorators/surface-elements/LedPushEncoder";
import { TouchSensitiveMotorFader } from "/decorators/surface-elements/TouchSensitiveFader";
import { createElements } from "/util";

const channelWidth = 3.75;
const channelElementsWidth = 4 + 8 * channelWidth;
const surfaceHeight = 39.5;
const buttonRowHeight = 2.35;
const buttonDistance = 2.55;

function makeSquareButton(surface: MR_DeviceSurface, x: number, y: number, isChannelButton = false) {
  return new LedButton(surface, { position: [x, y, 1.8, 1.5], isChannelButton });
}

function makeChannelElements(surface: MR_DeviceSurface, x: number): ChannelSurfaceElements[] {
  return createElements(8, (index) => {
    const currentChannelXPosition = x + index * channelWidth;
    const encoder = new LedPushEncoder(surface, 3.1 + currentChannelXPosition, 8.8, 3.6, 3.6);
    return {
      index,
      encoder,
      scribbleStrip: { 
        trackTitle: surface.makeCustomValueVariable("scribbleStripTrackTitle"),
        meterPeakLevel: surface.makeCustomValueVariable("Meter Peak Level"),
      },
      vuMeter: surface.makeCustomValueVariable("vuMeter"),
      buttons: {
        record: makeSquareButton(surface, 4 + currentChannelXPosition, 13, true),
        solo: makeSquareButton(surface, 4 + currentChannelXPosition, 13 + buttonRowHeight, true),
        mute: makeSquareButton(surface, 4 + currentChannelXPosition, 13 + buttonRowHeight * 2, true),
        select: makeSquareButton(surface, 4 + currentChannelXPosition, 13 + buttonRowHeight * 3, true),
      },
      fader: new TouchSensitiveMotorFader(surface, 4 + currentChannelXPosition, 24.4, 1.8, 12),
    };
  });
}

export const deviceConfig: DeviceConfig = {
  hasSecondaryScribbleStrips: true,
  maximumMeterValue: 0xd,
  detectionUnits: [
    {
      main: (detectionPortPair) =>
        detectionPortPair
          .expectInputNameContains("iCON QCON Pro X V2.10")
          .expectOutputNameContains("iCON QCON Pro X V2.10"),
      extender: (detectionPortPair, extenderNumber) =>
        detectionPortPair
          .expectInputNameContains(`iCON QCON XS${extenderNumber} V2.08`)
          .expectOutputNameContains(`iCON QCON XS${extenderNumber} V2.08`),
    },
  ],

  enhanceMapping({ devices, lifecycleCallbacks }) {
    lifecycleCallbacks.addActivationCallback((context) => {
      let mainDevice = null;
      for (var i = 0; i < devices.length; i++) {
        // Safe check for ports and isExtender
        if (devices[i] && devices[i].ports && !devices[i].ports.isExtender) {
          mainDevice = devices[i];
          break;
        }
      }

      if (mainDevice && mainDevice.lcdManager) {
        // Send "MASTER" to the final 6-character slot
        mainDevice.lcdManager.sendText(context, 50, "MASTER", true);
      }
    });

  },

  createExtenderSurface(surface, x) {
    return { width: channelElementsWidth + 3.1, channelElements: makeChannelElements(surface, x) };
  },
  
  createMainSurface(surface, x) {
    const channelElements = makeChannelElements(surface, x);
    x += channelElementsWidth;
    const transportButtons = createElements(5, (i) => new LedButton(surface, { position: [x + 6.25 + i * 4.0625, 28.5, 3.1, 2.1] }));
    return {
      width: channelElementsWidth + 20,
      channelElements,
      controlSectionElements: {
        mainFader: new TouchSensitiveMotorFader(surface, x, 24.4, 1.8, 12),
        mainVuMeters: {
          left: surface.makeCustomValueVariable("Main VU Meter L"),
          right: surface.makeCustomValueVariable("Main VU Meter R"),
        },
        jogWheel: new JogWheel(surface, x + 12.75, 30, 6, 6),
        buttons: {
          transport: { rewind: transportButtons[0], forward: transportButtons[1], stop: transportButtons[2], play: transportButtons[3], record: transportButtons[4] }
        }
      }
    };
  }
};