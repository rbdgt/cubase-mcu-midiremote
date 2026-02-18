import { config } from "/config";
import { ControlSectionSurfaceElements } from "/device-configs";
import { MainDevice } from "/devices";
import { GlobalState } from "/state";

/**
 * Sets LED states for buttons that change behavior when Shift is held.
 */
function setShiftableButtonsLedValues(
  controlSectionElements: ControlSectionSurfaceElements,
  context: MR_ActiveDevice,
  value: number,
) {
  const buttons = controlSectionElements.buttons;
  const shiftableButtons = [
    buttons.edit,
    buttons.modify.undo,
    buttons.modify.save,
    buttons.utility.soloDefeat,
    buttons.transport.left,
    buttons.transport.right,
    buttons.transport.rewind,
    buttons.transport.forward,
    buttons.navigation.bank.left,
    buttons.display,
  ];
  for (const button of shiftableButtons) {
    button.setLedValue(context, value);
  }
}

export function bindMouseValueControl(page: MR_FactoryMappingPage, device: MainDevice) {
  // Hardcoded to the Sends button for QCon Pro X
  const button = device.controlSectionElements.buttons.automation.sends; 
  
  const subPageArea = page.makeSubPageArea("Cursor Value Control"); 
  const inactiveSubpage = subPageArea.makeSubPage("Cursor Value Control Inactive");
  const activeSubpage = subPageArea.makeSubPage("Cursor Value Control Active"); 

  const jogWheel = device.controlSectionElements.jogWheel; 

  activeSubpage.mOnActivate = (context) => {
    button.setLedValue(context, 1);
    jogWheel.mKnobModeEnabledValue.setProcessValue(context, 1); 
  };

  inactiveSubpage.mOnActivate = (context) => {
    button.setLedValue(context, 0); 
    jogWheel.mKnobModeEnabledValue.setProcessValue(context, 0); 
  };

  page.makeActionBinding(button.mSurfaceValue, activeSubpage.mAction.mActivate).setSubPage(inactiveSubpage); 
  page.makeActionBinding(button.mSurfaceValue, inactiveSubpage.mAction.mActivate).setSubPage(activeSubpage);

  // Use the rightmost encoder (index 7) for mouse value control
  const encoder = device.channelElements[7].encoder;
  page.makeValueBinding(encoder.mEncoderValue, page.mHostAccess.mMouseCursor.mValueUnderMouse).setSubPage(activeSubpage);
  page.makeValueBinding(encoder.mPushValue, page.mCustom.makeHostValueVariable("Undefined")).setSubPage(activeSubpage); 

  const dummyHostVariable = page.mCustom.makeHostValueVariable("dummy"); 
  page.makeValueBinding(jogWheel.mSurfaceValue, dummyHostVariable).setSubPage(inactiveSubpage); 
  page.makeValueBinding(jogWheel.mSurfaceValue, page.mHostAccess.mMouseCursor.mValueUnderMouse).setSubPage(activeSubpage);
}

