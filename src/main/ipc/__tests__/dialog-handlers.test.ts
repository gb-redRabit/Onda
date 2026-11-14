import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => any>,
  fromWebContents: vi.fn(),
  getFocusedWindow: vi.fn(),
  getAllWindows: vi.fn(),
  showOpenDialog: vi.fn(),
  readdir: vi.fn(),
  addAllowedRoot: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn()
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => any) => {
      state.handlers[channel] = fn;
    }
  },
  dialog: { showOpenDialog: state.showOpenDialog },
  BrowserWindow: {
    fromWebContents: state.fromWebContents,
    getFocusedWindow: state.getFocusedWindow,
    getAllWindows: state.getAllWindows
  }
}));
vi.mock('fs/promises', () => ({ readdir: state.readdir }));
vi.mock('path', () => ({
  join: (a: string, b: string) => `${a}/${b}`,
  extname: (p: string) => {
    const index = p.lastIndexOf('.');
    return index > 0 ? p.slice(index) : '';
  },
  dirname: (p: string) => p.slice(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))) || p
}));
vi.mock('../../../shared/constants', () => ({
  VIDEO_EXTS: ['.mp4', '.mkv'],
  AUDIO_EXTS: ['.mp3', '.flac']
}));
vi.mock('../../media/media-server', () => ({ addAllowedRoot: state.addAllowedRoot }));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: state.warn, info: state.info, error: state.error }
}));

async function load() {
  const module = await import('../dialog-handlers');
  module.registerDialogHandlers();
  return state.handlers;
}

function result(canceled = false, filePaths: string[] = ['C:/pictures/a.png']) {
  return { canceled, filePaths };
}

beforeEach(() => {
  state.handlers = {};
  for (const value of Object.values(state)) {
    if (value && typeof value === 'object' && 'mockReset' in value) {
      (value as { mockReset: () => void }).mockReset();
    }
  }
  state.fromWebContents.mockReturnValue({ id: 1 });
  state.getFocusedWindow.mockReturnValue({ id: 2 });
  state.getAllWindows.mockReturnValue([{ id: 3 }, { id: 4 }]);
  state.showOpenDialog.mockResolvedValue(result());
  state.readdir.mockResolvedValue([]);
  state.addAllowedRoot.mockResolvedValue(undefined);
});

const sender = { id: 1 } as never;

describe('registration and parent window', () => {
  it('registers every dialog channel', async () => {
    const h = await load();
    expect(Object.keys(h)).toEqual(
      expect.arrayContaining([
        'dialog:openImage',
        'dialog:openSubtitle',
        'dialog:openFile',
        'dialog:openFolder',
        'dialog:openFolderFiles'
      ])
    );
  });

  it('uses the sender window first, then focused and finally any window', async () => {
    const h = await load();

    await h['dialog:openImage']({ sender });
    expect(state.showOpenDialog).toHaveBeenLastCalledWith(
      { id: 1 },
      expect.objectContaining({ properties: ['openFile'] })
    );

    state.fromWebContents.mockReturnValue(null);
    await h['dialog:openImage']({ sender });
    expect(state.showOpenDialog).toHaveBeenLastCalledWith(
      { id: 2 },
      expect.objectContaining({ properties: ['openFile'] })
    );

    state.getFocusedWindow.mockReturnValue(null);
    await h['dialog:openImage']({ sender });
    expect(state.showOpenDialog).toHaveBeenLastCalledWith(
      { id: 3 },
      expect.objectContaining({ properties: ['openFile'] })
    );

    state.getAllWindows.mockReturnValue([]);
    await h['dialog:openImage']({ sender });
    expect(state.showOpenDialog).toHaveBeenLastCalledWith(
      expect.objectContaining({ properties: ['openFile'] })
    );
  });

  it('opens every dialog without a parent window when none exists', async () => {
    const h = await load();
    state.fromWebContents.mockReturnValue(null);
    state.getFocusedWindow.mockReturnValue(null);
    state.getAllWindows.mockReturnValue([]);
    state.showOpenDialog.mockResolvedValue(result(true, []));

    await h['dialog:openImage']({ sender });
    await h['dialog:openSubtitle']({ sender });
    await h['dialog:openFile']({ sender });
    await h['dialog:openFolder']({ sender });
    await h['dialog:openFolderFiles']({ sender });

    expect(state.showOpenDialog).toHaveBeenCalledTimes(5);
    for (const call of state.showOpenDialog.mock.calls) {
      expect(call).toHaveLength(1);
    }
  });

  it('covers confirmed and canceled selections in one module instance', async () => {
    const h = await load();

    state.showOpenDialog
      .mockResolvedValueOnce(result(false, ['C:/subs/a.srt']))
      .mockResolvedValueOnce(result(true, []));
    await h['dialog:openSubtitle']({ sender });
    await h['dialog:openSubtitle']({ sender });

    state.showOpenDialog
      .mockResolvedValueOnce(result(false, ['C:/media/a.mp4']))
      .mockResolvedValueOnce(result(true, []));
    await h['dialog:openFile']({ sender });
    await h['dialog:openFile']({ sender });

    state.showOpenDialog
      .mockResolvedValueOnce(result(false, ['C:/folder']))
      .mockResolvedValueOnce(result(true, []));
    await h['dialog:openFolder']({ sender });
    await h['dialog:openFolder']({ sender });
  });
});

