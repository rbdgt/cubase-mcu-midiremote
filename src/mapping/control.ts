import { config, deviceConfig } from "/config";
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
  var buttons = controlSectionElements.buttons;
  var shiftableButtons = [
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

  for (var i = 0; i < shiftableButtons.length; i++) {
    shiftableButtons[i].setLedValue(context, value);
  }
}

export function bindMouseValueControl(page: MR_FactoryMappingPage, device: MainDevice) {
  var button = deviceConfig.getMouseValueModeButton
    ? deviceConfig.getMouseValueModeButton(device)
    : device.controlSectionElements.buttons.automation.sends; 

  var subPageArea = page.makeSubPageArea("Cursor Value Control"); 
  var inactiveSubpage = subPageArea.makeSubPage("Cursor Value Control Inactive"); 
  var activeSubpage = subPageArea.makeSubPage("Cursor Value Control Active"); 

  var jogWheel = device.controlSectionElements.jogWheel; 

  activeSubpage.mOnActivate = function(context) {
    button.setLedValue(context, 1); 
    jogWheel.mKnobModeEnabledValue.setProcessValue(context, 1); 
  };

  inactiveSubpage.mOnActivate = function(context) {
    button.setLedValue(context, 0); 
    jogWheel.mKnobModeEnabledValue.setProcessValue(context, 0); 
  };

  page.makeActionBinding(button.mSurfaceValue, activeSubpage.mAction.mActivate).setSubPage(inactiveSubpage); 
  page.makeActionBinding(button.mSurfaceValue, inactiveSubpage.mAction.mActivate).setSubPage(activeSubpage); 

  var encoders = deviceConfig.shallMouseValueModeMapAllEncoders
    ? device.channelElements.map(function(channel) { return channel.encoder; })
    : [device.channelElements[7].encoder]; 

  for (var i = 0; i < encoders.length; i++) {
    var encoder = encoders[i];
    page.makeValueBinding(encoder.mEncoderValue, page.mHostAccess.mMouseCursor.mValueUnderMouse).setSubPage(activeSubpage); 
    page.makeValueBinding(encoder.mPushValue, page.mCustom.makeHostValueVariable("Undefined")).setSubPage(activeSubpage); 
  }

  var dummyHostVariable = page.mCustom.makeHostValueVariable("dummy"); 
  page.makeValueBinding(jogWheel.mSurfaceValue, dummyHostVariable).setSubPage(inactiveSubpage); 
  page.makeValueBinding(jogWheel.mSurfaceValue, page.mHostAccess.mMouseCursor.mValueUnderMouse).setSubPage(activeSubpage); 
}

