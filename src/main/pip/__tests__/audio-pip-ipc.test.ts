import { beforeEach, describe, expect, it, vi } from 'vitest';

// Kanały `audio-pip:*`: sprawdzamy bramkę preview i delegację do hosta.
const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (...args: any[]) => any>(),
  removed: [] as string[],
  sendToWindow: vi.fn(),
  host: {
    mainWindow: vi.fn(),
    isPreview: vi.fn(() => false),
    onTimeUpdate: vi.fn(),
    onVizData: vi.fn(),
    setTheme: vi.fn(),
    setMouseInside: vi.fn(),
    unpeek: vi.fn(),
    schedulePeek: vi.fn()
  }
}));

vi.mock('electron', () => ({
  ipcMain: {
    on: (channel: string, handler: (...args: any[]) => any) => {
      mocks.listeners.set(channel, handler);
    },
    removeAllListeners: (channel: string) => {
      mocks.removed.push(channel);
      mocks.listeners.delete(channel);
    }
  }
}));
vi.mock('../../utils/broadcast', () => ({ sendToWindow: mocks.sendToWindow }));

const { registerAudioPipIpc, removeAudioPipIpc } = await import('../audio-pip-ipc');

function listener(channel: string): (...args: any[]) => any {
  const found = mocks.listeners.get(channel);
  if (!found) throw new Error(`${channel} was not registered`);
  return found;
}

beforeEach(() => {
  mocks.listeners.clear();
  mocks.removed = [];
  for (const fn of Object.values(mocks.host)) fn.mockClear();
  mocks.host.mainWindow.mockReturnValue(null);
  mocks.host.isPreview.mockReturnValue(false);
  mocks.sendToWindow.mockClear();
  registerAudioPipIpc(mocks.host as never);
});

describe('showMain', () => {
  it('does nothing without a main window', () => {
    listener('audio-pip:showMain')();
    expect(mocks.sendToWindow).not.toHaveBeenCalled();
  });

  it('ignores a destroyed main window', () => {
    const win = {
      isDestroyed: () => true,
      isMinimized: vi.fn(),
      restore: vi.fn(),
      show: vi.fn(),
      moveTop: vi.fn(),
      focus: vi.fn()
    };
    mocks.host.mainWindow.mockReturnValue(win);
    listener('audio-pip:showMain')();
    expect(win.show).not.toHaveBeenCalled();
  });

  it('restores a minimized window and brings it to front', () => {
    const win = {
      isDestroyed: () => false,
      isMinimized: () => true,
      restore: vi.fn(),
      show: vi.fn(),
      moveTop: vi.fn(),
      focus: vi.fn()
    };
    mocks.host.mainWindow.mockReturnValue(win);

    listener('audio-pip:showMain')();

    expect(win.restore).toHaveBeenCalled();
    expect(win.show).toHaveBeenCalled();
    expect(win.moveTop).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
  });

  it('does not restore a window that is already visible', () => {
    const win = {
      isDestroyed: () => false,
      isMinimized: () => false,
      restore: vi.fn(),
      show: vi.fn(),
      moveTop: vi.fn(),
      focus: vi.fn()
    };
    mocks.host.mainWindow.mockReturnValue(win);

    listener('audio-pip:showMain')();

    expect(win.restore).not.toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
  });
});

describe('actions forwarded to the main window', () => {
  it('forwards action and progress click', () => {
    const main = {};
    mocks.host.mainWindow.mockReturnValue(main);

    listener('audio-pip:action')({}, 'play');
    expect(mocks.sendToWindow).toHaveBeenCalledWith(main, 'audio-pip:action', 'play');

    listener('audio-pip:progressClick')({}, 0.5);
    expect(mocks.sendToWindow).toHaveBeenCalledWith(main, 'audio-pip:progressClick', 0.5);
  });

  it('drops actions while the preview is open', () => {
    mocks.host.isPreview.mockReturnValue(true);
    listener('audio-pip:action')({}, 'play');
    listener('audio-pip:progressClick')({}, 0.5);
    expect(mocks.sendToWindow).not.toHaveBeenCalled();
  });

  it('forwards time and visualizer data only outside preview', () => {
    const state = { trackName: 'Song', currentTime: 2 };
    listener('audio-pip:timeUpdate')({}, state);
    listener('audio-pip:vizData')({}, [1, 2]);

    expect(mocks.host.onTimeUpdate).toHaveBeenCalledWith(state);
    expect(mocks.host.onVizData).toHaveBeenCalledWith([1, 2]);

    mocks.host.isPreview.mockReturnValue(true);
    listener('audio-pip:timeUpdate')({}, state);
    listener('audio-pip:vizData')({}, [3]);
    expect(mocks.host.onTimeUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.host.onVizData).toHaveBeenCalledTimes(1);
  });
});

describe('peek and theme events', () => {
  it('unpeeks and schedules the peek delay with the matching mouse state', () => {
    listener('audio-pip:unpeek')();
    expect(mocks.host.setMouseInside).toHaveBeenCalledWith(true);
    expect(mocks.host.unpeek).toHaveBeenCalled();

    listener('audio-pip:peekDelay')();
    expect(mocks.host.setMouseInside).toHaveBeenCalledWith(false);
    expect(mocks.host.schedulePeek).toHaveBeenCalled();
  });

  it('forwards theme variables', () => {
    listener('audio-pip:theme')({}, { '--accent': '#fff' });
    expect(mocks.host.setTheme).toHaveBeenCalledWith({ '--accent': '#fff' });
  });
});

describe('removeAudioPipIpc', () => {
  it('removes every listener it registered', () => {
    removeAudioPipIpc();

    expect(mocks.removed.sort()).toEqual(
      [
        'audio-pip:showMain',
        'audio-pip:action',
        'audio-pip:progressClick',
        'audio-pip:unpeek',
        'audio-pip:peekDelay',
        'audio-pip:theme',
        'audio-pip:timeUpdate',
        'audio-pip:vizData'
      ].sort()
    );
    expect(mocks.listeners.size).toBe(0);
  });
});
