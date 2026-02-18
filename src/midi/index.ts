import { SegmentDisplayManager } from "./managers/SegmentDisplayManager";
import { sendChannelMeterMode, sendGlobalMeterModeOrientation, sendMeterLevel } from "./util";
import { config, deviceConfig } from "/config";
import { MidiOutputPort } from "/decorators/MidiOutputPort";
import { Device, MainDevice } from "/devices";
import { GlobalState } from "/state";
import { ContextVariable, LifecycleCallbacks, makeTimerUtils, TimerUtils } from "/util";

export function bindDevicesToMidi(
  devices: Device[],
  globalState: GlobalState,
  lifecycleCallbacks: LifecycleCallbacks,
  timerUtils: TimerUtils
) {
  const segmentDisplayManager = new SegmentDisplayManager(devices);
  
  lifecycleCallbacks.addDeactivationCallback((context) => {
    segmentDisplayManager.clearAssignment(context);
    segmentDisplayManager.clearTime(context);
  });

  for (const device of devices) {
    bindLifecycleEvents(device, lifecycleCallbacks);
    bindChannelElements(device, globalState, timerUtils, lifecycleCallbacks);
    if (device instanceof MainDevice) {
      bindControlSectionElements(device, globalState, timerUtils, lifecycleCallbacks);
    }
  }

  return { segmentDisplayManager };
}

function bindLifecycleEvents(device: Device, lifecycleCallbacks: LifecycleCallbacks) {
  const output = device.ports.output;
  const resetLeds = (context: MR_ActiveDevice) => {
    for (let note = 0; note < 0x76; note++) {
      output.sendNoteOn(context, note, 0);
    }
  };

  lifecycleCallbacks.addActivationCallback((context) => {
    resetLeds(context);
  });

  lifecycleCallbacks.addDeactivationCallback((context) => {
    // SAFETY CHECK: Ensure lcdManager exists before calling [cite: 1154]
    if (device.lcdManager && typeof device.lcdManager.clearDisplays === 'function') {
      device.lcdManager.clearDisplays(context);
    }

    // Reset faders [cite: 1154]
    for (let faderIndex = 0; faderIndex < 9; faderIndex++) {
      output.sendMidi(context, [0xe0 + faderIndex, 0, 0]);
    }

    resetLeds(context);

    // Reset encoder LED rings [cite: 1154]
    for (let encoderIndex = 0; encoderIndex < 8; encoderIndex++) {
      output.sendMidi(context, [0xb0, 0x30 + encoderIndex, 0]);
    }
  });
}

function bindVuMeter(
  vuMeter: MR_Value,
  outputPort: MidiOutputPort,
  meterId: number,
  midiChannel = 0,
  timerUtils: TimerUtils, 
  lifecycleCallbacks: LifecycleCallbacks
) {
  let lastSentLevel = -1; // Initialize to -1 to indicate that no level has been sent yet [cite: 1156, 1157]
  let isMeterUnassigned = false;
  
  var sendLevel = function (context: MR_ActiveDevice, level: number) {
    outputPort.sendMidi(context, [208 + midiChannel, (meterId << 4) + level]);
    lastSentLevel = level;
  };

  vuMeter.mOnProcessValueChange = function (context, newValue) {
    if (!isMeterUnassigned || newValue === 0) {
      // SCALING FOR 12 SEGMENTS (0-11) [cite: 1159]
      const sensitivityScalar = 12;
      const offsetCorrection = 0; // Stronger negative offset to clear bottom LEDs [cite: 1160]

      const meterLevel = Math.ceil(
        (1 + Math.log10(0.1 + 0.9 * (1 + Math.log10(0.1 + 0.9 * newValue)))) * sensitivityScalar + offsetCorrection
      );
      // Final clamp for 12 segments [cite: 1161]
      const clampedLevel = Math.max(0, Math.min(12, meterLevel));
      sendLevel(context, clampedLevel);
    }
    var triggerRefresh = function (context: MR_ActiveDevice) {
      if (!isMeterUnassigned && lastSentLevel >= 0) {
          outputPort.sendMidi(context, [208 + midiChannel, (meterId << 4) + lastSentLevel]);
      }
      timerUtils.setTimeout(context, refreshId, triggerRefresh, 1);
    };
  };

  // Start a timer to refresh the meter level every 100ms, preventing the hardware from dimming the LEDs [cite: 1164]
  var refreshId = "meterRefresh_" + meterId + "_" + midiChannel;
  var triggerRefresh = function (context: MR_ActiveDevice) {
    // Only refresh if we have a valid level (>= 0) and fader is assigned [cite: 1165]
    if (!isMeterUnassigned && lastSentLevel >= 0) {
      outputPort.sendMidi(context, [208 + midiChannel, (meterId << 4) + lastSentLevel]);
    }
    timerUtils.setTimeout(context, refreshId, triggerRefresh, 0.1);
  };

  lifecycleCallbacks.addActivationCallback(function (context) {
    triggerRefresh(context);
  });
  
  return {
    setIsMeterUnassigned: function (context: MR_ActiveDevice, isUnassigned: boolean) {
      isMeterUnassigned = isUnassigned;
      if (isUnassigned) sendLevel(context, 0);
    }
  };
}

