import { ipcMain, BrowserWindow, app } from 'electron';
import type { PipManager } from '../pip/pip-manager';
import type { AudioPipManager } from '../pip/audio-pip-manager';
import { logger } from '../../shared/logger';
import { setCloseToTray } from './close-behavior';
import { createExplorerWindow, getExplorerWindows } from './explorer-windows';
import { closeImageViewer, getImageViewerData, openImageViewer } from './image-viewer-window';
import { registerPipHandlers } from './window-ipc-pip';

// Bounds carry an extra restore flag that Electron does not type.
type BoundsWithFlag = Electron.Rectangle & { wasMaximized?: boolean };
type WindowBackgroundMaterial = 'auto' | 'none' | 'mica' | 'acrylic' | 'tabbed';

const desiredWindowMaterials = new WeakMap<BrowserWindow, WindowBackgroundMaterial>();
const materialListenersInstalled = new WeakSet<BrowserWindow>();
const materialReapplyTimers = new WeakMap<BrowserWindow, ReturnType<typeof setTimeout>>();

function applyWindowMaterial(win: BrowserWindow, material: WindowBackgroundMaterial): boolean {
  if (process.platform !== 'win32' || win.isDestroyed()) return false;
  try {
    win.setBackgroundMaterial(material);
    return true;
  } catch (e) {
    logger.warn('window', 'setBackgroundMaterial failed (non-fatal)', e);
    return false;
  }
}

function rememberWindowMaterial(win: BrowserWindow, material: WindowBackgroundMaterial): void {
  desiredWindowMaterials.set(win, material);
  if (materialListenersInstalled.has(win)) return;
  materialListenersInstalled.add(win);

  const scheduleReapply = (): void => {
    const previous = materialReapplyTimers.get(win);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      materialReapplyTimers.delete(win);
      const desired = desiredWindowMaterials.get(win);
      if (desired) applyWindowMaterial(win, desired);
    }, 80);
    materialReapplyTimers.set(win, timer);
  };

  win.on('focus', scheduleReapply);
  win.on('show', scheduleReapply);
  win.on('restore', scheduleReapply);
  win.on('maximize', scheduleReapply);
  win.on('unmaximize', scheduleReapply);
  win.on('closed', () => {
    const timer = materialReapplyTimers.get(win);
    if (timer) clearTimeout(timer);
    materialReapplyTimers.delete(win);
    desiredWindowMaterials.delete(win);
  });
}

