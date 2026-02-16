// @ts-expect-error No type defs available
import abbreviate from "abbreviate";
import { EncoderParameterNameBuilder } from ".";
import { LcdManager } from "./LcdManager";
import { deviceConfig } from "/config";
import { GlobalState } from "/state";
import { ContextVariable, TimerUtils } from "/util";

const enum LocalValueDisplayMode {
  Disabled,
  EncoderValue,
  PushValue,
}

/**
 * Handles the LCD display text of a single channel
 */
export class ChannelTextManager {
  private readonly channelWidth: number;
  private channelName = new ContextVariable("");
  private rawChannelName = new ContextVariable("");
  private static readonly defaultParameterNameBuilder: EncoderParameterNameBuilder = (title1, title2) => title2;
  private static nextManagerId = 0;

  // REMOVED "static" from all these helpers so they can use "this.channelWidth"
  private stripNonAsciiCharacters(input: string) {
    return input.replace(/[^\x00-\x7F]/g, "");
  }

  private centerString(input: any) {
    const safeInput = (input === undefined || input === null) ? "" : String(input);
    const trimmed = safeInput.trim();

    // Use this.channelWidth instead of hardcoded numbers
    const word = trimmed.substring(0, this.channelWidth); 
    const totalPadding = this.channelWidth - word.length;
    const leadingSpacesCount = Math.floor(totalPadding / 2);
    const trailingSpacesCount = totalPadding - leadingSpacesCount;

    let result = "";
    for (let i = 0; i < leadingSpacesCount; i++) result += " ";
    result += word;
    for (let i = 0; i < trailingSpacesCount; i++) result += " ";

    return result;
  }

  private abbreviateString(input: string) {
    if (input.length <= this.channelWidth) {
      return input;
    }
    return abbreviate(input, { length: this.channelWidth });
  }

  private translateParameterName(parameterName: string) {
    return (
      {
        "Pan Left-Right": "Pan",
        "Pré/Post": "PrePost",
      }[parameterName] ?? parameterName
    );
  }

  private translateParameterValue(parameterValue: string) {
    return (
      {
        Éteint: "Eteint",
        オン: "On",
        オフ: "Off",
        "Вкл.": "On",
        "Выкл.": "Off",
        开: "On",
        关: "Off",
      }[parameterValue] ?? parameterValue
    );
  }