function bindChannelElements(device: Device, globalState: GlobalState, timerUtils: TimerUtils, lifecycleCallbacks: LifecycleCallbacks) {
  const ports = device.ports;

  for (const [channelIndex, channel] of device.channelElements.entries()) {
    // Push Encoder [cite: 1169]
    channel.encoder.bindToMidi(ports, channelIndex);

    // Scribble Strip [cite: 1187]
    const channelTextManager = device.lcdManager.channelTextManagers[channelIndex];
    
    channel.encoder.mOnEncoderValueTitleChange.addCallback((context, title1, title2) => {
      if (!title1 || title1.trim() === "") {
        channelTextManager.onParameterTitleChange(context, "       ", "       ");
      } else {
        channelTextManager.onParameterTitleChange(context, title1, title2);
      }
    });
    
    channel.encoder.mEncoderValue.mOnDisplayValueChange = (context, value) => {
      if (!value || value.trim() === "") {
        channelTextManager.onParameterDisplayValueChange(context, "       ");
      } else {
        channelTextManager.onParameterDisplayValueChange(context, value);
      }
    };
    
    channel.encoder.mPushValue.mOnDisplayValueChange = (context, value) => {
      if (!value || value.trim() === "") {
        channelTextManager.onPushParameterDisplayValueChange(context, "       ");
      } else {
        channelTextManager.onPushParameterDisplayValueChange(context, value);
      }
    };
    
    channel.scribbleStrip.trackTitle.mOnTitleChange = (context, title, title2) => {
      // If title2 is empty, it means the channel is no longer assigned to a track [cite: 1193]
      const isUnassigned = title2 === "";
      
      if (isUnassigned) {
        // Force the display to be empty for this channel [cite: 1194]
        channelTextManager.onChannelNameChange(context, "       ");
        channelTextManager.onParameterTitleChange(context, " ", " ");
        channelTextManager.onParameterDisplayValueChange(context, " ");
      } else {
        channelTextManager.onChannelNameChange(context, title);
      }

      setIsMeterUnassigned(context, isUnassigned);
    };

    if (deviceConfig.hasSecondaryScribbleStrips && channel.scribbleStrip.meterPeakLevel) {
      channel.scribbleStrip.meterPeakLevel.mOnDisplayValueChange = (context, value) => {
        if (!value || value.trim() === "") {
          channelTextManager.onMeterPeakLevelChange(context, "       ");
        } else {
          channelTextManager.onMeterPeakLevelChange(context, value);
        }
      };

      channel.fader.mSurfaceValue.mOnDisplayValueChange = (context, value) => {
        if (!value || value.trim() === "") {
          channelTextManager.onFaderParameterValueChange(context, "       ");
        } else {
          channelTextManager.onFaderParameterValueChange(context, value);
        }
      };

      channel.fader.onTitleChangeCallbacks.addCallback((context, _title, parameterName) => {
        if (!parameterName || parameterName.trim() === "") {
          channelTextManager.onFaderParameterNameChange(context, "       ");
        } else {
          channelTextManager.onFaderParameterNameChange(context, parameterName);
        }
      });
      
      channel.fader.onTouchedValueChangeCallbacks.addCallback((context, isFaderTouched) => {
        channelTextManager.onFaderTouchedChange(context, Boolean(isFaderTouched));
      });
    }

    /** Clears the channel meter's overload indicator */
    const clearOverload = (context: MR_ActiveDevice) => {
      sendMeterLevel(context, ports.output, channelIndex, 0xf);
    };

    // VU Meter [cite: 1203]
    const setIsMeterUnassigned = bindVuMeter(channel.vuMeter, ports.output, channelIndex, 0, timerUtils, lifecycleCallbacks).setIsMeterUnassigned;

    globalState.areChannelMetersEnabled.addOnChangeCallback(
      (context, areMetersEnabled) => {
        sendChannelMeterMode(context, ports.output, channelIndex, areMetersEnabled);
      },
      0, // priority = 0: Disable channel meters *before* updating the lower display row
    );
    
    globalState.shouldMeterOverloadsBeCleared.addOnChangeCallback(
      (context, shouldOverloadsBeCleared) => {
        if (shouldOverloadsBeCleared) {
          clearOverload(context);
        }
      },
    );
    
    // Channel Buttons [cite: 1206]
    const buttons = channel.buttons;
    for (const [row, button] of [
      buttons.record,
      buttons.solo,
      buttons.mute,
      buttons.select,
    ].entries()) {
      button.bindToNote(ports, row * 8 + channelIndex);
    }

    // Fader [cite: 1208]
    channel.fader.bindToMidi(ports, channelIndex, globalState);
  }

  // Handle metering mode changes (globally) [cite: 1209]
  globalState.isGlobalLcdMeterModeVertical.addOnChangeCallback((context, isMeterModeVertical) => {
    sendGlobalMeterModeOrientation(context, ports.output, isMeterModeVertical);
  });
}

