import { Simplify } from "type-fest";
import { MainDevice } from "./devices/MainDevice";

export interface ChannelVisibility {
  audio: boolean;
  instrument: boolean;
  sampler: boolean;
  midi: boolean;
  fx: boolean;
  group: boolean;
  vca: boolean;
  input: boolean;
  output: boolean;
}

export type ScriptConfiguration = {
  devices: Array<"main" | "extender">;
  enableAutoSelect: boolean;
  mapMainFaderToControlRoom: boolean;
  resetPanOnEncoderPush: boolean;
  channelVisibility: ChannelVisibility;
  flipDisplayRowsByDefault: boolean;
  disableJogWheelZoom: boolean;
  mapChannelButtonsToParameterPageNavigation: boolean;
};

export interface DeviceConfig {
  hasIndividualScribbleStrips: boolean;
  hasSecondaryScribbleStrips: boolean;
  maximumMeterValue: number;
  enhanceMapping?: (args: any) => void;
  configureEncoderMappings?: (configs: any[], page: MR_FactoryMappingPage) => any[];
  getMouseValueModeButton?: (device: MainDevice) => MR_Button | undefined;
  shallMouseValueModeMapAllEncoders?: boolean;
  getSupplementaryShiftButtons?: (device: MainDevice) => any[];
}

export const deviceConfig: DeviceConfig = {
  hasIndividualScribbleStrips: true,
  hasSecondaryScribbleStrips: true,
  maximumMeterValue: 0xd // Keep the Pro X specific meter scaling [cite: 734]
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
  flipDisplayRowsByDefault: true,
  disableJogWheelZoom: true,
  mapChannelButtonsToParameterPageNavigation: true,
};