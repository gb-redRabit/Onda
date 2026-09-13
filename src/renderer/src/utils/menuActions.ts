// Shared context-menu actions (plan 3.3). The same IPC calls / clipboard writes
// were duplicated across every menu registry.
export function revealInFolder(path: string): void {
  void window.api?.invoke('shell:showItemInFolder', path);
}

export function openWithDefaultApp(path: string): void {
  void window.api?.invoke('shell:openWithDefault', path);
}

export function openInTerminal(path: string): void {
  void window.api?.invoke('shell:openTerminal', path);
}

export function copyPathToClipboard(path: string): void {
  void navigator.clipboard?.writeText(path);
}

/** Copies via the main process (`fs:copyPath`) — used by the Explorer. */
export function copyPathViaMain(path: string): void {
  void window.api?.invoke('fs:copyPath', path);
}
