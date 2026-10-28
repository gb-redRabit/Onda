let closeToTray = true;

export function setCloseToTray(value: boolean): void {
  closeToTray = value;
}

export function shouldCloseToTray(): boolean {
  return closeToTray;
}

export interface ShellCloseState {
  quitting: boolean;
  trayAvailable: boolean;
  closeToTray: boolean;
}

/**
 * Decyduje, czy zamknięcie aktywnego shella ma schować okno do tray.
 *
 * Wszystkie trzy warunki są istotne: podczas `app.quit()` nie wolno blokować
 * zamknięcia, a bez ikony tray użytkownik nie miałby jak przywrócić okna.
 */
export function shouldHideShellOnClose(state: ShellCloseState): boolean {
  return !state.quitting && state.trayAvailable && state.closeToTray;
}