export function bindControlSection(
  page: MR_FactoryMappingPage,
  device: MainDevice,
  mixerBankZone: MR_MixerBankZone,
  globalState: GlobalState,
) {
  var host = page.mHostAccess; 
  var controlSectionElements = device.controlSectionElements; 
  var buttons = controlSectionElements.buttons; 

  var buttonsSubPageArea = page.makeSubPageArea("Control Buttons"); 
  var regularSubPage = buttonsSubPageArea.makeSubPage("Regular"); 
  var shiftSubPage = buttonsSubPageArea.makeSubPage("Shift"); 

  globalState.isShiftModeActive.addOnChangeCallback(function(context, value, mapping) {
    (value ? shiftSubPage : regularSubPage).mAction.mActivate.trigger(mapping!); 
    setShiftableButtonsLedValues(controlSectionElements, context, +value); 
  });

  // Flip button logic 
  globalState.isFlipModeActive.addOnChangeCallback(function(context, value) {
    buttons.flip.setLedValue(context, +value); 
  });

  // Display mode and Scribble Strip Row Flip 
  page.makeValueBinding(buttons.display.mSurfaceValue, page.mCustom.makeHostValueVariable("Display Name/Value"))
    .setSubPage(regularSubPage).mOnValueChange = function(context, mapping, value) {
    if (value) globalState.isValueDisplayModeActive.toggle(context); 
  };

  page.makeValueBinding(buttons.display.mSurfaceValue, page.mCustom.makeHostValueVariable("Flip Display Rows"))
    .setSubPage(shiftSubPage).mOnValueChange = function(context, mapping, value) {
    if (value) globalState.areDisplayRowsFlipped.toggle(context); 
  };

  // SMPTE/Beats button 
  page.makeCommandBinding(buttons.timeMode.mSurfaceValue, "Transport", "Exchange Time Formats")
    .setSubPage(config.toggleMeteringModeWithoutShift ? shiftSubPage : regularSubPage); 

  // Visibility Presets (Buttons 1-8) 
  for (var i = 0; i < buttons.number.length; i++) {
    page.makeCommandBinding(buttons.number[i].mSurfaceValue, "Channel & Track Visibility", "Channel and Rack Configuration " + (i + 1)); 
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
  page.makeValueBinding(buttons.automation.motor.mSurfaceValue, page.mCustom.makeHostValueVariable("Disable/Enable Fader Motors")).mOnValueChange = function(context, _mapping, value) {
    if (value) globalState.areMotorsActive.toggle(context); 
  };
  globalState.areMotorsActive.addOnChangeCallback(function(context, value) {
    buttons.automation.motor.setLedValue(context, +value); 
  });

  // MixConsole History Undo/Redo 
  page.makeCommandBinding(buttons.utility.instrument.mSurfaceValue, "MixConsole History", "Undo MixConsole Step"); 
  page.makeCommandBinding(buttons.utility.main.mSurfaceValue, "MixConsole History", "Redo MixConsole Step"); 

  // Solo Defeat / Unmute All 
  page.makeCommandBinding(buttons.utility.soloDefeat.mSurfaceValue, "Edit", "Deactivate All Solo").setSubPage(regularSubPage); 
  page.makeCommandBinding(buttons.utility.soloDefeat.mSurfaceValue, "Edit", "Unmute All").setSubPage(shiftSubPage); 

  // Transport & Locators 
  var mTrans = host.mTransport; 
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
  var bank = buttons.navigation.bank;
  var channel = buttons.navigation.channel;
  page.makeActionBinding(bank.left.mSurfaceValue, mixerBankZone.mAction.mPrevBank).setSubPage(regularSubPage); 
  page.makeActionBinding(bank.left.mSurfaceValue, mixerBankZone.mAction.mResetBank).setSubPage(shiftSubPage); 
  page.makeActionBinding(bank.right.mSurfaceValue, mixerBankZone.mAction.mNextBank); 
  page.makeActionBinding(channel.left.mSurfaceValue, mixerBankZone.mAction.mShiftLeft); 
  page.makeActionBinding(channel.right.mSurfaceValue, mixerBankZone.mAction.mShiftRight); 

  // Jog Wheel / Scrub 
  var jogSubPageArea = page.makeSubPageArea("Jog Wheel");
  var scrubSubPage = jogSubPageArea.makeSubPage("Scrub"); 
  var jogSubPage = jogSubPageArea.makeSubPage("Jog"); 
  var scrubButton = controlSectionElements.buttons.scrub; 

  page.makeActionBinding(scrubButton.mSurfaceValue, jogSubPageArea.mAction.mNext); 

  jogSubPage.mOnActivate = function(context) { scrubButton.setLedValue(context, 1); }; 
  scrubSubPage.mOnActivate = function(context) { scrubButton.setLedValue(context, 0); }; 

  var jogLeft = controlSectionElements.jogWheel.mJogLeftValue; 
  var jogRight = controlSectionElements.jogWheel.mJogRightValue; 
  page.makeCommandBinding(jogLeft, "Transport", "Jog Left").setSubPage(jogSubPage); 
  page.makeCommandBinding(jogRight, "Transport", "Jog Right").setSubPage(jogSubPage); 
  page.makeCommandBinding(jogLeft, "Transport", "Nudge Cursor Left").setSubPage(scrubSubPage); 
  page.makeCommandBinding(jogRight, "Transport", "Nudge Cursor Right").setSubPage(scrubSubPage); 

  // Navigation Directions and Zoom 
  var dirSubPageArea = page.makeSubPageArea("Direction Buttons"); 
  var navigateSubPage = dirSubPageArea.makeSubPage("Navigate"); 
  var zoomSubPage = dirSubPageArea.makeSubPage("Zoom"); 

  zoomSubPage.mOnActivate = function(context) { buttons.navigation.directions.center.setLedValue(context, 1); }; 
  navigateSubPage.mOnActivate = function(context) { buttons.navigation.directions.center.setLedValue(context, 0); }; 

  var dirs = buttons.navigation.directions; 
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
  var shiftButtons = [buttons.utility.shift]; 
  if (deviceConfig.getSupplementaryShiftButtons) { 
    shiftButtons.push.apply(shiftButtons, deviceConfig.getSupplementaryShiftButtons(device)); 
  }

  for (var j = 0; j < shiftButtons.length; j++) {
    page.makeActionBinding(shiftButtons[j].mSurfaceValue, shiftSubPage.mAction.mActivate).mOnValueChange = function(context, mapping, value) {
      globalState.isShiftModeActive.set(context, Boolean(value), mapping); 
    };
  }
}