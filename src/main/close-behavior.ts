let closeToTray = true;

export function setCloseToTray(value: boolean): void {
  closeToTray = value;
}

export function shouldCloseToTray(): boolean {
  return closeToTray;
}

export function isTrayDestroyed(tray: { isDestroyed?: () => boolean } | null | undefined): boolean {
  if (!tray) return true;
  try {
    return typeof tray.isDestroyed === 'function' ? tray.isDestroyed() : false;
  } catch {
    return true;
  }
}
