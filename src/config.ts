import { Simplify } from "type-fest";

export type ScriptConfiguration = {
    devices: Array<"main" | "extender">;
    displayColorMode: "encoders" | "channels" | "none";
    enableAutoSelect: boolean;
    mapMainFaderToControlRoom: boolean;
    resetPanOnEncoderPush: boolean;
    channelVisibility: any;
    flipDisplayRowsByDefault: boolean;
    disableJogWheelZoom: boolean;
    mapChannelButtonsToParameterPageNavigation: boolean;
};

// Add this "stub" to stop the import errors
export const deviceConfig: any = {
  hasIndividualScribbleStrips: true,
  hasSecondaryScribbleStrips: true,
  maximumMeterValue: 0xd // Keep the Pro X specific meter scaling
};

// @ts-expect-error CONFIGURATION is defined below the BEGIN JS marker
export const config: ScriptConfiguration = {
  ...CONFIGURATION
};

// Everything below "BEGIN JS" is captured by tsup
// BEGIN JS
var CONFIGURATION = {
  devices: ["extender", "main"],
  enableAutoSelect: false,
  mapMainFaderToControlRoom: false,
  resetPanOnEncoderPush: true,
  channelVisibility: {
    audio: true,
    instrument: true,
    sampler: true,
    midi: false,
    fx: true,
    group: true,
    vca: true,
    input: false,
    output: false,
  },
  displayColorMode: "none", 
  flipDisplayRowsByDefault: true,
  disableJogWheelZoom: true,
  mapChannelButtonsToParameterPageNavigation: true,
};