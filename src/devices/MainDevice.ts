import { Device } from "./Device";
import { LedButton } from "../decorators/surface-elements/LedButton";
import { TouchSensitiveMotorFader } from "../decorators/surface-elements/TouchSensitiveFader";
import { LedPushEncoder } from "../decorators/surface-elements/LedPushEncoder";
import { JogWheel } from "../decorators/surface-elements/JogWheel";
import { Lamp } from "../decorators/surface-elements/Lamp";
import { ChannelTextManager } from "../midi/managers/lcd/ChannelTextManager";
import { GlobalState } from "../state";
import { TimerUtils, createElements, applyDefaultsFactory } from "../util";
import { ChannelSurfaceElements, ControlSectionSurfaceElements, ControlSectionSurfaceElementsDefaultsFactory } from "../device-configs";

// QCon Pro X specific hardware constants
const channelWidth = 3.75; // [cite: 476]
const channelElementsWidth = 4 + 8 * channelWidth; // [cite: 476]
const buttonRowHeight = 2.35; // [cite: 476]

export class MainDevice<CustomElements extends Record<string, any> = {}> extends Device {
  controlSectionElements: ControlSectionSurfaceElements;
  customElements: CustomElements;
  public masterTextManager: ChannelTextManager;

  constructor(
    driver: MR_DeviceDriver,
    surface: MR_DeviceSurface,
    globalState: GlobalState,
    timerUtils: TimerUtils,
    firstChannelIndex: number,
    surfaceXPosition: number,
  ) {
    // 1. Create Channel Elements (Faders, Encoders, Buttons for 8 strips)
    const channelElements = createElements(8, (index) => {
      const currentX = surfaceXPosition + index * channelWidth;
      const encoder = new LedPushEncoder(surface, 3.1 + currentX, 8.8, 3.6, 3.6); // 
      
      // Make label fields to allow Cubase to show parameter names in the UI
      surface.makeLabelField(3.1 + currentX, 3, 3.75, 2).relateTo(encoder); 

      return {
        index,
        encoder,
        scribbleStrip: { 
          trackTitle: surface.makeCustomValueVariable("scribbleStripTrackTitle"),
          meterPeakLevel: surface.makeCustomValueVariable("Meter Peak Level"), // 
        },
        vuMeter: surface.makeCustomValueVariable("vuMeter"),
        buttons: {
          record: new LedButton(surface, { position: [4 + currentX, 13, 1.8, 1.5], isChannelButton: true }), // [cite: 479]
          solo: new LedButton(surface, { position: [4 + currentX, 13 + buttonRowHeight, 1.8, 1.5], isChannelButton: true }), // [cite: 479]
          mute: new LedButton(surface, { position: [4 + currentX, 13 + buttonRowHeight * 2, 1.8, 1.5], isChannelButton: true }), // [cite: 479]
          select: new LedButton(surface, { position: [4 + currentX, 13 + buttonRowHeight * 3, 1.8, 1.5], isChannelButton: true }), // [cite: 479]
        },
        fader: new TouchSensitiveMotorFader(surface, 4 + currentX, 24.4, 1.8, 12), // [cite: 479]
      };
    });

    const mainSurfaceWidth = channelElementsWidth + 20; // 
    
    // 2. Initialize Parent Device
    super(driver, firstChannelIndex, { width: mainSurfaceWidth, channelElements }, globalState, timerUtils, false);

    // 3. Setup Master Section Text logic [cite: 697, 698]
    this.masterTextManager = new ChannelTextManager(
      globalState, 
      timerUtils, 
      (ctx, row, txt) => {
        const displayRow = row > 1 ? row - 2 : row; 
        const startIndex = (displayRow * 56) + 50; 
        this.lcdManager.sendText(ctx, startIndex, txt.substring(0, 6), row > 1);
      }
    );

    // 4. Define Control Section Elements (Buttons, Jog Wheel, Master Fader)
    const controlX = surfaceXPosition + channelElementsWidth;
    const transportButtons = createElements(5, (i) => 
        new LedButton(surface, { position: [controlX + 6.25 + i * 4.0625, 28.5, 3.1, 2.1] }) // [cite: 485]
    );

    const partialElements = {
      mainFader: new TouchSensitiveMotorFader(surface, controlX, 24.4, 1.8, 12), // 
      mainVuMeters: {
        left: surface.makeCustomValueVariable("Main VU Meter L"), // 
        right: surface.makeCustomValueVariable("Main VU Meter R"), // 
      },
      jogWheel: new JogWheel(surface, controlX + 12.75, 30, 6, 6), // 
      buttons: {
        transport: { 
            rewind: transportButtons[0], 
            forward: transportButtons[1], 
            stop: transportButtons[2], 
            play: transportButtons[3], 
            record: transportButtons[4] 
        } // [cite: 487]
      }
    };

    // Fill in defaults for any buttons not explicitly positioned yet
    this.controlSectionElements = this.applyControlSectionElementDefaults(surface, partialElements);
    this.customElements = {} as CustomElements;
  }

  private applyControlSectionElementDefaults(
    surface: MR_DeviceSurface,
    elements: any,
  ): ControlSectionSurfaceElements {
    const makeButton = () => new LedButton(surface);
    const defaultsFactory: ControlSectionSurfaceElementsDefaultsFactory = {
      buttons: {
        display: makeButton,
        timeMode: makeButton,
        edit: makeButton,
        flip: makeButton,
        scrub: makeButton,
        encoderAssign: {
          track: makeButton, pan: makeButton, eq: makeButton,
          send: makeButton, plugin: makeButton, instrument: makeButton,
        },
        number: () => createElements(8, () => new LedButton(surface)),
        function: () => createElements(8, () => new LedButton(surface)),
        modify: { undo: makeButton, redo: makeButton, save: makeButton, revert: makeButton },
        automation: { read: makeButton, write: makeButton, sends: makeButton, project: makeButton, mixer: makeButton, motor: makeButton },
        utility: { instrument: makeButton, main: makeButton, soloDefeat: makeButton, shift: makeButton },
        transport: { left: makeButton, right: makeButton, cycle: makeButton, punch: makeButton, markers: { previous: makeButton, add: makeButton, next: makeButton }, rewind: makeButton, forward: makeButton, stop: makeButton, play: makeButton, record: makeButton },
        navigation: { bank: { left: makeButton, right: makeButton }, channel: { left: makeButton, right: makeButton }, directions: { left: makeButton, right: makeButton, up: makeButton, center: makeButton, down: makeButton } },
      },
      displayLeds: { smpte: () => new Lamp(surface), beats: () => new Lamp(surface), solo: () => new Lamp(surface) },
      expressionPedal: () => ({ mSurfaceValue: surface.makeCustomValueVariable("ExpressionPedal") }) as MR_Knob,
      footSwitch1: () => ({ mSurfaceValue: surface.makeCustomValueVariable("FootSwitch1") }) as MR_Button,
      footSwitch2: () => ({ mSurfaceValue: surface.makeCustomValueVariable("FootSwitch2") }) as MR_Button,
    };
    return applyDefaultsFactory(elements, defaultsFactory);
  }
}