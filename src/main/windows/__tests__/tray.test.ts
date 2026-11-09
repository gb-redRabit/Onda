import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  trayIcon: vi.fn((): any => ({ id: 'icon' })),
  messages: {
    trayPlayPause: 'Play/Pause',
    trayNext: 'Next',
    trayPrevious: 'Previous',
    trayToggleMode: 'Toggle mode',
    trayShow: 'Show',
    trayQuit: 'Quit',
    trayTooltip: 'Onda'
  },
  trayInstances: [] as any[],
  buildFromTemplate: vi.fn(),
  quit: vi.fn()
}));

vi.mock('electron', () => ({
  app: { quit: state.quit },
  Menu: {
    buildFromTemplate: (template: any[]) => {
      state.buildFromTemplate(template);
      return { template };
    }
  },
  Tray: class {
    image: any;
    tooltip = '';
    menu: any = null;
    handlers = new Map<string, () => void>();
    destroyed = false;
    setToolTip = vi.fn((value: string) => {
      this.tooltip = value;
    });
    setContextMenu = vi.fn((menu: any) => {
      this.menu = menu;
    });
    on = vi.fn((event: string, handler: () => void) => {
      this.handlers.set(event, handler);
    });
    destroy = vi.fn(() => {
      this.destroyed = true;
    });
    isDestroyed = vi.fn(() => this.destroyed);
    constructor(image: any) {
      this.image = image;
      state.trayInstances.push(this);
    }
  }
}));
vi.mock('../window-icon', () => ({ trayIcon: state.trayIcon }));
vi.mock('../../i18n-main', () => ({ mainMessages: () => state.messages }));

import { destroyTray, hasTray, refreshTray, setupTray, type TrayModeOptions } from '../tray';

function shell(overrides: Record<string, unknown> = {}) {
  return {
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    webContents: { send: vi.fn() },
    ...overrides
  } as any;
}

function lastTray() {
  return state.trayInstances.at(-1);
}

function template() {
  return state.buildFromTemplate.mock.calls.at(-1)![0] as any[];
}

beforeEach(() => {
  state.trayInstances = [];
  state.trayIcon.mockClear();
  state.trayIcon.mockReturnValue({ id: 'icon' });
  state.buildFromTemplate.mockClear();
  state.quit.mockReset();
  destroyTray();
});

describe('setup', () => {
  it('does nothing without an icon', () => {
    state.trayIcon.mockReturnValueOnce(null);
    setupTray(() => shell());

    expect(state.trayInstances).toHaveLength(0);
    expect(hasTray()).toBe(false);
  });

  it('creates the tray and menu', () => {
    const win = shell();
    setupTray(() => win);

    const tray = lastTray();
    expect(tray.image).toEqual({ id: 'icon' });
    expect(tray.tooltip).toBe('Onda');
    expect(tray.menu).toBeTruthy();
    expect(hasTray()).toBe(true);
    expect(template().map((item) => item.label ?? item.type)).toEqual([
      'Play/Pause',
      'Next',
      'Previous',
      'separator',
      'Show',
      'separator',
      'Quit'
    ]);
  });

  it('reuses the existing tray on later setups', () => {
    setupTray(() => shell());
    setupTray(() => shell());

    expect(state.trayInstances).toHaveLength(1);
    expect(lastTray().setToolTip).toHaveBeenCalledTimes(2);
  });

  it('adds the mode toggle when allowed', () => {
    const toggleMode = vi.fn();
    const mode: TrayModeOptions = { canToggleMode: () => true, toggleMode };
    setupTray(() => shell(), mode);

    const items = template();
    const toggle = items.find((item) => item.label === 'Toggle mode');
    expect(toggle).toBeTruthy();
    toggle.click();
    expect(toggleMode).toHaveBeenCalledTimes(1);
  });

  it('omits the mode toggle when disallowed or missing', () => {
    const mode: TrayModeOptions = { canToggleMode: () => false, toggleMode: vi.fn() };
    setupTray(() => shell(), mode);
    expect(template().some((item) => item.label === 'Toggle mode')).toBe(false);

    setupTray(() => shell());
    expect(template().some((item) => item.label === 'Toggle mode')).toBe(false);
  });
});

describe('menu actions', () => {
  it('sends media commands to the shell window', () => {
    const win = shell();
    setupTray(() => win);
    const items = template();

    for (const label of ['Play/Pause', 'Next', 'Previous']) {
      items.find((item) => item.label === label).click();
    }

    expect(win.webContents.send.mock.calls).toEqual([
      ['media:playPause'],
      ['media:next'],
      ['media:previous']
    ]);
  });

  it('ignores clicks without a live shell window', () => {
    const destroyed = shell({ isDestroyed: vi.fn(() => true) });
    setupTray(() => destroyed);
    const items = template();

    items.find((item) => item.label === 'Play/Pause').click();
    expect(destroyed.webContents.send).not.toHaveBeenCalled();

    setupTray(() => null);
    expect(() =>
      template()
        .find((item) => item.label === 'Next')
        .click()
    ).not.toThrow();
  });

  it('restores and focuses a minimized window', () => {
    const win = shell({ isMinimized: vi.fn(() => true) });
    setupTray(() => win);

    template()
      .find((item) => item.label === 'Show')
      .click();

    expect(win.restore).toHaveBeenCalledTimes(1);
    expect(win.show).toHaveBeenCalledTimes(1);
    expect(win.focus).toHaveBeenCalledTimes(1);
  });

  it('shows the window on double click', () => {
    const win = shell();
    setupTray(() => win);

    lastTray().handlers.get('double-click')();

    expect(win.show).toHaveBeenCalledTimes(1);
  });

  it('quits through the tray menu', () => {
    setupTray(() => shell());

    template()
      .find((item) => item.label === 'Quit')
      .click();

    expect(hasTray()).toBe(false);
    expect(state.quit).toHaveBeenCalledTimes(1);
  });
});

describe('refresh and teardown', () => {
  it('refreshes labels after a locale change', () => {
    setupTray(() => shell());
    state.messages = { ...state.messages, trayTooltip: 'Onda PL', trayShow: 'Pokaż' };

    refreshTray();

    expect(lastTray().tooltip).toBe('Onda PL');
    expect(template().some((item) => item.label === 'Pokaż')).toBe(true);
  });

  it('does nothing without a tray or after destruction', () => {
    expect(() => refreshTray()).not.toThrow();

    setupTray(() => shell());
    const tray = lastTray();
    tray.isDestroyed.mockReturnValue(true);

    refreshTray();
    expect(tray.setToolTip).toHaveBeenCalledTimes(1);
  });

  it('destroys the tray safely', () => {
    setupTray(() => shell());
    const tray = lastTray();

    destroyTray();

    expect(tray.destroy).toHaveBeenCalledTimes(1);
    expect(hasTray()).toBe(false);
  });

  it('swallows destroy errors', () => {
    setupTray(() => shell());
    lastTray().destroy.mockImplementation(() => {
      throw new Error('gone');
    });

    expect(() => destroyTray()).not.toThrow();
    expect(hasTray()).toBe(false);
  });

  it('can be destroyed twice', () => {
    setupTray(() => shell());
    destroyTray();
    expect(() => destroyTray()).not.toThrow();
  });
});
