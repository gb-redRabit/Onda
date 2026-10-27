import { ipcMain, BrowserWindow } from 'electron';
import type { PipManager } from '../pip/pip-manager';
import type { AudioPipManager } from '../pip/audio-pip-manager';
import { logger } from '../../shared/logger';
import { getAutoLaunch, setAutoLaunch } from './auto-launch';
import { setCloseToTray } from './close-behavior';
import { createExplorerWindow, getExplorerWindows } from './explorer-windows';
import { closeImageViewer, getImageViewerData, openImageViewer } from './image-viewer-window';
import { registerPipHandlers } from './window-ipc-pip';
import { setDwmBorderColor, setDwmRoundedCorners } from './dwm';

// Bounds niosą dodatkową flagę przywracania, której Electron nie typuje.
type BoundsWithFlag = Electron.Rectangle & { wasMaximized?: boolean };
type WindowBackgroundMaterial = 'auto' | 'none' | 'mica' | 'acrylic' | 'tabbed';

const desiredWindowMaterials = new WeakMap<BrowserWindow, WindowBackgroundMaterial>();
const materialListenersInstalled = new WeakSet<BrowserWindow>();
const materialReapplyTimers = new WeakMap<BrowserWindow, ReturnType<typeof setTimeout>>();

// Windows 11: kształt ramki ustawia natywne DWM (ROUND/DONOTROUND). `setShape`
// zostaje wyłącznie jako fallback, gdy FFI/DWM jest niedostępne.
const desiredWindowCorners = new WeakMap<BrowserWindow, boolean>();
const cornerListenersInstalled = new WeakSet<BrowserWindow>();

async function applyWindowCorners(win: BrowserWindow, rounded: boolean): Promise<boolean> {
  if (process.platform !== 'win32' || win.isDestroyed()) return false;
  // Najpierw natywny DWM — zmienia faktyczny kształt ramki, więc obramowanie
  // aplikacji i krawędź okna pokrywają się (setShape zmieniał tylko zawartość).
  if (await setDwmRoundedCorners(win, rounded)) return true;
  try {
    if (rounded) {
      win.setShape([]);
    } else {
      const { width, height } = win.getBounds();
      const margin = 16;
      try {
        win.setShape([
          { x: -margin, y: -margin, width: width + margin * 2, height: height + margin * 2 }
        ]);
      } catch {
        win.setShape([{ x: 0, y: 0, width: width + margin * 2, height: height + margin * 2 }]);
      }
    }
    return true;
  } catch (e) {
    logger.warn('window', 'setShape failed (non-fatal)', e);
    return false;
  }
}

function rememberWindowCorners(win: BrowserWindow, rounded: boolean): void {
  desiredWindowCorners.set(win, rounded);
  if (cornerListenersInstalled.has(win)) return;
  cornerListenersInstalled.add(win);

  const reapply = (): void => {
    if (win.isDestroyed()) return;
    const desired = desiredWindowCorners.get(win);
    // Fallback `setShape` trzeba odświeżyć po resize; DWM robi to sam.
    if (desired === false) void applyWindowCorners(win, false);
  };

  win.on('resize', reapply);
  win.on('maximize', reapply);
  win.on('unmaximize', reapply);
  win.on('restore', reapply);
  win.on('enter-full-screen', reapply);
  win.on('leave-full-screen', reapply);
  win.on('closed', () => {
    desiredWindowCorners.delete(win);
  });
}

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
    // Renderer może wysłać cokolwiek; indeks NaN / ujemny zostałby zapisany i
    // później użyty do pocięcia listy plików. Znormalizuj go tutaj, na granicy.
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
    // Tylko okno, które poprosiło: silnik motywu renderera wywołuje to w każdym
    // oknie, w którym działa (główne, eksplorator), a okna PiP zarządzają własną
    // powierzchnią. Stosowanie tego do wszystkich okien zostawiało akryl za oknami,
    // których wygląd nie miał przezroczystości.
    const win = BrowserWindow.fromWebContents(event.sender) ?? getMainWindow();
    if (!win || win.isDestroyed()) return false;
    const mode = material as WindowBackgroundMaterial;
    rememberWindowMaterial(win, mode);
    const applied = applyWindowMaterial(win, mode);
    if (applied) logger.info('window', `background material=${mode}`);
    return applied;
  });

  // Windows 11 rysuje 1px obramowanie okna w kolorze akcentu (domyślnie jasnym).
  // Ustawiamy je na kolor ramki aplikacji, żeby nie odcinało się od zawartości.
  ipcMain.handle('window:setBorderColor', async (event, color: unknown) => {
    if (process.platform !== 'win32') return false;
    if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) return false;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return false;
    if (await setDwmBorderColor(win, color)) return true;
    try {
      win.setAccentColor(color);
      return true;
    } catch (e) {
      logger.warn('window', 'setAccentColor failed (non-fatal)', e);
      return false;
    }
  });

  // Kwadratowe narożniki przy `geometry.radiusBox = 0`; dodatnia wartość zostawia
  // systemowe zaokrąglenie DWM (Windows 11 sam dobiera promień).
  ipcMain.handle('window:setRoundedCorners', async (event, rounded: unknown) => {
    if (typeof rounded !== 'boolean') return false;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return false;
    rememberWindowCorners(win, rounded);
    return applyWindowCorners(win, rounded);
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
    // Wywoływane z 400 ms timera awaryjnego — okno może już nie istnieć.
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
    // WORKAROUND (Windows): po wyjściu z pełnego ekranu kompozytor może nadal
    // raportować okno jako niezmienialne, a `setBounds()` jest wtedy ignorowane.
    // Przełączenie `resizable` zmusza je do przyjęcia przywróconych bounds.
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
    return getAutoLaunch();
  });

  ipcMain.handle(
    'app:setAutoLaunch',
    (_event, opts: { enabled: boolean; hidden?: boolean }): boolean => {
      return setAutoLaunch({ enabled: !!opts?.enabled, hidden: !!opts?.hidden });
    }
  );

  ipcMain.handle('app:setCloseToTray', (_event, value: boolean) => {
    setCloseToTray(!!value);
    return true;
  });

  registerPipHandlers({ pipManager, audioPipManager });
}
