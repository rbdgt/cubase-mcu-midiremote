import { Device } from "./Device";
import { LedButton } from "../decorators/surface-elements/LedButton";
import { TouchSensitiveMotorFader } from "../decorators/surface-elements/TouchSensitiveFader";
import { LedPushEncoder } from "../decorators/surface-elements/LedPushEncoder";
import { JogWheel } from "../decorators/surface-elements/JogWheel";
import { Lamp } from "../decorators/surface-elements/Lamp";
import { ChannelTextManager } from "../midi/managers/lcd/ChannelTextManager";
import { GlobalState } from "../state";
import { TimerUtils, createElements, applyDefaultsFactory } from "../util";
import { ControlSectionSurfaceElements, ControlSectionSurfaceElementsDefaultsFactory } from "../device-configs";

// QCon Pro X specific hardware constants [cite: 276, 277]
const channelWidth = 3.75; 
const channelElementsWidth = 4 + 8 * channelWidth;
const buttonRowHeight = 2.35; 

export class MainDevice<CustomElements extends Record<string, any> = {}> extends Device {
  controlSectionElements: ControlSectionSurfaceElements;
  customElements: CustomElements;
  public masterTextManager: ChannelTextManager;
  public masterMeterPeakLevel: MR_CustomValueVariable;

  constructor(
    driver: MR_DeviceDriver,
    surface: MR_DeviceSurface,
    globalState: GlobalState,
    timerUtils: TimerUtils,
    firstChannelIndex: number,
    surfaceXPosition: number,
    portIndex: number,
  ) {
    // 1. Create Channel Strip Elements [cite: 278, 281]
    const channelElements = createElements(8, (index) => {
      const currentX = surfaceXPosition + index * channelWidth;
      const encoder = new LedPushEncoder(surface, 3.1 + currentX, 8.8, 3.6, 3.6); 
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
          mute: new LedButton(surface, { position: [4 + currentX, 13 + (buttonRowHeight * 2), 1.8, 1.5], isChannelButton: true }), 
          select: new LedButton(surface, { position: [4 + currentX, 13 + (buttonRowHeight * 3), 1.8, 1.5], isChannelButton: true }), 
        },
        fader: new TouchSensitiveMotorFader(surface, 4 + currentX, 24.4, 1.8, 12), 
      };
    });

    const mainSurfaceWidth = channelElementsWidth + 24;
    super(driver, firstChannelIndex, { width: mainSurfaceWidth, channelElements }, globalState, timerUtils, false, portIndex);

    // 2. Setup Master Section Text Logic [cite: 284, 285]
    this.masterTextManager = new ChannelTextManager(
      globalState, 
      timerUtils, 
      (ctx, row, txt) => {
        if (row < 2) return; 
        const displayRow = row - 2; 
        const startIndex = (displayRow * 56) + 50; 
        this.lcdManager.sendText(ctx, startIndex, txt.substring(0, 6), true); 
      },
      6 
    );
    this.masterMeterPeakLevel = surface.makeCustomValueVariable("Master Meter Peak Level");

    // 3. Layout Constants [cite: 286, 292]
    const masterX = surfaceXPosition + channelElementsWidth - 0.5;
    const cx = masterX + 4;
    const cy = 5;
    const dx = 2.4;
    const dy = 2.2;
    const bw = 1.8;
    const bh = 1.4;
    const transY = cy + dy * 10.5;

    // 4. RESTORED VISUAL BLIND PANELS 
    surface.makeBlindPanel(cx - 0.5, cy - 0.8, dx * 6.5, dy * 9.8); // Main Matrix panel
    surface.makeBlindPanel(cx - 0.5, transY - 0.8, dx * 6.5, bh * 2.5); // Transport panel
    surface.makeBlindPanel(cx + dx * 1, cy + dy * 0, bw, bh); // Name/Value mockup
    surface.makeBlindPanel(cx + dx * 5, cy + dy * 4, bw, bh); // Motor mockup
    surface.makeBlindPanel(cx + dx * 1, cy + dy * 1.5, bw, bh); // Layer 2 mockup
    surface.makeBlindPanel(cx + dx * 2, cy + dy * 7, bw, bh); // Lock Faders mockup
    surface.makeBlindPanel(cx + dx * 3, cy + dy * 7, bw, bh); // Switch fader/encoder mockup

    const partialElements = {
      mainFader: new TouchSensitiveMotorFader(surface, masterX, 24.4, 1.8, 12),
      mainVuMeters: {
        left: surface.makeCustomValueVariable("Main VU Meter L"), 
        right: surface.makeCustomValueVariable("Main VU Meter R"), 
      },
      jogWheel: new JogWheel(surface, cx + (dx * 3), transY + 3, 8, 8), 

      buttons: {
        display: new LedButton(surface), // Hidden proxy
        timeMode: new LedButton(surface, { position: [cx + (dx * 2), cy, bw, bh] }),
        function: createElements(8, (i) => {
            const row = Math.floor(i / 4);
            const col = (i % 4) + 2;
            return new LedButton(surface, { position: [cx + (dx * col), cy + dy * (row + 1), bw, bh * 0.5] });
        }),
        encoderAssign: {
            track: new LedButton(surface, { position: [cx, cy + (dy * 3), bw, bh] }),
            send: new LedButton(surface, { position: [cx + dx, cy + (dy * 3), bw, bh] }),
            pan: new LedButton(surface, { position: [cx + (dx * 2), cy + (dy * 3), bw, bh] }),
            plugin: new LedButton(surface, { position: [cx + (dx * 3), cy + (dy * 3), bw, bh] }),
            eq: new LedButton(surface, { position: [cx + (dx * 4), cy + (dy * 3), bw, bh] }),            
            instrument: new LedButton(surface, { position: [cx + (dx * 5), cy + (dy * 3), bw, bh] }),
        },
        navigation: {
            bank: {
                left: new LedButton(surface, { position: [cx + (dx * 2), cy + (dy * 8), bw, bh] }),
                right: new LedButton(surface, { position: [cx + (dx * 3), cy + (dy * 8), bw, bh] })
            },
            channel: {
                left: new LedButton(surface, { position: [cx + (dx * 4), cy + (dy * 8), bw, bh] }),
                right: new LedButton(surface, { position: [cx + (dx * 5), cy + (dy * 8), bw, bh] })
            },
            directions: {
                up: new LedButton(surface, { position: [cx + dx, transY + 4.5, bw, bh] }),
                left: new LedButton(surface, { position: [cx, transY + 6, bw, bh] }),
                center: new LedButton(surface, { position: [cx + dx, transY + 6, bw, bh] }), // Zoom
                right: new LedButton(surface, { position: [cx + (dx * 2), transY + 6, bw, bh] }),
                down: new LedButton(surface, { position: [cx + dx, transY + 7.5, bw, bh] }),
            }
        },
        automation: {
            read: new LedButton(surface, { position: [cx, cy + (dy * 4), bw, bh] }),
            write: new LedButton(surface, { position: [cx + dx, cy + (dy * 4), bw, bh] }),
            sends: new LedButton(surface, { position: [cx + (dx * 2), cy + (dy * 4), bw, bh] }),
            project: new LedButton(surface, { position: [cx + (dx * 3), cy + (dy * 4), bw, bh] }),
            mixer: new LedButton(surface, { position: [cx + (dx * 4), cy + (dy * 4), bw, bh] }),
            motor: new LedButton(surface), 
        },
        modify: {
            undo: new LedButton(surface, { position: [cx + (dx * 2), cy + (dy * 5), bw, bh] }),
            redo: new LedButton(surface, { position: [cx + (dx * 3), cy + (dy * 5), bw, bh] }),
            save: new LedButton(surface, { position: [cx + (dx * 2), cy + (dy * 6), bw, bh] }),
            revert: new LedButton(surface, { position: [cx + (dx * 3), cy + (dy * 6), bw, bh] }),
        },
        utility: {
            instrument: new LedButton(surface, { position: [cx + (dx * 4), cy + (dy * 5), bw, bh] }),
            main: new LedButton(surface, { position: [cx + (dx * 5), cy + (dy * 5), bw, bh] }),
            soloDefeat: new LedButton(surface, { position: [cx + (dx * 4), cy + (dy * 6), bw, bh] }),
            shift: new LedButton(surface, { position: [cx + (dx * 5), cy + (dy * 6), bw, bh] }),
        },
        edit: new LedButton(surface, { position: [cx + (dx * 5), cy, bw, bh] }),
        transport: {
            markers: {
                previous: new LedButton(surface, { position: [cx + (dx * 3), cy, bw, bh * 0.5] }),
                add: new LedButton(surface, { position: [cx + (dx * 3), cy + (bh * 0.5), bw, bh * 0.5] }),
                next: new LedButton(surface, { position: [cx + (dx * 4), cy, bw, bh] }),
            },
            left: new LedButton(surface, { position: [cx + (dx * 4), cy + (dy * 7), bw, bh] }),
            right: new LedButton(surface, { position: [cx + (dx * 5), cy + (dy * 7), bw, bh] }),
            rewind: new LedButton(surface, { position: [cx, transY, bw, bh] }),
            forward: new LedButton(surface, { position: [cx + dx, transY, bw, bh] }),
            cycle: new LedButton(surface, { position: [cx + (dx * 2), transY, bw, bh] }),
            stop: new LedButton(surface, { position: [cx + (dx * 3), transY, bw, bh] }),
            play: new LedButton(surface, { position: [cx + (dx * 4), transY, bw, bh] }),
            record: new LedButton(surface, { position: [cx + (dx * 5), transY, bw, bh] }),
            punch: new LedButton(surface),
        },
        scrub: new LedButton(surface, { position: [cx + (dx * 2.5), transY + 2, bw, bh] }),
        flip: new LedButton(surface) 
      }
    };

    this.controlSectionElements = this.applyControlSectionElementDefaults(surface, partialElements);

    // 5. RESTORED LAYER 2 FUNCTION KEYS [cite: 321, 322]
    this.customElements = {
        functionLayer2: createElements(8, (i) => {
            const row = Math.floor(i / 4); 
            const col = (i % 4) + 2;           
            return new LedButton(surface, { position: [cx + (dx * col), cy + (dy * (row + 1)) + (bh * 0.5), bw, bh * 0.5] });
        })
    } as any;
  }

  private applyControlSectionElementDefaults(surface: MR_DeviceSurface, elements: any): ControlSectionSurfaceElements {
    const makeButton = () => new LedButton(surface);
    const defaultsFactory: ControlSectionSurfaceElementsDefaultsFactory = {
      buttons: {
        display: makeButton, timeMode: makeButton, edit: makeButton, flip: makeButton, scrub: makeButton,
        encoderAssign: { track: makeButton, pan: makeButton, eq: makeButton, send: makeButton, plugin: makeButton, instrument: makeButton },
        number: () => createElements(8, makeButton),
        function: () => createElements(8, makeButton),
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