export function registerWindowHandlers(context: {
  getMainWindow: () => BrowserWindow | null;
  preFullscreenBounds: { current: Electron.Rectangle | null };
  pipManager: PipManager;
  audioPipManager: AudioPipManager;
}): void {
  const { getMainWindow, preFullscreenBounds, pipManager, audioPipManager } = context;

  const isPositiveIntId = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value > 0;

  ipcMain.handle('imageViewer:open', (_event, files: unknown[], index: unknown) => {
    // A renderer can send anything; a NaN / negative index would be stored and
    // later used to slice the file list. Normalise it here, at the boundary.
    const safeIndex =
      typeof index === 'number' && Number.isFinite(index) && index >= 0 ? Math.floor(index) : 0;
    return openImageViewer(files, safeIndex);
  });

  ipcMain.handle('imageViewer:getData', () => {
    return getImageViewerData();
  });

  ipcMain.handle('imageViewer:close', () => {
    closeImageViewer();
  });

  ipcMain.handle('explorer:create', async (_event, path?: string) => {
    return createExplorerWindow(typeof path === 'string' ? path : undefined);
  });

  ipcMain.handle('explorer:tabMoved', (_event, sourceWindowId: unknown, path: unknown) => {
    if (!isPositiveIntId(sourceWindowId)) return { ok: false, error: 'invalid window id' };
    if (typeof path !== 'string' || path.length === 0 || path.length > 4096) {
      return { ok: false, error: 'invalid path' };
    }
    const source = BrowserWindow.fromId(sourceWindowId);
    if (source && !source.isDestroyed()) {
      source.webContents.send('explorer:remove-tab', path);
    }
    return { ok: true };
  });

  ipcMain.handle('explorer:sendTabToMain', (_event, path: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('explorer:add-tab', path);
    }
  });

  ipcMain.on('explorer:refreshAll', () => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('explorer:refresh');
    }
    for (const w of getExplorerWindows()) {
      if (!w.isDestroyed()) w.webContents.send('explorer:refresh');
    }
  });

  ipcMain.handle('app:setBackgroundMaterial', (event, material: string) => {
    if (process.platform !== 'win32') return false;
    const valid: WindowBackgroundMaterial[] = ['auto', 'none', 'mica', 'acrylic', 'tabbed'];
    if (!(valid as string[]).includes(material)) return false;
    // Only the window that asked: the renderer's theme engine calls this in every
    // window it runs in (main, explorer), and PiP windows manage their own
    // surface. Applying it to all windows used to leave acrylic behind windows
    // whose appearance had no transparency.
    const win = BrowserWindow.fromWebContents(event.sender) ?? getMainWindow();
    if (!win || win.isDestroyed()) return false;
    const mode = material as WindowBackgroundMaterial;
    rememberWindowMaterial(win, mode);
    const applied = applyWindowMaterial(win, mode);
    if (applied) logger.info('window', `background material=${mode}`);
    return applied;
  });

  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.handle('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
  });

  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle('window:setAlwaysOnTop', (event, flag: unknown) => {
    if (typeof flag !== 'boolean') return false;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return false;
    win.setAlwaysOnTop(flag);
    return true;
  });

  function restoreBounds(win: BrowserWindow) {
    // Called from a 400ms fallback timer — the window may be gone by then.
    if (win.isDestroyed()) return;
    if (!preFullscreenBounds.current) return;
    const bounds = preFullscreenBounds.current;
    preFullscreenBounds.current = null;
    const wasMaximized = (bounds as BoundsWithFlag).wasMaximized;
    if (wasMaximized) {
      win.maximize();
    } else {
      win.setBounds(bounds as Electron.Rectangle);
    }
    // WORKAROUND (Windows): after leaving full-screen the compositor can still
    // report the window as non-resizable, and `setBounds()` is then ignored.
    // Toggling `resizable` forces it to accept the restored bounds.
    win.setResizable(false);
    win.setResizable(true);
  }

  ipcMain.handle('window:toggleFullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? getMainWindow();
    if (!win) return false;
    if (win.isFullScreen()) {
      win.setFullScreen(false);
      let fired = false;
      const doRestore = () => {
        if (fired) return;
        fired = true;
        restoreBounds(win);
      };
      win.once('leave-full-screen', doRestore);
      setTimeout(doRestore, 400);
      return false;
    } else {
      if (!preFullscreenBounds.current) {
        const b = win.getBounds();
        (b as BoundsWithFlag).wasMaximized = win.isMaximized();
        preFullscreenBounds.current = b;
      }
      win.setFullScreen(true);
      return true;
    }
  });

  ipcMain.handle('window:exitFullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? getMainWindow();
    if (!win || !win.isFullScreen()) return;
    win.setFullScreen(false);
    let fired = false;
    const doRestore = () => {
      if (fired) return;
      fired = true;
      restoreBounds(win);
    };
    win.once('leave-full-screen', doRestore);
    setTimeout(doRestore, 400);
  });

  ipcMain.handle('window:isFullscreen', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false;
  });

  ipcMain.handle('app:getAutoLaunch', (): { enabled: boolean; hidden: boolean } => {
    try {
      const s = app.getLoginItemSettings() as {
        openAtLogin: boolean;
        args?: string[];
        launchArgs?: string[];
      };
      const args = s.args ?? s.launchArgs ?? [];
      return { enabled: !!s.openAtLogin, hidden: args.includes('--hidden') };
    } catch {
      return { enabled: false, hidden: false };
    }
  });

  ipcMain.handle(
    'app:setAutoLaunch',
    (_event, opts: { enabled: boolean; hidden?: boolean }): boolean => {
      try {
        const enabled = !!opts?.enabled;
        const hidden = !!opts?.hidden;
        app.setLoginItemSettings({
          openAtLogin: enabled,
          args: hidden ? ['--hidden'] : [],
          ...(process.platform === 'darwin' ? { openAsHidden: hidden } : {})
        });
        return true;
      } catch (e) {
        logger.warn('window', 'setAutoLaunch failed', e);
        return false;
      }
    }
  );

  ipcMain.handle('app:setCloseToTray', (_event, value: boolean) => {
    setCloseToTray(!!value);
    return true;
  });

  registerPipHandlers({ pipManager, audioPipManager });
}