describe('openImage', () => {
  it('grants the parent folder and returns copies of the paths', async () => {
    const h = await load();
    const paths = ['C:/pictures/a.png', 'D:/photos/b.jpg'];
    state.showOpenDialog.mockResolvedValueOnce(result(false, paths));

    const response = await h['dialog:openImage']({ sender });
    expect(response).toEqual({ canceled: false, filePaths: paths });
    expect(response.filePaths).not.toBe(paths);
    expect(state.addAllowedRoot).toHaveBeenNthCalledWith(1, 'C:/pictures');
    expect(state.addAllowedRoot).toHaveBeenNthCalledWith(2, 'D:/photos');
    expect(state.showOpenDialog.mock.calls[0][1].filters[0]).toMatchObject({
      name: 'Images',
      extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp']
    });
  });

  it('skips root grants on cancel and reports failures', async () => {
    const h = await load();
    state.showOpenDialog.mockResolvedValueOnce(result(true, ['ignored']));
    expect(await h['dialog:openImage']({ sender })).toEqual({
      canceled: true,
      filePaths: ['ignored']
    });
    expect(state.addAllowedRoot).not.toHaveBeenCalled();

    state.showOpenDialog.mockRejectedValueOnce(new Error('boom'));
    expect(await h['dialog:openImage']({ sender })).toEqual({
      canceled: true,
      filePaths: []
    });
    expect(state.warn).toHaveBeenCalledWith('dialog', 'openImage failed', expect.any(Error));
  });

  it('propagates root-grant failures as a canceled dialog', async () => {
    const h = await load();
    state.addAllowedRoot.mockRejectedValueOnce(new Error('policy'));
    expect(await h['dialog:openImage']({ sender })).toEqual({
      canceled: true,
      filePaths: []
    });
  });
});

describe('openSubtitle', () => {
  it('offers subtitle filters and grants each parent folder', async () => {
    const h = await load();
    state.showOpenDialog.mockResolvedValueOnce(result(false, ['C:/subs/a.srt', 'C:/subs/b.ass']));

    expect(await h['dialog:openSubtitle']({ sender })).toEqual({
      canceled: false,
      filePaths: ['C:/subs/a.srt', 'C:/subs/b.ass']
    });
    const options = state.showOpenDialog.mock.calls[0][1];
    expect(options.properties).toEqual(['openFile', 'multiSelections']);
    expect(options.filters).toEqual([
      { name: 'Subtitles', extensions: ['srt', 'ass', 'ssa', 'vtt', 'sub'] },
      { name: 'All Files', extensions: ['*'] }
    ]);
    expect(state.addAllowedRoot).toHaveBeenCalledWith('C:/subs');
  });

  it('handles cancellation and errors', async () => {
    const h = await load();
    state.showOpenDialog.mockResolvedValueOnce(result(true, []));
    expect(await h['dialog:openSubtitle']({ sender })).toEqual({
      canceled: true,
      filePaths: []
    });
    expect(state.addAllowedRoot).not.toHaveBeenCalled();

    state.showOpenDialog.mockRejectedValueOnce(new Error('boom'));
    expect(await h['dialog:openSubtitle']({ sender })).toEqual({
      canceled: true,
      filePaths: []
    });
    expect(state.warn).toHaveBeenCalledWith('dialog', 'openSubtitle failed', expect.any(Error));
  });
});

describe('openFile', () => {
  it('merges caller options into the media dialog', async () => {
    const h = await load();
    state.showOpenDialog.mockResolvedValueOnce(result(false, ['C:/media/a.mp4', 'C:/media/b.mp3']));

    const response = await h['dialog:openFile'](
      { sender },
      { title: 'Pick media', filters: [{ name: 'Custom', extensions: ['x'] }] }
    );
    expect(response).toEqual({
      canceled: false,
      filePaths: ['C:/media/a.mp4', 'C:/media/b.mp3']
    });

    const options = state.showOpenDialog.mock.calls[0][1];
    expect(options.title).toBe('Pick media');
    expect(options.filters).toEqual([{ name: 'Custom', extensions: ['x'] }]);
    expect(options.properties).toEqual(['openFile', 'multiSelections']);
    expect(state.addAllowedRoot).toHaveBeenCalledWith('C:/media');
    expect(state.info).toHaveBeenCalledWith('dialog', 'openFile result: canceled=false paths=2');
    expect(state.info).toHaveBeenCalledWith('dialog', 'openFile granted root: C:/media');
  });

  it('uses default filters without options', async () => {
    const h = await load();
    await h['dialog:openFile']({ sender });
    const options = state.showOpenDialog.mock.calls[0][1];
    expect(options.filters[0].extensions).toEqual([
      'mp3',
      'flac',
      'wav',
      'ogg',
      'aac',
      'm4a',
      'mp4',
      'mkv',
      'avi',
      'webm',
      'mov'
    ]);
    expect(options.filters[1]).toEqual({ name: 'All Files', extensions: ['*'] });
    expect(state.info).toHaveBeenCalledWith('dialog', 'openFile result: canceled=false paths=1');
  });

  it('skips grants on cancel and reports failures', async () => {
    const h = await load();
    state.showOpenDialog.mockResolvedValueOnce(result(true, ['C:/x']));
    await h['dialog:openFile']({ sender });
    expect(state.addAllowedRoot).not.toHaveBeenCalled();

    state.showOpenDialog.mockRejectedValueOnce(new Error('boom'));
    expect(await h['dialog:openFile']({ sender })).toEqual({
      canceled: true,
      filePaths: []
    });
    expect(state.warn).toHaveBeenCalledWith('dialog', 'openFile failed', expect.any(Error));
  });
});

