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

    // Listen for Track changes
    globalState.selectedTrackName.addOnChangeCallback((context, trackName) => {
      if (!this.channelTextManagers[0].isParameterChannelRelated) {
        const pageName = globalState.activeEncoderPageName.get(context);
        this.drawGlobalBanner(context, trackName, pageName);
      }
    });

    // Listen for Page changes
    globalState.activeEncoderPageName.addOnChangeCallback((context, pageName) => {
      if (!this.channelTextManagers[0].isParameterChannelRelated) {
        const trackName = globalState.selectedTrackName.get(context);
        this.drawGlobalBanner(context, trackName, pageName);
      }
    });

    // Listen for display flips to redraw the banner on the correct row
    globalState.areDisplayRowsFlipped.addOnChangeCallback((context) => {
      if (!this.channelTextManagers[0].isParameterChannelRelated) {
        const trackName = globalState.selectedTrackName.get(context);
        const pageName = globalState.activeEncoderPageName.get(context);
        this.drawGlobalBanner(context, trackName, pageName);
      }
    });
  }

  public drawGlobalBanner(context: MR_ActiveDevice, leftText: string, rightText: string) {
    const row = 1 - +this.globalState.areDisplayRowsFlipped.get(context);
    
    // Use the full 56 characters for the banner
    const safeLeft = (leftText || "").substring(0, 40);
    const safeRight = (rightText || "").substring(0, 16);
    
    const spacesCount = Math.max(0, 56 - safeLeft.length - safeRight.length);
    
    // No prepended space! The banner starts exactly at the edge (index 0 or 56)
    const bannerText = safeLeft + " ".repeat(spacesCount) + safeRight;

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
      row -= 2; 
    }
    
    const isMainDevice = !this.device.ports.isExtender;
    let safeText = (text || "       ").toString();
    
    while (safeText.length < 7) {
      safeText += " ";
    }

    if (isMainDevice && isSecondaryDisplayRow) {
      const raw5Chars = safeText.substring(0, 5);
      const startIndex = (row * 56) + ((channelIndex % 8) * 6) + 2;
      this.sendText(context, startIndex, raw5Chars + " ", true);
    } else {
      let startIndex = row * 56 + (channelIndex % 8) * 7;
      
      // Apply +1 offset to BOTH rows to align text with the faders/encoders
      startIndex += 1;
      
      if (channelIndex % 8 === 0) {
        // Fill the skipped index 0 (or 56) with a space to clear any old characters
        safeText = " " + safeText;
        startIndex -= 1;           
      } else if (channelIndex % 8 === 7) {
        // Prevent the 7th character of the far-right channel from bleeding into 
        // the next row (index 56) or off-screen (index 112).
        safeText = safeText.substring(0, 6);
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