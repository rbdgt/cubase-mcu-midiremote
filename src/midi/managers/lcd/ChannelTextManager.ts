// @ts-expect-error No type defs available
import abbreviate from "abbreviate";
import { EncoderParameterNameBuilder } from ".";
import { deviceConfig } from "/config";
import { GlobalState } from "/state";
import { ContextVariable, TimerUtils } from "/util";

const enum LocalValueDisplayMode {
  Disabled,
  EncoderValue,
  PushValue,
}

/**
 * Handles the LCD display text of a single channel for the iCON QCon Pro X.
 * Optimized for ES5 and specific hardware readability.
 */
export class ChannelTextManager {
  private readonly channelWidth: number;
  private channelName = new ContextVariable("");
  private static readonly defaultParameterNameBuilder: EncoderParameterNameBuilder = (title1, title2) => title2;
  private static nextManagerId = 0;

  /**
   * Standardizes long parameter names to fit the hardware display blocks.
   */
  private formatParameterLabel(parameterName: string) {
    var labels: Record<string, string> = {
      "Pan Left-Right": "Pan",
      "Pré/Post": "PrePost"
    };
    return labels[parameterName] || parameterName;
  }

  private stripNonAsciiCharacters(input: string) {
    return input.replace(/[^\x00-\x7F]/g, "");
  }

  private centerString(input: any) {
    var safeInput = (input === undefined || input === null) ? "" : String(input);
    var trimmed = safeInput.trim();
    var word = trimmed.substring(0, this.channelWidth);
    var totalPadding = this.channelWidth - word.length;
    var leadingSpacesCount = Math.floor(totalPadding / 2);
    var trailingSpacesCount = totalPadding - leadingSpacesCount;

    var result = "";
    for (var i = 0; i < leadingSpacesCount; i++) result += " ";
    result += word;
    for (var i = 0; i < trailingSpacesCount; i++) result += " ";

    return result;
  }

  private abbreviateString(input: string) {
    if (input.length <= this.channelWidth) {
      return input;
    }
    return abbreviate(input, { length: this.channelWidth });
  }

  private uniqueManagerId = ChannelTextManager.nextManagerId++;
  private timeoutId = "updateDisplay" + this.uniqueManagerId;
  private parameterName = new ContextVariable("");
  private parameterNameBuilder = ChannelTextManager.defaultParameterNameBuilder;
  private parameterValue = new ContextVariable("");
  private lastParameterValueChangeTime = 0;
  private lastParameterChangeTime = 0;
  private pushParameterValue = new ContextVariable("");
  private pushParameterValueRaw = new ContextVariable("");
  private pushParameterValuePrefix = "";
  private localValueDisplayMode = new ContextVariable(LocalValueDisplayMode.Disabled);
  private meterPeakLevel = new ContextVariable("");
  private faderParameterValue = new ContextVariable("");
  private faderParameterName = new ContextVariable("");
  private isFaderTouched = new ContextVariable(false);
  private isFaderParameterDisplayed = new ContextVariable(false);
  public isParameterChannelRelated = true;

  constructor(
    private globalState: GlobalState,
    private timerUtils: TimerUtils,
    private sendText: (context: MR_ActiveDevice, row: number, text: string) => void,
    channelWidth: number = 5
  ) {
    this.channelWidth = channelWidth;

    globalState.isValueDisplayModeActive.addOnChangeCallback(this.updateNameValueDisplay.bind(this));
    globalState.areDisplayRowsFlipped.addOnChangeCallback(this.updateNameValueDisplay.bind(this));
    globalState.areDisplayRowsFlipped.addOnChangeCallback(this.updateTrackTitleDisplay.bind(this));
    globalState.selectedTrackName.addOnChangeCallback(this.onSelectedTrackChange.bind(this));

    if (deviceConfig.hasSecondaryScribbleStrips) {
      globalState.isShiftModeActive.addOnChangeCallback(this.updateIsFaderParameterDisplayed.bind(this));
    }
  }

  public refresh(context: MR_ActiveDevice) {
    this.updateNameValueDisplay(context); 
    this.updateSecondaryTrackTitleDisplay(context); 
    this.updateSupplementaryInfo(context); 
  }

  public forceMeterPeakUpdate(context: MR_ActiveDevice, value: string) {
    this.meterPeakLevel.set(context, value); 
    if (!this.isFaderParameterDisplayed.get(context)) { 
        this.updateSupplementaryInfo(context); 
    }
}

  private enableLocalValueDisplayMode(
    context: MR_ActiveDevice,
    mode: LocalValueDisplayMode.EncoderValue | LocalValueDisplayMode.PushValue,
  ) {
    this.localValueDisplayMode.set(context, mode);
    this.updateNameValueDisplay(context);

    this.timerUtils.setTimeout(context, this.timeoutId, this.disableLocalValueDisplayMode.bind(this), 1);
  }

  private disableLocalValueDisplayMode(context: MR_ActiveDevice) {
    if (this.localValueDisplayMode.get(context) !== LocalValueDisplayMode.Disabled) {
      this.localValueDisplayMode.set(context, LocalValueDisplayMode.Disabled);
      this.timerUtils.clearTimeout(this.timeoutId);
      this.updateNameValueDisplay(context);
    }
  }

  private updateNameValueDisplay(context: MR_ActiveDevice) {
    var row = +this.globalState.areDisplayRowsFlipped.get(context);
    var localMode = this.localValueDisplayMode.get(context);

    var text = localMode === LocalValueDisplayMode.PushValue 
      ? this.pushParameterValue.get(context) 
      : (localMode === LocalValueDisplayMode.EncoderValue || this.globalState.isValueDisplayModeActive.get(context))
        ? this.parameterValue.get(context) 
        : this.parameterName.get(context);

    this.sendText(context, row, text);
  }