describe('openFolder', () => {
  it('grants the folder and returns paths', async () => {
    const h = await load();
    state.showOpenDialog.mockResolvedValueOnce(result(false, ['C:/folder']));
    expect(await h['dialog:openFolder']({ sender })).toEqual(['C:/folder']);
    expect(state.addAllowedRoot).toHaveBeenCalledWith('C:/folder');
    expect(state.showOpenDialog.mock.calls[0][1]).toEqual({ properties: ['openDirectory'] });
  });

  it('returns an empty list on cancel or failure', async () => {
    const h = await load();
    state.showOpenDialog.mockResolvedValueOnce(result(true, ['ignored']));
    expect(await h['dialog:openFolder']({ sender })).toEqual([]);

    state.showOpenDialog.mockRejectedValueOnce(new Error('boom'));
    expect(await h['dialog:openFolder']({ sender })).toEqual([]);
    expect(state.warn).toHaveBeenCalledWith('dialog', 'openFolder failed', expect.any(Error));
  });
});

describe('openFolderFiles', () => {
  it('returns sorted media files from the selected folder', async () => {
    const h = await load();
    state.showOpenDialog.mockResolvedValueOnce(result(false, ['C:/media']));
    state.readdir.mockResolvedValue(['b.mp4', 'a.mp3', 'notes.txt', 'C.FLAC', 'd.mkv']);

    expect(await h['dialog:openFolderFiles']({ sender })).toEqual({
      canceled: false,
      filePaths: ['C:/media/a.mp3', 'C:/media/b.mp4', 'C:/media/C.FLAC', 'C:/media/d.mkv']
    });
    expect(state.addAllowedRoot).toHaveBeenCalledWith('C:/media');
  });

  it('sorts numerically by name', async () => {
    const h = await load();
    state.readdir.mockResolvedValue(['track10.mp3', 'track2.mp3', 'track1.mp3']);
    state.showOpenDialog.mockResolvedValueOnce(result(false, ['C:/music']));
    const response = await h['dialog:openFolderFiles']({ sender });
    expect(response.filePaths).toEqual([
      'C:/music/track1.mp3',
      'C:/music/track2.mp3',
      'C:/music/track10.mp3'
    ]);
  });

  it('returns canceled for a canceled or empty selection', async () => {
    const h = await load();
    state.showOpenDialog.mockResolvedValueOnce(result(true, ['C:/ignored']));
    expect(await h['dialog:openFolderFiles']({ sender })).toEqual({
      canceled: true,
      filePaths: []
    });

    state.showOpenDialog.mockResolvedValueOnce(result(false, []));
    expect(await h['dialog:openFolderFiles']({ sender })).toEqual({
      canceled: true,
      filePaths: []
    });
  });

  it('returns an empty success for a blank folder path', async () => {
    const h = await load();
    state.showOpenDialog.mockResolvedValueOnce(result(false, ['']));
    expect(await h['dialog:openFolderFiles']({ sender })).toEqual({
      canceled: false,
      filePaths: []
    });
    expect(state.readdir).not.toHaveBeenCalled();
  });

  it('returns no files when readdir fails', async () => {
    const h = await load();
    state.showOpenDialog.mockResolvedValueOnce(result(false, ['C:/media']));
    state.readdir.mockRejectedValueOnce(new Error('denied'));
    expect(await h['dialog:openFolderFiles']({ sender })).toEqual({
      canceled: false,
      filePaths: []
    });
    expect(state.warn).toHaveBeenCalledWith(
      'dialog',
      'openFolderFiles readdir failed for C:/media',
      expect.any(Error)
    );
  });

  it('reports dialog and root failures as canceled', async () => {
    const h = await load();
    state.showOpenDialog.mockRejectedValueOnce(new Error('boom'));
    expect(await h['dialog:openFolderFiles']({ sender })).toEqual({
      canceled: true,
      filePaths: []
    });
    expect(state.warn).toHaveBeenCalledWith('dialog', 'openFolderFiles failed', expect.any(Error));

    state.showOpenDialog.mockResolvedValueOnce(result(false, ['C:/media']));
    state.addAllowedRoot.mockRejectedValueOnce(new Error('policy'));
    expect(await h['dialog:openFolderFiles']({ sender })).toEqual({
      canceled: true,
      filePaths: []
    });
  });
});