export function bindControlSection(
  page: MR_FactoryMappingPage,
  device: MainDevice,
  mixerBankZone: MR_MixerBankZone,
  globalState: GlobalState,
) {
  const host = page.mHostAccess;
  const controlSectionElements = device.controlSectionElements; 
  const buttons = controlSectionElements.buttons; 

  const buttonsSubPageArea = page.makeSubPageArea("Control Buttons"); 
  const regularSubPage = buttonsSubPageArea.makeSubPage("Regular");
  const shiftSubPage = buttonsSubPageArea.makeSubPage("Shift"); 

  globalState.isShiftModeActive.addOnChangeCallback((context, value, mapping) => {
    (value ? shiftSubPage : regularSubPage).mAction.mActivate.trigger(mapping!); 
    setShiftableButtonsLedValues(controlSectionElements, context, +value); 
  });

  // Flip button logic 
  globalState.isFlipModeActive.addOnChangeCallback((context, value) => {
    buttons.flip.setLedValue(context, +value); 
  });

  // Display mode and Scribble Strip Row Flip 
  page.makeValueBinding(buttons.display.mSurfaceValue, page.mCustom.makeHostValueVariable("Display Name/Value"))
    .setSubPage(regularSubPage).mOnValueChange = (context, mapping, value) => {
    if (value) globalState.isValueDisplayModeActive.toggle(context);
  };

  page.makeValueBinding(buttons.display.mSurfaceValue, page.mCustom.makeHostValueVariable("Flip Display Rows"))
    .setSubPage(shiftSubPage).mOnValueChange = (context, mapping, value) => {
    if (value) globalState.areDisplayRowsFlipped.toggle(context);
  };

  // SMPTE/Beats button 
  page.makeCommandBinding(buttons.timeMode.mSurfaceValue, "Transport", "Exchange Time Formats").setSubPage(regularSubPage);

  // Visibility Presets (Buttons 1-8) 
  for (let i = 0; i < buttons.number.length; i++) {
    page.makeCommandBinding(buttons.number[i].mSurfaceValue, "Channel & Track Visibility", `Channel and Rack Configuration ${i + 1}`);
  }

  // Edit / Close Plugin Windows 
  page.makeCommandBinding(buttons.edit.mSurfaceValue, "Edit", "Edit Channel Settings").setSubPage(regularSubPage);
  page.makeCommandBinding(buttons.edit.mSurfaceValue, "Windows", "Close All Plug-in Windows").setSubPage(shiftSubPage); 

  // Undo / History 
  page.makeCommandBinding(buttons.modify.undo.mSurfaceValue, "Edit", "Undo").setSubPage(regularSubPage); 
  page.makeCommandBinding(buttons.modify.undo.mSurfaceValue, "Edit", "History").setSubPage(shiftSubPage);
  page.makeCommandBinding(buttons.modify.redo.mSurfaceValue, "Edit", "Redo"); 

  // Save / Save New Version 
  page.makeCommandBinding(buttons.modify.save.mSurfaceValue, "File", "Save").setSubPage(regularSubPage); 
  page.makeCommandBinding(buttons.modify.save.mSurfaceValue, "File", "Save New Version").setSubPage(shiftSubPage);
  page.makeCommandBinding(buttons.modify.revert.mSurfaceValue, "File", "Revert"); 

  // Automation 
  page.makeValueBinding(buttons.automation.read.mSurfaceValue, host.mTrackSelection.mMixerChannel.mValue.mAutomationRead).setTypeToggle(); 
  page.makeValueBinding(buttons.automation.write.mSurfaceValue, host.mTrackSelection.mMixerChannel.mValue.mAutomationWrite).setTypeToggle(); 
  page.makeCommandBinding(buttons.automation.project.mSurfaceValue, "Project", "Bring To Front"); 
  page.makeCommandBinding(buttons.automation.mixer.mSurfaceValue, "Devices", "Mixer");

  // Fader Motor Toggle 
  page.makeValueBinding(buttons.automation.motor.mSurfaceValue, page.mCustom.makeHostValueVariable("Disable/Enable Fader Motors")).mOnValueChange = (context, _mapping, value) => {
    if (value) globalState.areMotorsActive.toggle(context);
  };
  globalState.areMotorsActive.addOnChangeCallback((context, value) => {
    buttons.automation.motor.setLedValue(context, +value); 
  });

  // MixConsole History Undo/Redo 
  page.makeCommandBinding(buttons.utility.instrument.mSurfaceValue, "MixConsole History", "Undo MixConsole Step"); 
  page.makeCommandBinding(buttons.utility.main.mSurfaceValue, "MixConsole History", "Redo MixConsole Step");

  // Solo Defeat / Unmute All 
  page.makeCommandBinding(buttons.utility.soloDefeat.mSurfaceValue, "Edit", "Deactivate All Solo").setSubPage(regularSubPage); 
  page.makeCommandBinding(buttons.utility.soloDefeat.mSurfaceValue, "Edit", "Unmute All").setSubPage(shiftSubPage);

  // Transport & Locators 
  const mTrans = host.mTransport; 
  page.makeCommandBinding(buttons.transport.left.mSurfaceValue, "Transport", "To Left Locator").setSubPage(regularSubPage); 
  page.makeCommandBinding(buttons.transport.left.mSurfaceValue, "Transport", "Set Left Locator").setSubPage(shiftSubPage);
  page.makeCommandBinding(buttons.transport.right.mSurfaceValue, "Transport", "To Right Locator").setSubPage(regularSubPage); 
  page.makeCommandBinding(buttons.transport.right.mSurfaceValue, "Transport", "Set Right Locator").setSubPage(shiftSubPage); 
  
  page.makeValueBinding(buttons.transport.cycle.mSurfaceValue, mTrans.mValue.mCycleActive).setTypeToggle(); 
  page.makeCommandBinding(buttons.transport.punch.mSurfaceValue, "Transport", "Auto Punch In");
  page.makeCommandBinding(buttons.transport.markers.previous.mSurfaceValue, "Transport", "Locate Previous Marker"); 
  page.makeCommandBinding(buttons.transport.markers.add.mSurfaceValue, "Transport", "Insert Marker"); 
  page.makeCommandBinding(buttons.transport.markers.next.mSurfaceValue, "Transport", "Locate Next Marker");

  // Rewind / Forward 
  page.makeValueBinding(buttons.transport.rewind.mSurfaceValue, mTrans.mValue.mRewind).setSubPage(regularSubPage); 
  page.makeCommandBinding(buttons.transport.rewind.mSurfaceValue, "Transport", "Return to Zero").setSubPage(shiftSubPage); 
  page.makeValueBinding(buttons.transport.forward.mSurfaceValue, mTrans.mValue.mForward).setSubPage(regularSubPage); 
  page.makeCommandBinding(buttons.transport.forward.mSurfaceValue, "Transport", "Goto End").setSubPage(shiftSubPage);

  page.makeValueBinding(buttons.transport.stop.mSurfaceValue, mTrans.mValue.mStop).setTypeToggle(); 
  page.makeValueBinding(buttons.transport.play.mSurfaceValue, mTrans.mValue.mStart).setTypeToggle(); 
  page.makeValueBinding(buttons.transport.record.mSurfaceValue, mTrans.mValue.mRecord).setTypeToggle(); 

  // Banking and Channel Navigation 
  const bank = buttons.navigation.bank;
  const channel = buttons.navigation.channel;
  page.makeActionBinding(bank.left.mSurfaceValue, mixerBankZone.mAction.mPrevBank).setSubPage(regularSubPage); 
  page.makeActionBinding(bank.left.mSurfaceValue, mixerBankZone.mAction.mResetBank).setSubPage(shiftSubPage); 
  page.makeActionBinding(bank.right.mSurfaceValue, mixerBankZone.mAction.mNextBank); 
  page.makeActionBinding(channel.left.mSurfaceValue, mixerBankZone.mAction.mShiftLeft); 
  page.makeActionBinding(channel.right.mSurfaceValue, mixerBankZone.mAction.mShiftRight);

  // Jog Wheel / Scrub 
  const jogSubPageArea = page.makeSubPageArea("Jog Wheel");
  const scrubSubPage = jogSubPageArea.makeSubPage("Scrub"); 
  const jogSubPage = jogSubPageArea.makeSubPage("Jog");
  const scrubButton = controlSectionElements.buttons.scrub; 

  page.makeActionBinding(scrubButton.mSurfaceValue, jogSubPageArea.mAction.mNext); 

  jogSubPage.mOnActivate = (context) => scrubButton.setLedValue(context, 1); 
  scrubSubPage.mOnActivate = (context) => scrubButton.setLedValue(context, 0);

  const jogLeft = controlSectionElements.jogWheel.mJogLeftValue; 
  const jogRight = controlSectionElements.jogWheel.mJogRightValue; 
  page.makeCommandBinding(jogLeft, "Transport", "Jog Left").setSubPage(jogSubPage); 
  page.makeCommandBinding(jogRight, "Transport", "Jog Right").setSubPage(jogSubPage);
  page.makeCommandBinding(jogLeft, "Transport", "Nudge Cursor Left").setSubPage(scrubSubPage); 
  page.makeCommandBinding(jogRight, "Transport", "Nudge Cursor Right").setSubPage(scrubSubPage);

  // Navigation Directions and Zoom 
  const dirSubPageArea = page.makeSubPageArea("Direction Buttons"); 
  const navigateSubPage = dirSubPageArea.makeSubPage("Navigate"); 
  const zoomSubPage = dirSubPageArea.makeSubPage("Zoom");

  zoomSubPage.mOnActivate = (context) => buttons.navigation.directions.center.setLedValue(context, 1); 
  navigateSubPage.mOnActivate = (context) => buttons.navigation.directions.center.setLedValue(context, 0); 

  const dirs = buttons.navigation.directions;
  page.makeCommandBinding(dirs.up.mSurfaceValue, "Navigate", "Up").setSubPage(navigateSubPage); 
  page.makeCommandBinding(dirs.up.mSurfaceValue, "Zoom", "Zoom Out Vertically").setSubPage(zoomSubPage); 
  page.makeCommandBinding(dirs.down.mSurfaceValue, "Navigate", "Down").setSubPage(navigateSubPage); 
  page.makeCommandBinding(dirs.down.mSurfaceValue, "Zoom", "Zoom In Vertically").setSubPage(zoomSubPage); 
  page.makeCommandBinding(dirs.left.mSurfaceValue, "Navigate", "Left").setSubPage(navigateSubPage);
  page.makeCommandBinding(dirs.left.mSurfaceValue, "Zoom", "Zoom Out").setSubPage(zoomSubPage); 
  page.makeCommandBinding(dirs.right.mSurfaceValue, "Navigate", "Right").setSubPage(navigateSubPage); 
  page.makeCommandBinding(dirs.right.mSurfaceValue, "Zoom", "Zoom In").setSubPage(zoomSubPage);

  if (!config.disableJogWheelZoom) { 
    page.makeCommandBinding(jogLeft, "Zoom", "Zoom Out").setSubPage(zoomSubPage); 
    page.makeCommandBinding(jogRight, "Zoom", "Zoom In").setSubPage(zoomSubPage); 
  }

  page.makeActionBinding(dirs.center.mSurfaceValue, dirSubPageArea.mAction.mNext);

  // Global Shift handling 
  page.makeActionBinding(buttons.utility.shift.mSurfaceValue, shiftSubPage.mAction.mActivate).mOnValueChange = (context, mapping, value) => {
    globalState.isShiftModeActive.set(context, Boolean(value), mapping);
  };
}