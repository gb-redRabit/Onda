let closeToTray = true;

export function setCloseToTray(value: boolean): void {
  closeToTray = value;
}

export function shouldCloseToTray(): boolean {
  return closeToTray;
}
