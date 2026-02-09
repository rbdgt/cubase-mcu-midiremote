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

  constructor(private device: Device, globalState: GlobalState, timerUtils: TimerUtils) {
    this.channelTextManagers = createElements(8, (channelIndex) => 
      new ChannelTextManager(globalState, timerUtils, this.sendChannelText.bind(this, channelIndex))
    );
  }

  public sendText(context: MR_ActiveDevice, startIndex: number, text: string, targetSecondaryDisplay = false) {
    var chars = LcdManager.asciiStringToCharArray(text.slice(0, 112));
    if (targetSecondaryDisplay) {
      this.device.ports.output.sendMidi(context, [0xf0, 0x00, 0x02, 0x4e, 0x15, 0x13, startIndex, ...chars, 0xf7]);
    } else {
      this.device.ports.output.sendSysex(context, [0x12, startIndex, ...chars]);
    }
  }

  private sendChannelText(
    channelIndex: number,
    context: MR_ActiveDevice,
    row: number,
    text: string,
  ) {
    let isSecondaryDisplayRow = false;
    if (row > 1) {
      isSecondaryDisplayRow = true;
      row -= 2;
    }

    const isMainDevice = !this.device.ports.isExtender;
    
    // ES5 Safe Padding: ensure text is a string and has at least 7 chars
    let safeText = (text || "").toString();
    while (safeText.length < 7) {
      safeText += " ";
    }

    if (isMainDevice && isSecondaryDisplayRow) {
      // The unified 5-character logic: use positions 1 through 5
      const raw5Chars = safeText.substring(1, 6);
      const startIndex = (row * 56) + ((channelIndex % 8) * 6) + 2;
      this.sendText(context, startIndex, raw5Chars + " ", true);
    } else {
      const startIndex = row * 56 + (channelIndex % 8) * 7;
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