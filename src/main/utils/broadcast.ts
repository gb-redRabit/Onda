import { BrowserWindow } from 'electron';

/**
 * Sends an event to a window's renderer, tolerating windows that are absent,
 * destroyed or mid-teardown (quit / relaunch / factory reset). Returns whether
 * the message was actually delivered.
 */
export function sendToWindow(
  win: BrowserWindow | null | undefined,
  channel: string,
  ...args: unknown[]
): boolean {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return false;
  try {
    win.webContents.send(channel, ...args);
    return true;
  } catch {
    // renderer gone between the guard and the send — nothing to do
    return false;
  }
}

// Sends an event payload to every open window. Used for main-driven status
// pushes (download progress, subscription updates, library refresh, etc.).
export function broadcastToAllWindows(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    sendToWindow(win, channel, ...args);
  }
}
