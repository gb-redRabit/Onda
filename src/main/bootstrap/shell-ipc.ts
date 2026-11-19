import { BrowserWindow } from 'electron';
import type { WebContents } from 'electron';
import type { WindowMode } from '../compact/compact-state';
import { loadCompactState, saveCompactState } from '../compact/compact-state';
import { handleIpc } from '../ipc/typed-handle';

// Handlery `app:*` i `window:id` dotyczą stanu shella i trybu okna, a nie
// konkretnej funkcji aplikacji. Wydzielone z `index.ts`, żeby sekwencja startu
// nie mieszała się z rejestracją IPC.
export interface ShellIpcDeps {
  isCoreShell: () => boolean;
  getWindowMode: () => WindowMode;
  /** Przełączenie trybu; serializowane przez wołającego. */
  setWindowMode: (mode: WindowMode) => Promise<void>;
  hideCompact: () => void;
  getCompactPinned: () => boolean;
  setCompactPinned: (pinned: boolean) => Promise<void>;
  /** Czy dany renderer jest aktywnym shellem (Media Session). */
  isActiveShellSender: (senderId: number) => boolean;
  getPendingFiles: () => string[];
  onRendererReady: (sender: WebContents) => void;
  quit: () => void;
}

export function registerShellIpc(deps: ShellIpcDeps): void {
  handleIpc('app:isCoreShell', () => deps.isCoreShell());
  handleIpc('app:getWindowMode', () => deps.getWindowMode());
  handleIpc('app:setWindowMode', async (_event, mode) => {
    // Tryb przychodzi z renderera — sprawdzamy wartość, zanim trafi do przełącznika.
    if (mode === 'main' || mode === 'compact') await deps.setWindowMode(mode);
  });
  handleIpc('app:hideCompact', () => deps.hideCompact());
  handleIpc('app:getStartupMode', async () => (await loadCompactState()).mode);
  handleIpc('app:setStartupMode', async (_event, mode) => {
    if (mode === 'main' || mode === 'compact') await saveCompactState({ mode });
  });
  handleIpc('app:getCompactPinned', () => deps.getCompactPinned());
  handleIpc('app:setCompactPinned', async (_event, pinned) => {
    await deps.setCompactPinned(pinned === true);
  });
  handleIpc('app:consumeRestoreOnce', async () => {
    const state = await loadCompactState();
    if (state.restoreSessionOnce !== true) return false;
    await saveCompactState({ restoreSessionOnce: false });
    return true;
  });
  handleIpc('app:getShellActive', (event) => deps.isActiveShellSender(event.sender.id));
  handleIpc('app:rendererReady', (event) => deps.onRendererReady(event.sender));
  handleIpc('app:getPendingFiles', () => deps.getPendingFiles());
  handleIpc('app:quit', () => deps.quit());
  handleIpc('window:id', (event) => BrowserWindow.fromWebContents(event.sender)?.id ?? 0);
}