function bindControlSectionElements(device: MainDevice, globalState: GlobalState, timerUtils: TimerUtils, lifecycleCallbacks: LifecycleCallbacks) {
  const ports = device.ports;
  const elements = device.controlSectionElements;
  const buttons = elements.buttons;

  elements.mainFader.bindToMidi(ports, 8, globalState);

  for (const [index, button] of [
    buttons.encoderAssign.track,
    buttons.encoderAssign.send,
    buttons.encoderAssign.pan,
    buttons.encoderAssign.plugin,
    buttons.encoderAssign.eq,
    buttons.encoderAssign.instrument,

    buttons.navigation.bank.left,
    buttons.navigation.bank.right,
    buttons.navigation.channel.left,
    buttons.navigation.channel.right,

    buttons.flip,
    buttons.edit,
    buttons.display,
    buttons.timeMode,

    ...buttons.function,
    // REPLACED `...buttons.number` with Layer 2 (maps to notes 62-69) [cite: 1211]
    ...(device.customElements as any).functionLayer2,

    buttons.modify.undo,
    buttons.modify.redo,
    buttons.modify.save,
    buttons.modify.revert,

    buttons.automation.read,
    buttons.automation.write,
    buttons.automation.sends,
    buttons.automation.project,
    buttons.automation.mixer,
    buttons.automation.motor,

    buttons.utility.instrument,
    buttons.utility.main,
    buttons.utility.soloDefeat,
    buttons.utility.shift,

    buttons.transport.left,
    buttons.transport.right,
    buttons.transport.cycle,
    buttons.transport.punch,

    buttons.transport.markers.previous,
    buttons.transport.markers.add,
    buttons.transport.markers.next,

    buttons.transport.rewind,
    buttons.transport.forward,
    buttons.transport.stop,
    buttons.transport.play,
    buttons.transport.record,

    buttons.navigation.directions.up,
    buttons.navigation.directions.down,
    buttons.navigation.directions.left,
    buttons.navigation.directions.right,
    buttons.navigation.directions.center,

    buttons.scrub,
  ].entries()) {
    if (button) {
      button.bindToNote(ports, 40 + index);
    }
  }

  // Segment Display - handled by the SegmentDisplayManager, except for the individual LEDs: [cite: 1214]
  const { smpte, beats, solo } = elements.displayLeds;
  [smpte, beats, solo].forEach((lamp, index) => {
    lamp.bindToNote(ports.output, 0x71 + index);
  });
  
  // Jog wheel [cite: 1216]
  elements.jogWheel.bindToControlChange(ports.input, 0x3c);

  // Foot control [cite: 1216]
  elements.footSwitch1.mSurfaceValue.mMidiBinding.setInputPort(ports.input).bindToNote(0, 0x66);
  elements.footSwitch2.mSurfaceValue.mMidiBinding.setInputPort(ports.input).bindToNote(0, 0x67);
  elements.expressionPedal.mSurfaceValue.mMidiBinding
    .setInputPort(ports.input)
    .bindToControlChange(0, 0x2e)
    .setTypeAbsolute();
    
  // Main VU Meters [cite: 1218]
  if (elements.mainVuMeters) {
    // Meter ID 0 = Left, ID 1 = Right
    // The '1' at the end specifies MIDI Channel 2
    bindVuMeter(elements.mainVuMeters.left, ports.output, 0, 1, timerUtils, lifecycleCallbacks);
    bindVuMeter(elements.mainVuMeters.right, ports.output, 1, 1, timerUtils, lifecycleCallbacks);
  }
}