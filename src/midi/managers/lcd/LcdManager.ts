import { start } from "repl";
import { ChannelTextManager } from "./ChannelTextManager";
import { deviceConfig } from "/config";
import { Device } from "/devices";
import { GlobalState } from "/state";
import { TimerUtils, createElements } from "/util";

export class LcdManager {
  private static asciiStringToCharArray(input: string) {
    var chars = [];
    for (var i = 0; i < input.length; i++) {
      chars.push(input.charCodeAt(i));
    }
    return chars;
  }

  static makeSpaces(length: number) {
    var s = "";
    while (s.length < length) { s += " "; }
    return s;
  }

  channelTextManagers: ChannelTextManager[];

  constructor(private device: Device, private globalState: GlobalState, timerUtils: TimerUtils) {
    this.channelTextManagers = createElements(8, (channelIndex) => 
      new ChannelTextManager(globalState, timerUtils, this.sendChannelText.bind(this, channelIndex))
    );

    // --- NEW LOGIC: Listen for Track changes ---
    globalState.selectedTrackName.addOnChangeCallback((context, trackName) => {
      // Only draw the banner if we are in a single-track mode (EQ, Plugin, etc.)
      if (!this.channelTextManagers[0].isParameterChannelRelated) {
        const pageName = globalState.activeEncoderPageName.get(context);
        this.drawGlobalBanner(context, trackName, pageName);
      }
    });

    // --- NEW LOGIC: Listen for Page changes ---
    globalState.activeEncoderPageName.addOnChangeCallback((context, pageName) => {
      if (!this.channelTextManagers[0].isParameterChannelRelated) {
        const trackName = globalState.selectedTrackName.get(context);
        this.drawGlobalBanner(context, trackName, pageName);
      }
    });
  }

  // --- NEW METHOD: Draws the 56-character banner ---
  public drawGlobalBanner(context: MR_ActiveDevice, leftText: string, rightText: string) {
    // 1. THE FIX: Use the exact same row calculation as the Track Titles
    const row = 1 - +this.globalState.areDisplayRowsFlipped.get(context); 

    // 2. MAIN & EXTENDER BANNER: 
    // Leave room for a leading space, so 55 usable characters total
    const safeLeft = (leftText || "").substring(0, 40); 
    const safeRight = (rightText || "");

    // Calculate spaces to push rightText to the edge
    const spacesCount = Math.max(0, 56 - safeLeft.length - safeRight.length);

    // We add a " " (space) at the very beginning. 
    // This matches the `startIndex += 1` offset your QCon uses for the 7-char blocks, 
    // ensuring no leftover characters get "stuck" when switching back to Pan mode!
    const bannerText = safeLeft + " ".repeat(spacesCount) + safeRight;

    // Because this method runs for EACH device independently, 
    // this will now seamlessly broadcast the banner to both the Main unit and the Extender!
    this.sendText(context, row * 56, bannerText.substring(0, 56), false); 
  }

  public sendText(context: MR_ActiveDevice, startIndex: number, text: string, targetSecondaryDisplay = false) {
    var chars = LcdManager.asciiStringToCharArray(text.slice(0, 112));
    if (targetSecondaryDisplay) {
      this.device.ports.output.sendMidi(context, [0xf0, 0x00, 0x00, 0x67, 0x15, 0x13, startIndex, ...chars, 0xf7]);
    } else {
      this.device.ports.output.sendSysex(context, [0x12, startIndex, ...chars]);
    }
  }

private sendChannelText(channelIndex: number, context: MR_ActiveDevice, row: number, text: string) {
  let isSecondaryDisplayRow = false;
  if (row > 1) {
    isSecondaryDisplayRow = true;
    row -= 2; // normalizedRow is now 0 or 1
  }
  
  const isMainDevice = !this.device.ports.isExtender;
  let safeText = (text || "       ").toString();

  // Manually pad to 7 characters to avoid the padEnd crash in Cubase's older JS engine
  while (safeText.length < 7) {
    safeText += " ";
  }

  if (isMainDevice && isSecondaryDisplayRow) {
    // SECONDARY DISPLAY LOGIC (Main Unit Only)
    // Grab the first 5 characters starting at index 0 (Fixing the chopped first letter!)
    const raw5Chars = safeText.substring(0, 5);
    
    const startIndex = (row * 56) + ((channelIndex % 8) * 6) + 2;
    
    this.sendText(context, startIndex, raw5Chars + " ", true);
  } else {
    // PRIMARY DISPLAY LOGIC (And Extender Secondary Display)
    let startIndex = row * 56 + (channelIndex % 8) * 7;
    
    // Shift BOTH rows by +1 to pull them off the left bezel and align with the knobs
    startIndex += 1;

    // WIPE FIX: Because both rows now have a +1 offset, wipe index 0 for the far-left channel
    if (channelIndex % 8 === 0) {
      safeText = " " + safeText; 
      startIndex -= 1;           
    }

    this.sendText(context, startIndex, safeText, isSecondaryDisplayRow);
  }
}

  public clearDisplays(context: MR_ActiveDevice) {
    var spaces = LcdManager.makeSpaces(112);
    this.sendText(context, 0, spaces);
    if (deviceConfig.hasSecondaryScribbleStrips) {
      this.sendText(context, 0, spaces, true);
    }
  }
}