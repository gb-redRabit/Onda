import { BrowserWindow } from 'electron';

// Sends an event payload to every open window. Used for main-driven status
// pushes (download progress, subscription updates, library refresh, etc.).
export function broadcastToAllWindows(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send(channel, ...args);
    } catch {
      // window closed mid-iteration — skip
    }
  }
}
