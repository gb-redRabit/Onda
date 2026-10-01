// Wspólne akcje menu kontekstowego (plan 3.3). Te same wywołania IPC / zapisy do schowka
// były duplikowane w każdym rejestrze menu.
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

/** Kopiuje przez proces główny (`fs:copyPath`) — używane przez Eksploratora. */
export function copyPathViaMain(path: string): void {
  void window.api?.invoke('fs:copyPath', path);
}
