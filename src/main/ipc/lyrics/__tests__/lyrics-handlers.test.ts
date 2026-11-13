import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  handle: vi.fn(),
  isSafeAbsolutePath: vi.fn(),
  readLyrics: vi.fn(),
  warn: vi.fn()
}));

vi.mock('electron', () => ({ ipcMain: { handle: h.handle } }));
vi.mock('../../../../shared/logger', () => ({
  logger: { warn: h.warn, info: vi.fn(), error: vi.fn() }
}));
vi.mock('../../../utils/validate', () => ({ isSafeAbsolutePath: h.isSafeAbsolutePath }));
vi.mock('../lyrics-reader', () => ({ readLyricsForFile: h.readLyrics }));

import { registerLyricsHandlers } from '../lyrics-handlers';

type Handler = (event: unknown, filePath: unknown) => Promise<unknown>;

function lyricsHandler(): Handler {
  registerLyricsHandlers();
  expect(h.handle).toHaveBeenCalledWith('lyrics:get', expect.any(Function));
  return h.handle.mock.calls[0][1] as Handler;
}

beforeEach(() => {
  h.handle.mockClear();
  h.isSafeAbsolutePath.mockReset().mockReturnValue(true);
  h.readLyrics.mockReset().mockResolvedValue({ kind: 'lrc', lines: ['a'] });
  h.warn.mockClear();
});

describe('lyrics:get', () => {
  it('rejects unsafe paths without reading the file', async () => {
    h.isSafeAbsolutePath.mockReturnValue(false);
    const handler = lyricsHandler();

    await expect(handler({}, '../../../etc/passwd')).resolves.toEqual({ kind: 'none', lines: [] });
    expect(h.readLyrics).not.toHaveBeenCalled();
  });

  it('returns parsed lyrics for a safe path', async () => {
    const handler = lyricsHandler();

    await expect(handler({}, 'D:/Music/song.mp3')).resolves.toEqual({ kind: 'lrc', lines: ['a'] });
    expect(h.readLyrics).toHaveBeenCalledWith('D:/Music/song.mp3');
  });

  it('logs and swallows read failures', async () => {
    const error = new Error('read failed');
    h.readLyrics.mockRejectedValue(error);
    const handler = lyricsHandler();

    await expect(handler({}, 'D:/Music/song.mp3')).resolves.toEqual({ kind: 'none', lines: [] });
    expect(h.warn).toHaveBeenCalledWith('lyrics', 'read failed for D:/Music/song.mp3', error);
  });
});
