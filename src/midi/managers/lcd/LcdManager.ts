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