  public updateTrackTitleDisplay(context: MR_ActiveDevice) {
    var row = 1 - +this.globalState.areDisplayRowsFlipped.get(context);

    if (this.isParameterChannelRelated) {
      this.sendText(context, row, this.channelName.get(context));
    }

    this.updateSecondaryTrackTitleDisplay(context);
  }

  private updateSecondaryTrackTitleDisplay(context: MR_ActiveDevice) {
    if (deviceConfig.hasSecondaryScribbleStrips) {
      this.sendText(
        context,
        2,
        this.centerString(
          this.isFaderParameterDisplayed.get(context)
            ? this.faderParameterName.get(context)
            : this.channelName.get(context),
        ),
      );
    }
  }

  private updateIsFaderParameterDisplayed(context: MR_ActiveDevice) {
    var newValue = this.isFaderTouched.get(context) && !this.globalState.isShiftModeActive.get(context);
    if (newValue !== this.isFaderParameterDisplayed.get(context)) {
      this.isFaderParameterDisplayed.set(context, newValue);
      this.updateSecondaryTrackTitleDisplay(context);
      this.updateSupplementaryInfo(context);
    }
  }

  private updateSupplementaryInfo(context: MR_ActiveDevice) {
    if (deviceConfig.hasSecondaryScribbleStrips) {
      var textToShow = this.isFaderParameterDisplayed.get(context)
        ? this.faderParameterValue.get(context)
        : this.meterPeakLevel.get(context);

      this.sendText(context, 3, this.centerString(textToShow));
    }
  }

  setParameterNameBuilder(builder?: EncoderParameterNameBuilder) {
    this.parameterNameBuilder = builder ?? ChannelTextManager.defaultParameterNameBuilder;
  }

  setPushParameterValuePrefix(prefix: string = "") {
    this.pushParameterValuePrefix = prefix;
  }

  onParameterTitleChange(context: MR_ActiveDevice, title1: string, title2: string) {
    this.localValueDisplayMode.set(context, LocalValueDisplayMode.Disabled);
    this.parameterName.set(
      context,
      this.centerString(
        this.abbreviateString(
          this.stripNonAsciiCharacters(
            this.parameterNameBuilder(title1, this.formatParameterLabel(title2))
          )
        )
      )
    );
    this.updateNameValueDisplay(context);
  }

  onParameterDisplayValueChange(context: MR_ActiveDevice, value: string) {
    var now = performance.now();
    this.lastParameterValueChangeTime = now;
    this.parameterValue.set(context, this.centerString(this.abbreviateString(this.stripNonAsciiCharacters(value))));

    if (this.globalState.isValueDisplayModeActive.get(context)) {
      this.updateNameValueDisplay(context);
    } else if (now > this.lastParameterChangeTime + 100) {
      this.enableLocalValueDisplayMode(context, LocalValueDisplayMode.EncoderValue);
    }
  }

  onPushParameterDisplayValueChange(context: MR_ActiveDevice, value: string) {
    var lastValue = this.pushParameterValueRaw.get(context);
    this.pushParameterValueRaw.set(context, value);
    var now = performance.now();

    if (value !== "" && lastValue !== "" && now > this.lastParameterValueChangeTime + 100 && now > this.lastParameterChangeTime + 100) {
      this.pushParameterValue.set(
        context,
        this.centerString(this.abbreviateString(this.pushParameterValuePrefix + this.stripNonAsciiCharacters(value))),
      );
      this.enableLocalValueDisplayMode(context, LocalValueDisplayMode.PushValue);
    }
  }

  onChannelNameChange(context: MR_ActiveDevice, name: string) {
    if (this.isParameterChannelRelated) {
      this.onParameterChange(context);
    }

    var processedName = (name === "" || name == null) ? "       " : name;
    if (this.channelName.get(context) === processedName) return;

    this.channelName.set(context, this.abbreviateString(this.stripNonAsciiCharacters(processedName)));
    this.updateTrackTitleDisplay(context);
  }

  onSelectedTrackChange(context: MR_ActiveDevice) {
    if (!this.isParameterChannelRelated) {
      this.onParameterChange(context);
    }
  }

  onParameterChange(context: MR_ActiveDevice) {
    this.lastParameterChangeTime = performance.now();
    this.disableLocalValueDisplayMode(context);
  }

  onMeterPeakLevelChange(context: MR_ActiveDevice, level: string) {
    this.meterPeakLevel.set(context, level);
    if (!this.isFaderParameterDisplayed.get(context)) {
      this.updateSupplementaryInfo(context);
    }
  }

  onFaderParameterValueChange(context: MR_ActiveDevice, value: string) {
    this.faderParameterValue.set(context, this.stripNonAsciiCharacters(value));
    if (this.isFaderParameterDisplayed.get(context)) {
      this.updateSupplementaryInfo(context);
    }
  }

  onFaderParameterNameChange(context: MR_ActiveDevice, name: string) {
    var cleanName = this.stripNonAsciiCharacters(this.formatParameterLabel(name));
    var lowerName = cleanName.toLowerCase();

    // Use "Vol" as a standard fallback for volume parameters 
    var shortName = "Vol";
    if (name !== "" && lowerName.indexOf("volume") === -1 && lowerName.indexOf("stereo") === -1) {
      shortName = cleanName.substring(0, 3);
    }

    this.faderParameterName.set(context, shortName);

    if (this.isFaderParameterDisplayed.get(context)) {
      this.updateSecondaryTrackTitleDisplay(context);
    }
  }

  onFaderTouchedChange(context: MR_ActiveDevice, isFaderTouched: boolean) {
    this.isFaderTouched.set(context, isFaderTouched);
    this.updateIsFaderParameterDisplayed(context);
  }
}