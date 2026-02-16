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
    // 1. Create Channel Elements (Faders, Encoders, Buttons for 8 strips)
    const channelElements = createElements(8, (index) => {
      const currentX = surfaceXPosition + index * channelWidth;
      const encoder = new LedPushEncoder(surface, 3.1 + currentX, 8.8, 3.6, 3.6); 
      
      // Make label fields to allow Cubase to show parameter names in the UI
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

    // Expand surface width significantly to fit the large control section
    const mainSurfaceWidth = channelElementsWidth + 24; 
    
    // 2. Initialize Parent Device
    super(driver, firstChannelIndex, { width: mainSurfaceWidth, channelElements }, globalState, timerUtils, false, portIndex);

    // 3. Setup Master Section Text logic
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

    // ----------------------------------------------------------------------
    // 4. CONTROL SECTION LAYOUT (Mapped exactly to the QCon Pro X image)
    // ----------------------------------------------------------------------
    
    // The Master Fader sits right next to the channel faders
    const masterX = surfaceXPosition + channelElementsWidth - 0.5;

    // Button Matrix Origin and Spacing
    const cx = masterX + 4; // Start X for the matrix
    const cy = 5;           // Start Y for the matrix
    const dx = 2.4;         // Column spacing
    const dy = 2.2;         // Row spacing
    const bw = 1.8;         // Standard Button Width
    const bh = 1.4;         // Standard Button Height

    // Transport Row Origin
    const transY = cy + dy * 10.5;

    // Draw aesthetic blind panels to mimic the hardware chassis zones
    surface.makeBlindPanel(cx - 0.5, cy - 0.8, dx * 6.5, dy * 9.8); // Main Matrix panel
    surface.makeBlindPanel(cx - 0.5, transY - 0.8, dx * 6.5, bh * 2); // Transport panel

    surface.makeBlindPanel(cx + dx * 1, cy + dy * 0, bw, bh); // Name/Value mockup
    surface.makeBlindPanel(cx + dx * 5, cy + dy * 4, bw, bh); // Motor mockup
    surface.makeBlindPanel(cx + dx * 1, cy + dy * 1.5, bw, bh); // LAYER 2 mockup



    const partialElements = {
      mainFader: new TouchSensitiveMotorFader(surface, masterX, 24.4, 1.8, 12),
      mainVuMeters: {
        left: surface.makeCustomValueVariable("Main VU Meter L"), 
        right: surface.makeCustomValueVariable("Main VU Meter R"), 
      },
      jogWheel: new JogWheel(surface, cx + dx * 3, transY + 3, 8, 8), 

      buttons: {
        // ROW 1: Display Mode / DAW Mode
        display: new LedButton(surface),        // Name/Value HIDDEN
        timeMode: new LedButton(surface, { position: [cx + dx * 2, cy, bw, bh] }),       // SMPTE/Beats

        // ROW 2 & 3: Functions (F1-F8 / F9-F16) - Half height to fit the design and leave room for the secondary layer
        function: createElements(8, (i) => {
            const row = Math.floor(i / 4); // 0 or 1
            const col = (i % 4) + 2;       // 2, 3, 4, 5
            // CHANGE: Multiply bh by 0.45 to make them half-height
            return new LedButton(surface, { position: [cx + dx * col, cy + dy * (row + 1), bw, bh * 0.5] });
        }),

        // ROW 4: Effects / Routing / Page Left
        encoderAssign: {
            track: new LedButton(surface, { position: [cx, cy + dy * 3, bw, bh] }), // Track
            send: new LedButton(surface, { position: [cx + dx * 1, cy + dy * 3, bw, bh] }), // FX-Send
            pan: new LedButton(surface, { position: [cx + dx * 2, cy + dy * 3, bw, bh] }), // Pan
            plugin: new LedButton(surface, { position: [cx + dx * 3, cy + dy * 3, bw, bh] }), // Ins
            eq: new LedButton(surface, { position: [cx + dx * 4, cy + dy * 3, bw, bh] }), // EQ            
            instrument: new LedButton(surface, { position: [cx + dx * 5, cy + dy * 3, bw, bh] }), // VSTi
        },
        navigation: {
            bank: {
                left: new LedButton(surface, { position: [cx + dx * 2, cy + dy * 8, bw, bh] }), // <<
                right: new LedButton(surface, { position: [cx + dx * 3, cy + dy * 8, bw, bh] }) // >>
            },
            channel: {
                left: new LedButton(surface, { position: [cx + dx * 4, cy + dy * 8, bw, bh] }), // Left
                right: new LedButton(surface, { position: [cx + dx * 5, cy + dy * 8, bw, bh] }), // Right
            },
            directions: {
                up: new LedButton(surface, { position: [cx + dx * 1, transY + 4.5, bw, bh] }),
                left: new LedButton(surface, { position: [cx, transY + 6, bw, bh] }),
                center: new LedButton(surface, { position: [cx + dx * 1, transY + 6, bw, bh] }), // Zoom
                right: new LedButton(surface, { position: [cx + dx * 2, transY + 6, bw, bh] }),
                down: new LedButton(surface, { position: [cx + dx * 1, transY + 7.5, bw, bh] }),
            }
        },

        // ROW 5: Automation & State
        automation: {
            read: new LedButton(surface, { position: [cx, cy + dy * 4, bw, bh] }), // Read
            write: new LedButton(surface, { position: [cx + dx * 1, cy + dy * 4, bw, bh] }), // Write
            sends: new LedButton(surface, { position: [cx + dx * 2, cy + dy * 4, bw, bh] }),
            project: new LedButton(surface, { position: [cx + dx * 3, cy + dy * 4, bw, bh] }),
            mixer: new LedButton(surface, { position: [cx + dx * 4, cy + dy * 4, bw, bh] }), // Mixer
            motor: new LedButton(surface), // Motor HIDDEN
        },
        
        modify: {
            // ROW 6: Edit Functions
            undo: new LedButton(surface, { position: [cx + dx * 2, cy + dy * 5, bw, bh] }),   // Undo
            redo: new LedButton(surface, { position: [cx + dx * 3, cy + dy * 5, bw, bh] }),   // Redo
            // ROW 7: Save / Revert
            save: new LedButton(surface, { position: [cx + dx * 2, cy + dy * 6, bw, bh] }),   // Save
            revert: new LedButton(surface, { position: [cx + dx * 3, cy + dy * 6, bw, bh] }), // Revert
        },

        utility: {
            // "instrument" and "main" map by default in `control.ts` to MixConsole Undo and Redo
            instrument: new LedButton(surface, { position: [cx + dx * 4, cy + dy * 5, bw, bh] }), // Mix Undo
            main: new LedButton(surface, { position: [cx + dx * 5, cy + dy * 5, bw, bh] }),       // Mix Redo
            
            soloDefeat: new LedButton(surface, { position: [cx + dx * 4, cy + dy * 6, bw, bh] }),
            shift: new LedButton(surface, { position: [cx + dx * 5, cy + dy * 6, bw, bh] }),      // Shift
        },

        edit: new LedButton(surface, { position: [cx + dx * 5, cy, bw, bh] }),       // Edit
        
        transport: {
            // Markers correctly nested INSIDE transport!
            markers: {
                previous: new LedButton(surface, { position: [cx + dx * 3, cy, bw, bh*0.5] }),    // Previous
                add: new LedButton(surface, { position: [cx + dx * 3, cy + bh*0.5, bw, bh*0.5] }),// Add
                next: new LedButton(surface, { position: [cx + dx * 4, cy, bw, bh] }),// Next
            },
            
            // TRANSPORT BAR
            rewind: new LedButton(surface, { position: [cx, transY, bw, bh] }),
            forward: new LedButton(surface, { position: [cx + dx * 1, transY, bw, bh] }),
            cycle: new LedButton(surface, { position: [cx + dx * 2, transY, bw, bh] }),
            stop: new LedButton(surface, { position: [cx + dx * 3, transY, bw, bh] }),
            play: new LedButton(surface, { position: [cx + dx * 4, transY, bw, bh] }),
            record: new LedButton(surface, { position: [cx + dx * 5, transY, bw, bh] }),
            
            // Fallbacks for buttons the Pro X hardware is missing physically
            punch: new LedButton(surface),
            left: new LedButton(surface), 
            right: new LedButton(surface) 
        },

        // SCRUB
        scrub: new LedButton(surface, { position: [cx + dx * 2.5, transY + 2, bw, bh] }),
        flip: new LedButton(surface) // Usually Flip is Shift + something on QCon, so we proxy it.
      }
    };

    this.controlSectionElements = this.applyControlSectionElementDefaults(surface, partialElements);

    // Register the custom Layer 2 UI elements and the invisible MIDI proxies
    this.customElements = {
        // F-KEYS LAYER 2 (Bottom Half)
        functionLayer2: createElements(8, (i) => {
            const row = Math.floor(i / 4); 
            const col = (i % 4) + 2;           
            // Shifted down slightly to fill the bottom 45% of the space
            return new LedButton(surface, { position: [cx + dx * col, cy + dy * (row + 1) + (bh * 0.5), bw, bh * 0.5] });
        }),
        // Invisible listeners to intercept the hardware press
        functionProxies: createElements(8, (i) => surface.makeCustomValueVariable(`FKeyProxy_${i}`))
    } as any;
  }

  private applyControlSectionElementDefaults(
    surface: MR_DeviceSurface,
    elements: any,
  ): ControlSectionSurfaceElements {
    const makeButton = () => new LedButton(surface);
    const defaultsFactory: ControlSectionSurfaceElementsDefaultsFactory = {
      buttons: {
        display: makeButton, timeMode: makeButton, edit: makeButton, flip: makeButton, scrub: makeButton,
        encoderAssign: { track: makeButton, pan: makeButton, eq: makeButton, send: makeButton, plugin: makeButton, instrument: makeButton },
        number: () => createElements(8, () => new LedButton(surface)),
        function: () => createElements(8, () => new LedButton(surface)),
        modify: { undo: makeButton, redo: makeButton, save: makeButton, revert: makeButton },
        automation: { read: makeButton, write: makeButton, sends: makeButton, project: makeButton, mixer: makeButton, motor: makeButton },
        utility: { instrument: makeButton, main: makeButton, soloDefeat: makeButton, shift: makeButton },
        // NOTE: Punch is restored here to prevent the undefined crash!
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