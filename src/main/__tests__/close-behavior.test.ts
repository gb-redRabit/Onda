import { describe, expect, it } from 'vitest';
import { shouldHideShellOnClose } from '../windows/close-behavior';

describe('shouldHideShellOnClose', () => {
  it('hides only when the app is not quitting, the tray exists and close-to-tray is enabled', () => {
    expect(
      shouldHideShellOnClose({ quitting: false, trayAvailable: true, closeToTray: true })
    ).toBe(true);
  });

  it('never hides while the app is quitting', () => {
    expect(shouldHideShellOnClose({ quitting: true, trayAvailable: true, closeToTray: true })).toBe(
      false
    );
  });

  it('never hides without a tray icon (there would be no way back)', () => {
    expect(
      shouldHideShellOnClose({ quitting: false, trayAvailable: false, closeToTray: true })
    ).toBe(false);
  });

  it('respects the close-to-tray setting for compact and main shells alike', () => {
    expect(
      shouldHideShellOnClose({ quitting: false, trayAvailable: true, closeToTray: false })
    ).toBe(false);
  });
});
