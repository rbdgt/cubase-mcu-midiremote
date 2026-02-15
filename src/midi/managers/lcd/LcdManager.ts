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
    const isFlipped = this.globalState.areDisplayRowsFlipped.get(context);
    const row = isFlipped ? 1 : 0; // Top row, unless flipped
    
    // Ensure safe strings and leave room (max 45 chars for the track name)
    const safeLeft = (leftText || "").substring(0, 45); 
    const safeRight = (rightText || "");

    // Calculate how many spaces are needed to push the rightText to the far right edge
    const spacesCount = Math.max(0, 56 - safeLeft.length - safeRight.length);
    const bannerText = safeLeft + " ".repeat(spacesCount) + safeRight;

    // Send the absolute 56-character string starting at the very left edge (index 0 or 56)
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
  while (safeText.length < 7) safeText += " ";

  if (isMainDevice && isSecondaryDisplayRow) {
    // Keep your working Secondary Display logic
    const raw5Chars = safeText.substring(1, 6);
    const startIndex = (row * 56) + ((channelIndex % 8) * 6) + 2;
    this.sendText(context, startIndex, raw5Chars + " ", true);
  } else {
    // PRIMARY DISPLAY LOGIC
    // Base index for Mackie 7-char blocks
    let startIndex = row * 56 + (channelIndex % 8) * 7 ;

    const isFlipped = this.globalState.areDisplayRowsFlipped.get(context);
    
    /**
      * We want the +1 offset to follow the "Track Names".
      * In Normal mode (isFlipped = false): Track Names are Row 0.
      * In Flipped mode (isFlipped = true): Track Names are Row 1.
      */
    const isParamRow = isFlipped ? (row === 1) : (row === 0);

    if (isParamRow) {
      startIndex += 0;
    } else{
      startIndex += 1;
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