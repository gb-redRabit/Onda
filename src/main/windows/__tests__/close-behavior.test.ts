import { beforeEach, describe, expect, it } from 'vitest';

import { setCloseToTray, shouldCloseToTray, shouldHideShellOnClose } from '../close-behavior';

const originalDefault = shouldCloseToTray();

beforeEach(() => {
  setCloseToTray(originalDefault);
});

describe('close to tray', () => {
  it('exposes and updates the close-to-tray preference', () => {
    setCloseToTray(false);
    expect(shouldCloseToTray()).toBe(false);

    setCloseToTray(true);
    expect(shouldCloseToTray()).toBe(true);
  });
});

describe('shouldHideShellOnClose', () => {
  it('hides only when not quitting, with a tray and the preference on', () => {
    expect(
      shouldHideShellOnClose({ quitting: false, trayAvailable: true, closeToTray: true })
    ).toBe(true);
  });

  it('never hides while quitting', () => {
    expect(shouldHideShellOnClose({ quitting: true, trayAvailable: true, closeToTray: true })).toBe(
      false
    );
  });

  it('never hides without a tray icon', () => {
    expect(
      shouldHideShellOnClose({ quitting: false, trayAvailable: false, closeToTray: true })
    ).toBe(false);
  });

  it('never hides when the preference is off', () => {
    expect(
      shouldHideShellOnClose({ quitting: false, trayAvailable: true, closeToTray: false })
    ).toBe(false);
  });
});
