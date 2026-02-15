import { MidiOutputPort } from "/decorators/MidiOutputPort";

export class MidiPortPair {
  //private static nextPortPairIndex = 1;
  public isExtender: boolean;

  //private portPairIndex = MidiPortPair.nextPortPairIndex++;

  input: MR_DeviceMidiInput;
  output: MidiOutputPort;

  constructor(driver: MR_DeviceDriver, isExtender: boolean, portIndex: number) {
    this.isExtender = isExtender;    
    const name = isExtender ? "Extender" : "Main";

    this.input = driver.mPorts.makeMidiInput(`Input ${portIndex} - ${name}`);
    this.output = new MidiOutputPort(driver, `Output ${portIndex} - ${name}`, isExtender);
  }
}
