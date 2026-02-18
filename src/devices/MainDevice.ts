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
import { ChannelLayout } from "./ExtenderDevice";

export interface QConCustomElements extends Record<string, any> {
  functionLayer2: LedButton[];
}

export class MainDevice extends Device {
  controlSectionElements: ControlSectionSurfaceElements;
  customElements: QConCustomElements;
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
    // 1. Create Channel Strip Elements using shared layout
    const channelElements = createElements(8, (index) => {
      const currentX = surfaceXPosition + index * ChannelLayout.width;
      const encX = currentX + ChannelLayout.encoder.offsetX;
      const btnX = currentX + ChannelLayout.buttons.offsetX;

      const encoder = new LedPushEncoder(surface, encX, ChannelLayout.encoder.y, ChannelLayout.encoder.w, ChannelLayout.encoder.h); 
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
          mute: new LedButton(surface, { position: [btnX, ChannelLayout.buttons.startY + (ChannelLayout.btnHSpacing * 2), ChannelLayout.buttons.w, ChannelLayout.buttons.h], isChannelButton: true }), 
          select: new LedButton(surface, { position: [btnX, ChannelLayout.buttons.startY + (ChannelLayout.btnHSpacing * 3), ChannelLayout.buttons.w, ChannelLayout.buttons.h], isChannelButton: true }), 
        },
        fader: new TouchSensitiveMotorFader(surface, btnX, ChannelLayout.fader.y, ChannelLayout.fader.w, ChannelLayout.fader.h), 
      };
    });

    const channelElementsWidth = 4 + 8 * ChannelLayout.width;
    const mainSurfaceWidth = channelElementsWidth + 24;
    super(driver, firstChannelIndex, { width: mainSurfaceWidth, channelElements }, globalState, timerUtils, false, portIndex);

    // 2. Setup Master Section Text Logic
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

    // 3. Structured Master Layout Engine
    const masterX = surfaceXPosition + channelElementsWidth - 0.5;
    
    const MasterLayout = {
      cx: masterX + 4,
      cy: 5,
      dx: 2.4,
      dy: 2.2,
      bw: 1.8,
      bh: 1.4,
      transY: 5 + 2.2 * 10.5,
      
      // Standard upper matrix grid (columns 0-5, rows 0-8)
      grid: (col: number, row: number, wMult = 1, hMult = 1): [number, number, number, number] => 
        [masterX + 4 + (2.4 * col), 5 + (2.2 * row), 1.8 * wMult, 1.4 * hMult],
      
      // Precise y-offset from the matrix origin
      exact: (col: number, yOffset: number, wMult = 1, hMult = 1): [number, number, number, number] => 
        [masterX + 4 + (2.4 * col), 5 + yOffset, 1.8 * wMult, 1.4 * hMult],

      // Lower transport/jog block grid
      transport: (col: number, yOffset: number, wMult = 1, hMult = 1): [number, number, number, number] => 
        [masterX + 4 + (2.4 * col), (5 + 2.2 * 10.5) + yOffset, 1.8 * wMult, 1.4 * hMult]
    };

    // 4. RESTORED VISUAL BLIND PANELS (Using strict layout properties)
    surface.makeBlindPanel(MasterLayout.cx - 0.5, MasterLayout.cy - 0.8, MasterLayout.dx * 6.5, MasterLayout.dy * 9.8); // Main Matrix panel
    surface.makeBlindPanel(MasterLayout.cx - 0.5, MasterLayout.transY - 0.8, MasterLayout.dx * 6.5, MasterLayout.bh * 2.5); // Transport panel
    surface.makeBlindPanel(...MasterLayout.grid(1, 0)); // Name/Value mockup
    surface.makeBlindPanel(...MasterLayout.grid(5, 4)); // Motor mockup
    surface.makeBlindPanel(...MasterLayout.exact(1, MasterLayout.dy * 1.5)); // Layer 2 mockup
    surface.makeBlindPanel(...MasterLayout.grid(2, 7)); // Lock Faders mockup
    surface.makeBlindPanel(...MasterLayout.grid(3, 7)); // Switch fader/encoder mockup

    const partialElements = {
      mainFader: new TouchSensitiveMotorFader(surface, masterX, 24.4, 1.8, 12),
      mainVuMeters: {
        left: surface.makeCustomValueVariable("Main VU Meter L"), 
        right: surface.makeCustomValueVariable("Main VU Meter R"), 
      },
      jogWheel: new JogWheel(surface, MasterLayout.cx + (MasterLayout.dx * 3), MasterLayout.transY + 3, 8, 8), 

      buttons: {
        display: new LedButton(surface), // Hidden proxy
        timeMode: new LedButton(surface, { position: MasterLayout.grid(2, 0) }),
        function: createElements(8, (i) => {
            const row = Math.floor(i / 4);
            const col = (i % 4) + 2;
            return new LedButton(surface, { position: MasterLayout.grid(col, row + 1, 1, 0.5) });
        }),
        encoderAssign: {
            track: new LedButton(surface, { position: MasterLayout.grid(0, 3) }),
            send: new LedButton(surface, { position: MasterLayout.grid(1, 3) }),
            pan: new LedButton(surface, { position: MasterLayout.grid(2, 3) }),
            plugin: new LedButton(surface, { position: MasterLayout.grid(3, 3) }),
            eq: new LedButton(surface, { position: MasterLayout.grid(4, 3) }),            
            instrument: new LedButton(surface, { position: MasterLayout.grid(5, 3) }),
        },
        navigation: {
            bank: {
                left: new LedButton(surface, { position: MasterLayout.grid(2, 8) }),
                right: new LedButton(surface, { position: MasterLayout.grid(3, 8) })
            },
            channel: {
                left: new LedButton(surface, { position: MasterLayout.grid(4, 8) }),
                right: new LedButton(surface, { position: MasterLayout.grid(5, 8) })
            },
            directions: {
                up: new LedButton(surface, { position: MasterLayout.transport(1, 4.5) }),
                left: new LedButton(surface, { position: MasterLayout.transport(0, 6) }),
                center: new LedButton(surface, { position: MasterLayout.transport(1, 6) }), // Zoom
                right: new LedButton(surface, { position: MasterLayout.transport(2, 6) }),
                down: new LedButton(surface, { position: MasterLayout.transport(1, 7.5) }),
            }
        },
        automation: {
            read: new LedButton(surface, { position: MasterLayout.grid(0, 4) }),
            write: new LedButton(surface, { position: MasterLayout.grid(1, 4) }),
            sends: new LedButton(surface, { position: MasterLayout.grid(2, 4) }),
            project: new LedButton(surface, { position: MasterLayout.grid(3, 4) }),
            mixer: new LedButton(surface, { position: MasterLayout.grid(4, 4) }),
            motor: new LedButton(surface), 
        },
        modify: {
            undo: new LedButton(surface, { position: MasterLayout.grid(2, 5) }),
            redo: new LedButton(surface, { position: MasterLayout.grid(3, 5) }),
            save: new LedButton(surface, { position: MasterLayout.grid(2, 6) }),
            revert: new LedButton(surface, { position: MasterLayout.grid(3, 6) }),
        },
        utility: {
            instrument: new LedButton(surface, { position: MasterLayout.grid(4, 5) }),
            main: new LedButton(surface, { position: MasterLayout.grid(5, 5) }),
            soloDefeat: new LedButton(surface, { position: MasterLayout.grid(4, 6) }),
            shift: new LedButton(surface, { position: MasterLayout.grid(5, 6) }),
        },
        edit: new LedButton(surface, { position: MasterLayout.grid(5, 0) }),
        transport: {
            markers: {
                previous: new LedButton(surface, { position: MasterLayout.grid(3, 0, 1, 0.5) }),
                add: new LedButton(surface, { position: MasterLayout.exact(3, 0.7, 1, 0.5) }),
                next: new LedButton(surface, { position: MasterLayout.grid(4, 0) }),
            },
            left: new LedButton(surface, { position: MasterLayout.grid(4, 7) }),
            right: new LedButton(surface, { position: MasterLayout.grid(5, 7) }),
            rewind: new LedButton(surface, { position: MasterLayout.transport(0, 0) }),
            forward: new LedButton(surface, { position: MasterLayout.transport(1, 0) }),
            cycle: new LedButton(surface, { position: MasterLayout.transport(2, 0) }),
            stop: new LedButton(surface, { position: MasterLayout.transport(3, 0) }),
            play: new LedButton(surface, { position: MasterLayout.transport(4, 0) }),
            record: new LedButton(surface, { position: MasterLayout.transport(5, 0) }),
            punch: new LedButton(surface),
        },
        scrub: new LedButton(surface, { position: MasterLayout.transport(2.5, 2) }),
        flip: new LedButton(surface) 
      }
    };
    this.controlSectionElements = this.applyControlSectionElementDefaults(surface, partialElements);

    // 5. RESTORED LAYER 2 FUNCTION KEYS
    this.customElements = {
        functionLayer2: createElements(8, (i) => {
            const row = Math.floor(i / 4); 
            const col = (i % 4) + 2;
            const yOffset = MasterLayout.dy * (row + 1) + (MasterLayout.bh * 0.5);       
            return new LedButton(surface, { position: MasterLayout.exact(col, yOffset, 1, 0.5) });
        })
    };
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