  private uniqueManagerId = ChannelTextManager.nextManagerId++;
  private timeoutId = `updateDisplay${this.uniqueManagerId}`;
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
    channelWidth: number = 5 // Default to 5 characters for normal channels
  ) {
    this.channelWidth = channelWidth;
    globalState.isValueDisplayModeActive.addOnChangeCallback(
      this.updateNameValueDisplay.bind(this),
    );
    globalState.areDisplayRowsFlipped.addOnChangeCallback(this.updateNameValueDisplay.bind(this));
    globalState.areDisplayRowsFlipped.addOnChangeCallback(this.updateTrackTitleDisplay.bind(this));
    globalState.selectedTrackName.addOnChangeCallback(this.onSelectedTrackChange.bind(this));

    if (deviceConfig.hasSecondaryScribbleStrips) {
      globalState.isShiftModeActive.addOnChangeCallback(
        this.updateIsFaderParameterDisplayed.bind(this),
      );
    }

    if (DEVICE_NAME === "MCU Pro") {
      // Handle metering mode changes
      globalState.isGlobalLcdMeterModeVertical.addOnChangeCallback(
        (context, isMeterModeVertical) => {
          // Update the upper display row before leaving vertical metering mode
          if (!isMeterModeVertical) {
            (globalState.areDisplayRowsFlipped.get(context)
              ? this.updateTrackTitleDisplay.bind(this)
              : this.updateNameValueDisplay.bind(this))(context);
          }
        },
      );

      globalState.areChannelMetersEnabled.addOnChangeCallback((context, areMetersEnabled) => {
        // Update the lower display row after disabling channel meters
        if (!areMetersEnabled) {
          (globalState.areDisplayRowsFlipped.get(context)
            ? this.updateNameValueDisplay.bind(this)
            : this.updateTrackTitleDisplay.bind(this))(context);
        }
      });
    }
  }

  private enableLocalValueDisplayMode(
    context: MR_ActiveDevice,
    mode: LocalValueDisplayMode.EncoderValue | LocalValueDisplayMode.PushValue,
  ) {
    this.localValueDisplayMode.set(context, mode);
    this.updateNameValueDisplay(context);

    this.timerUtils.setTimeout(
      context,
      this.timeoutId,
      this.disableLocalValueDisplayMode.bind(this),
      1,
    );
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
    if (false) {
        return;
    }
    var localValueDisplayMode = this.localValueDisplayMode.get(context);
    this.sendText(context, row, localValueDisplayMode === 2 /* PushValue */  
      ? this.pushParameterValue.get(context) : localValueDisplayMode === 1 /* EncoderValue */  
      || this.globalState.isValueDisplayModeActive.get(context) ? this.parameterValue.get(context) 
      : this.parameterName.get(context));
  }

  public updateTrackTitleDisplay(context: MR_ActiveDevice) {
    const row = 1 - +this.globalState.areDisplayRowsFlipped.get(context);

    // Skip updating the lower display row on MCU Pro when horizontal metering mode is enabled
    if (
      DEVICE_NAME === "MCU Pro" &&
      row === 1 &&
      this.globalState.areChannelMetersEnabled.get(context) &&
      !this.globalState.isGlobalLcdMeterModeVertical.get(context)
    ) {
      return;
    }

    // --- UPDATED LOGIC ---
    // If we are in Pan/Track mode, draw the 7-character individual track name block.
    // If we are in EQ/Plugin mode, do NOTHING to the top row. The LcdManager handles the 56-char banner!
    if (this.isParameterChannelRelated) {
      this.sendText(context, row, this.channelName.get(context));
    }

    // Secondary displays always show the individual channel names
    this.updateSecondaryTrackTitleDisplay(context);
  }

  /**
   * Updates the track title displayed on the first row of the channel's secondary display, if the
   * device has secondary displays.
   */
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
    const previousValue = this.isFaderParameterDisplayed.get(context);
    const newValue =
      this.isFaderTouched.get(context) && !this.globalState.isShiftModeActive.get(context);

    if (newValue !== previousValue) {
      this.isFaderParameterDisplayed.set(context, newValue);
      this.updateSecondaryTrackTitleDisplay(context);
      this.updateSupplementaryInfo(context);
    }
  }

  /**
   * Updates the string displayed on the second row of the channel's secondary display, if the
   * device has secondary displays.
   */
  private updateSupplementaryInfo(context: MR_ActiveDevice) {
    if (deviceConfig.hasSecondaryScribbleStrips) {
      const textToShow = this.isFaderParameterDisplayed.get(context)
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
    // Luckily, `onParameterTitleChange` runs after `onParameterDisplayValueChange`, so disabling
    // `localValueDisplayMode` here overwrites the `EncoderValue` mode that
    // `onParameterDisplayValueChange` sets
    this.localValueDisplayMode.set(context, LocalValueDisplayMode.Disabled);

    this.parameterName.set(
      context,
      this.centerString(
        this.abbreviateString(
          this.stripNonAsciiCharacters(
            this.parameterNameBuilder(title1, this.translateParameterName(title2)),
          ),
        ),
      ),
    );

    this.updateNameValueDisplay(context);
  }

  onParameterDisplayValueChange(context: MR_ActiveDevice, value: string) {
    const now = performance.now();
    this.lastParameterValueChangeTime = now;

    this.parameterValue.set(
      context,
      this.centerString(
        this.abbreviateString(
          this.stripNonAsciiCharacters(
            this.translateParameterValue(value),
          ),
        ),
      ),
    );

    if (this.globalState.isValueDisplayModeActive.get(context)) {
      this.updateNameValueDisplay(context);
    } else if (now > this.lastParameterChangeTime + 100) {
      this.enableLocalValueDisplayMode(context, LocalValueDisplayMode.EncoderValue);
    }
  }

  onPushParameterDisplayValueChange(context: MR_ActiveDevice, value: string) {
    const lastValue = this.pushParameterValueRaw.get(context);
    this.pushParameterValueRaw.set(context, value);
    const now = performance.now();

    // Avoid reacting to display value changes when they are caused by switching to or from an
    // undefined host value or by switching encoder assignments or tracks (i.e. if this callback
    // runs up to 100 ms after these values were changed).
    if (
      value !== "" &&
      lastValue !== "" &&
      now > this.lastParameterValueChangeTime + 100 &&
      now > this.lastParameterChangeTime + 100
    ) {
      // The only way push parameter values are ever displayed is by calling
      // `enableLocalValueDisplayMode` below. Hence, we only update `this.pushParameterValue` inside
      // the if block.
      this.pushParameterValue.set(
        context,
        this.centerString(
          this.abbreviateString(
            this.pushParameterValuePrefix +
            this.stripNonAsciiCharacters(
              this.translateParameterValue(value),
            ),
          ),
        ),
      );

      this.enableLocalValueDisplayMode(context, LocalValueDisplayMode.PushValue);
    }
  }

  onChannelNameChange(context: MR_ActiveDevice, name: string) {
    if (this.isParameterChannelRelated) {
      this.onParameterChange(context);
    }
// If name is empty, ensure we treat it as a string of spaces
    var processedName = (name === "" || name == null) ? "       " : name;
    this.rawChannelName.set(context, name || "");
    
    if (this.channelName.get(context) === processedName) return;

    var strippedName = this.abbreviateString(
        this.stripNonAsciiCharacters(processedName)
    );

    this.channelName.set(context, strippedName);
    this.updateTrackTitleDisplay(context);
  }

  onSelectedTrackChange(context: MR_ActiveDevice) {
    if (!this.isParameterChannelRelated) {
      this.onParameterChange(context);

      //this.updateTrackTitleDisplay(context);
    }
  }

  /** This callback is not called externally, but only from within this class */
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
    const translated = this.translateParameterName(name);
    const lowerName = translated.toLowerCase();

    // Force "Vol" if name is empty, "volume", or "stereo" (typical for Master)
    let shortName = "Vol";
    if (name !== "" && lowerName.indexOf("volume") === -1 && lowerName.indexOf("stereo") === -1) {
      shortName = translated.substring(0, 3);
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
