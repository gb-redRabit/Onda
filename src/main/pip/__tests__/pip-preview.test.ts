import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Okno podglądu PiP: sprawdzamy opcje tworzenia, opóźnione wysłanie motywu
// i locale po `did-finish-load` oraz aktualizacje bounds.
const state = vi.hoisted(() => ({
  window: null as any,
  windowOptions: null as any,
  computePipPosition: vi.fn((opts: Record<string, unknown>) => ({
    x: 11,
    y: 22,
    width: Number(opts.width ?? 0),
    height: Number(opts.height ?? 0)
  }))
}));

vi.mock('electron', () => ({ BrowserWindow: {} }));
vi.mock('../pip-position', () => ({ computePipPosition: state.computePipPosition }));
vi.mock('../../windows/window-factory', () => ({
  createWindow: (options: unknown) => {
    state.windowOptions = options;
    return state.window;
  }
}));
vi.mock('../pip-icon', () => ({ pipWindowIcon: () => 'preview-icon' }));

const { PipPreview } = await import('../pip-preview');

function createWindow(id = 1) {
  const webContents = new EventEmitter() as EventEmitter & {
    id: number;
    send: ReturnType<typeof vi.fn>;
  };
  webContents.id = id;
  webContents.send = vi.fn();
  const win = Object.assign(new EventEmitter(), {
    destroyed: false,
    size: [400, 300] as [number, number],
    webContents,
    isDestroyed: vi.fn(() => win.destroyed),
    show: vi.fn(),
    destroy: vi.fn(() => {
      win.destroyed = true;
    }),
    setBounds: vi.fn(),
    setMenuBarVisibility: vi.fn(),
    getSize: vi.fn(() => win.size)
  });
  return win;
}

let preview: InstanceType<typeof PipPreview>;
let win: ReturnType<typeof createWindow>;

beforeEach(() => {
  win = createWindow();
  state.window = win;
  state.windowOptions = null;
  state.computePipPosition.mockClear();
  preview = new PipPreview();
});

function options(): Record<string, any> {
  return state.windowOptions as Record<string, any>;
}

describe('show', () => {
  it('creates a preview window with defaults and shows it when ready', () => {
    expect(preview.show({})).toBe(true);

    expect(state.computePipPosition).toHaveBeenCalledWith({
      position: undefined,
      width: 480,
      height: 290
    });
    expect(options()).toMatchObject({
      x: 11,
      y: 22,
      width: 480,
      height: 290,
      show: false,
      alwaysOnTop: true,
      frame: false,
      skipTaskbar: true,
      transparent: true,
      autoShow: false,
      htmlFile: 'pip.html',
      hash: 'preview',
      icon: 'preview-icon'
    });
    expect(String(options().webPreferences.preload)).toContain('pip.js');
    expect(win.setMenuBarVisibility).toHaveBeenCalledWith(false);

    options().onReadyToShow();
    expect(win.show).toHaveBeenCalled();
  });

  it('honours explicit size and position', () => {
    preview.show({ position: 'left', width: 640, height: 360 });

    expect(state.computePipPosition).toHaveBeenCalledWith({
      position: 'left',
      width: 640,
      height: 360
    });
    expect(options()).toMatchObject({ width: 640, height: 360 });
  });

  it('replaces an existing preview window and forgets the old one', () => {
    const first = win;
    preview.show({});
    state.window = createWindow(2);
    preview.show({});

    expect(first.destroy).toHaveBeenCalled();
  });

  it('sends theme and locale after the renderer finishes loading', () => {
    preview.show({}, { theme: { '--accent': '#fff' }, locale: 'pl' });
    expect(win.webContents.send).not.toHaveBeenCalled();

    win.webContents.emit('did-finish-load');

    expect(win.webContents.send).toHaveBeenCalledWith('pip:theme', { '--accent': '#fff' });
    expect(win.webContents.send).toHaveBeenCalledWith('pip:locale', 'pl');
  });

  it('keeps the previous theme and locale when show omits them', () => {
    preview.updateTheme({ '--x': '1' });
    preview.updateLocale('de');
    preview.show({});

    win.webContents.emit('did-finish-load');

    expect(win.webContents.send).toHaveBeenCalledWith('pip:theme', { '--x': '1' });
    expect(win.webContents.send).toHaveBeenCalledWith('pip:locale', 'de');
  });

  it('skips sending when the window was destroyed before loading', () => {
    preview.show({});
    win.destroyed = true;
    win.webContents.emit('did-finish-load');
    expect(win.webContents.send).not.toHaveBeenCalled();
  });

  it('notifies the closed handler', () => {
    const closed = vi.fn();
    preview.setClosedHandler(closed);
    preview.show({});

    options().onClosed();

    expect(closed).toHaveBeenCalledTimes(1);
    expect(preview.owns({ id: 1 } as never)).toBe(false);
  });
});

describe('hide and update', () => {
  it('destroys the window and is idempotent', () => {
    preview.show({});
    preview.hide();
    expect(win.destroy).toHaveBeenCalledTimes(1);

    preview.hide();
    expect(win.destroy).toHaveBeenCalledTimes(1);
  });

  it('does not update without a window', () => {
    preview.update({ width: 100 });
    expect(state.computePipPosition).not.toHaveBeenCalled();
  });

  it('keeps the current size unless a new one is given', () => {
    preview.show({});
    state.computePipPosition.mockClear();

    preview.update({ position: 'right' });
    expect(state.computePipPosition).toHaveBeenCalledWith({
      position: 'right',
      width: 400,
      height: 300
    });

    preview.update({ width: 900, height: 500 });
    expect(state.computePipPosition).toHaveBeenLastCalledWith({
      position: undefined,
      width: 900,
      height: 500
    });
    expect(win.setBounds).toHaveBeenCalledWith({ x: 11, y: 22, width: 900, height: 500 });
  });
});

describe('theme, locale and ownership', () => {
  it('stores theme and forwards it to a live window', () => {
    preview.updateTheme({ '--accent': '#000' });
    expect(win.webContents.send).not.toHaveBeenCalled();

    preview.show({});
    preview.updateTheme({ '--accent': '#111' });
    expect(win.webContents.send).toHaveBeenCalledWith('pip:theme', { '--accent': '#111' });
  });

  it('falls back to en for an empty locale', () => {
    preview.show({});
    preview.updateLocale('');
    expect(win.webContents.send).toHaveBeenLastCalledWith('pip:locale', 'en');
  });

  it('recognizes its own webContents only', () => {
    expect(preview.owns({ id: 1 } as never)).toBe(false);

    preview.show({});
    expect(preview.owns({ id: 1 } as never)).toBe(true);
    expect(preview.owns({ id: 2 } as never)).toBe(false);

    win.destroyed = true;
    expect(preview.owns({ id: 1 } as never)).toBe(false);
  });

  it('destroy delegates to hide', () => {
    preview.show({});
    preview.destroy();
    expect(win.destroy).toHaveBeenCalled();
  });
});
