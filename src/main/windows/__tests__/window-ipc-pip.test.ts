import { beforeEach, describe, expect, it, vi } from 'vitest';

// Cienka warstwa IPC: sprawdzamy mapowanie argumentów i wywołania managerów.
const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  pip: {
    show: vi.fn(() => true),
    stop: vi.fn(),
    showPreview: vi.fn(() => true),
    hidePreview: vi.fn(),
    updatePreview: vi.fn(),
    preload: vi.fn(),
    loadTrack: vi.fn(),
    updateSubtitle: vi.fn()
  },
  audio: {
    show: vi.fn(),
    hide: vi.fn(),
    releaseWindow: vi.fn(),
    autoHideNow: vi.fn(),
    prewarm: vi.fn(),
    showPreview: vi.fn(() => true),
    hidePreview: vi.fn(),
    updatePreview: vi.fn(),
    setLayout: vi.fn(),
    update: vi.fn()
  }
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => {
      mocks.handlers.set(channel, handler);
    }
  }
}));

const { registerPipHandlers } = await import('../window-ipc-pip');
registerPipHandlers({ pipManager: mocks.pip as never, audioPipManager: mocks.audio as never });

function handler(channel: string): (...args: any[]) => any {
  const found = mocks.handlers.get(channel);
  if (!found) throw new Error(`${channel} was not registered`);
  return found;
}

beforeEach(() => {
  for (const manager of [mocks.pip, mocks.audio]) {
    for (const fn of Object.values(manager)) fn.mockClear();
  }
  mocks.pip.show.mockReturnValue(true);
  mocks.pip.showPreview.mockReturnValue(true);
  mocks.audio.showPreview.mockReturnValue(true);
});

describe('registration', () => {
  it('registers every video and audio PiP channel', () => {
    expect([...mocks.handlers.keys()]).toEqual(
      expect.arrayContaining([
        'pip:start',
        'pip:stop',
        'pip:previewStart',
        'pip:previewStop',
        'pip:previewUpdate',
        'pip:preload',
        'pip:loadtrack',
        'pip:updateSubtitle',
        'audio-pip:show',
        'audio-pip:hide',
        'audio-pip:release',
        'audio-pip:autoHide',
        'audio-pip:prewarm',
        'audio-pip:previewStart',
        'audio-pip:previewStop',
        'audio-pip:previewUpdate',
        'audio-pip:update'
      ])
    );
  });
});

describe('video PiP', () => {
  it('maps minimal start options to defaults', async () => {
    expect(await handler('pip:start')({}, '/video.mp4')).toBe(true);
    expect(mocks.pip.show).toHaveBeenCalledWith({
      src: '/video.mp4',
      startTime: 0,
      position: undefined,
      width: undefined,
      height: undefined,
      subtitle: null
    });
  });

  it('passes through all start options', async () => {
    const subtitle = { subContent: 'Hello' };
    await handler('pip:start')({}, '/video.mp4', {
      startTime: 12,
      position: 'top-right',
      width: 640,
      height: 360,
      subtitle
    });
    expect(mocks.pip.show).toHaveBeenCalledWith({
      src: '/video.mp4',
      startTime: 12,
      position: 'top-right',
      width: 640,
      height: 360,
      subtitle
    });
  });

  it('stops the video PiP', async () => {
    expect(await handler('pip:stop')({})).toBe(true);
    expect(mocks.pip.stop).toHaveBeenCalled();
  });

  it('delegates preview lifecycle', async () => {
    const opts = { position: 'left', width: 320, height: 180 };
    expect(await handler('pip:previewStart')({}, opts)).toBe(true);
    expect(mocks.pip.showPreview).toHaveBeenCalledWith(opts);

    expect(await handler('pip:previewUpdate')({}, opts)).toBe(true);
    expect(mocks.pip.updatePreview).toHaveBeenCalledWith(opts);

    expect(await handler('pip:previewStop')({})).toBe(true);
    expect(mocks.pip.hidePreview).toHaveBeenCalled();
  });

  it('delegates preload, loadtrack and subtitle updates', async () => {
    const subtitle = { subContent: 'x' };
    await handler('pip:preload')({}, '/video.mp4', subtitle);
    expect(mocks.pip.preload).toHaveBeenCalledWith('/video.mp4', subtitle);

    await handler('pip:loadtrack')({}, '/next.mp4', null);
    expect(mocks.pip.loadTrack).toHaveBeenCalledWith('/next.mp4', null);

    await handler('pip:updateSubtitle')({}, subtitle);
    expect(mocks.pip.updateSubtitle).toHaveBeenCalledWith(subtitle);
  });
});

describe('audio PiP', () => {
  const state = { trackName: 'Song', artist: 'Artist' };

  it('shows with defaults and passes layout options through', async () => {
    expect(await handler('audio-pip:show')({}, state)).toBe(true);
    expect(mocks.audio.show).toHaveBeenLastCalledWith(state, {});

    await handler('audio-pip:show')({}, state, { dock: 'left' });
    expect(mocks.audio.show).toHaveBeenLastCalledWith(state, { dock: 'left' });
  });

  it('hides, releases, autohides and prewarms', async () => {
    expect(await handler('audio-pip:hide')({})).toBe(true);
    expect(mocks.audio.hide).toHaveBeenCalled();

    expect(await handler('audio-pip:release')({})).toBe(true);
    expect(mocks.audio.releaseWindow).toHaveBeenCalled();

    expect(await handler('audio-pip:autoHide')({})).toBe(true);
    expect(mocks.audio.autoHideNow).toHaveBeenCalled();

    expect(await handler('audio-pip:prewarm')({})).toBe(true);
    expect(mocks.audio.prewarm).toHaveBeenCalled();
  });

  it('delegates preview lifecycle with empty defaults', async () => {
    expect(await handler('audio-pip:previewStart')({})).toBe(true);
    expect(mocks.audio.showPreview).toHaveBeenCalledWith({});

    expect(await handler('audio-pip:previewUpdate')({})).toBe(true);
    expect(mocks.audio.updatePreview).toHaveBeenCalledWith({});

    expect(await handler('audio-pip:previewStop')({})).toBe(true);
    expect(mocks.audio.hidePreview).toHaveBeenCalled();
  });

  it('applies a layout only when options actually change something', async () => {
    await handler('audio-pip:update')({}, state, { dock: 'bottom' });
    expect(mocks.audio.setLayout).toHaveBeenCalledWith({ dock: 'bottom' });
    expect(mocks.audio.update).toHaveBeenCalledWith(state);

    mocks.audio.setLayout.mockClear();
    await handler('audio-pip:update')({}, state, {});
    expect(mocks.audio.setLayout).not.toHaveBeenCalled();
    expect(mocks.audio.update).toHaveBeenCalledWith(state);

    mocks.audio.setLayout.mockClear();
    await handler('audio-pip:update')({}, state);
    expect(mocks.audio.setLayout).not.toHaveBeenCalled();
    expect(mocks.audio.update).toHaveBeenCalledWith(state);
  });

  it('treats an explicit autoHide=false as a layout change', async () => {
    await handler('audio-pip:update')({}, state, { autoHide: false });
    expect(mocks.audio.setLayout).toHaveBeenCalledWith({ autoHide: false });
  });
});
