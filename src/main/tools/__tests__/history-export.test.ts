import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  fromWebContents: vi.fn(),
  showSaveDialog: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  loadLibrary: vi.fn(),
  isProtected: vi.fn(),
  isSafe: vi.fn(),
  loggerWarn: vi.fn(),
  buildRows: vi.fn(),
  serialize: vi.fn()
}));

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: h.fromWebContents },
  dialog: { showSaveDialog: h.showSaveDialog }
}));
vi.mock('fs/promises', () => ({ mkdir: h.mkdir, writeFile: h.writeFile }));
vi.mock('../../ipc/library/library-store', () => ({ loadLibraryScanned: h.loadLibrary }));
vi.mock('../../path-policy', () => ({ isProtectedPath: h.isProtected }));
vi.mock('../../utils/validate', () => ({ isSafeAbsolutePath: h.isSafe }));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: h.loggerWarn, info: vi.fn(), error: vi.fn() }
}));
vi.mock('../history-format', () => ({
  buildHistoryRows: h.buildRows,
  serializeHistory: h.serialize
}));

import { exportHistory } from '../history-export';

const event = { sender: {} } as never;
const window = { id: 1 };

beforeEach(() => {
  h.fromWebContents.mockReset();
  h.fromWebContents.mockReturnValue(window);
  h.showSaveDialog.mockReset();
  h.showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'D:/out/history.json' });
  h.mkdir.mockReset();
  h.mkdir.mockResolvedValue(undefined);
  h.writeFile.mockReset();
  h.writeFile.mockResolvedValue(undefined);
  h.loadLibrary.mockReset();
  h.loadLibrary.mockResolvedValue({ files: [{ path: 'a.mp3' }] });
  h.isProtected.mockReset();
  h.isProtected.mockReturnValue(false);
  h.isSafe.mockReset();
  h.isSafe.mockReturnValue(true);
  h.loggerWarn.mockReset();
  h.buildRows.mockReset();
  h.buildRows.mockReturnValue([{ title: 'A' }]);
  h.serialize.mockReset();
  h.serialize.mockReturnValue('serialized');
});

describe('validation', () => {
  it('rejects malformed requests', async () => {
    for (const request of [null, undefined, 'x', 42, []]) {
      await expect(exportHistory(event, request)).resolves.toEqual({
        success: false,
        error: 'Invalid request'
      });
    }
    expect(h.loadLibrary).not.toHaveBeenCalled();
  });

  it('falls back to csv/all/lastPlayed and only played rows', async () => {
    const result = await exportHistory(event, {});

    expect(h.buildRows).toHaveBeenCalledWith([{ path: 'a.mp3' }], {
      onlyPlayed: true,
      type: 'all',
      sort: 'lastPlayed'
    });
    expect(h.serialize).toHaveBeenCalledWith([{ title: 'A' }], 'csv');
    expect(result).toMatchObject({ success: true, rows: 1, bytes: 10 });
    expect(h.showSaveDialog).toHaveBeenCalledWith(
      window,
      expect.objectContaining({
        title: 'Export history',
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      })
    );
  });

  it('honours explicit format, type, sort and onlyPlayed', async () => {
    await exportHistory(event, {
      format: 'json',
      type: 'video',
      sort: 'playCount',
      onlyPlayed: false
    });

    expect(h.buildRows).toHaveBeenCalledWith(expect.any(Array), {
      onlyPlayed: false,
      type: 'video',
      sort: 'playCount'
    });
    expect(h.serialize).toHaveBeenCalledWith(expect.any(Array), 'json');
    expect(h.showSaveDialog).toHaveBeenCalledWith(
      window,
      expect.objectContaining({
        filters: [{ name: 'JSON', extensions: ['json'] }],
        defaultPath: expect.stringMatching(/^onda-history-\d{4}-\d{2}-\d{2}\.json$/)
      })
    );
  });

  it('handles a missing library snapshot', async () => {
    h.loadLibrary.mockResolvedValueOnce(null);

    await exportHistory(event, {});

    expect(h.buildRows).toHaveBeenCalledWith([], expect.any(Object));
  });
});

describe('output paths', () => {
  it('writes directly to a safe explicit path', async () => {
    const result = await exportHistory(event, { outputPath: '  D:/out/h.csv  ' });

    expect(result).toMatchObject({ success: true, path: 'D:/out/h.csv' });
    expect(h.isSafe).toHaveBeenCalledWith('D:/out/h.csv');
    expect(h.isProtected).toHaveBeenCalledWith('D:/out/h.csv');
    expect(h.showSaveDialog).not.toHaveBeenCalled();
    expect(h.mkdir).toHaveBeenCalledWith('D:/out', { recursive: true });
    expect(h.writeFile).toHaveBeenCalledWith('D:/out/h.csv', 'serialized', 'utf-8');
  });

  it('rejects unsafe and protected paths', async () => {
    h.isSafe.mockReturnValueOnce(false);
    await expect(exportHistory(event, { outputPath: 'relative.csv' })).resolves.toEqual({
      success: false,
      error: 'Invalid output path'
    });

    h.isProtected.mockReturnValueOnce(true);
    await expect(exportHistory(event, { outputPath: 'D:/Windows/system.csv' })).resolves.toEqual({
      success: false,
      error: 'Protected path'
    });
    expect(h.writeFile).not.toHaveBeenCalled();
  });

  it('reports a cancelled save dialog', async () => {
    h.showSaveDialog.mockResolvedValueOnce({ canceled: true });
    await expect(exportHistory(event, {})).resolves.toEqual({ success: false, canceled: true });

    h.showSaveDialog.mockResolvedValueOnce({ canceled: false });
    await expect(exportHistory(event, {})).resolves.toEqual({ success: false, canceled: true });
    expect(h.writeFile).not.toHaveBeenCalled();
  });

  it('uses the dialog without a parent window', async () => {
    h.fromWebContents.mockReturnValueOnce(null);

    await exportHistory(event, {});

    expect(h.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Export history' })
    );
  });
});

describe('failures', () => {
  it('logs write failures and returns the message', async () => {
    h.writeFile.mockRejectedValueOnce(new Error('disk full'));

    await expect(exportHistory(event, { outputPath: 'D:/out/h.csv' })).resolves.toEqual({
      success: false,
      error: 'disk full'
    });
    expect(h.loggerWarn).toHaveBeenCalledWith('tools', 'history export failed', expect.any(Error));
  });

  it('stringifies non-error failures', async () => {
    h.loadLibrary.mockRejectedValueOnce('plain');

    await expect(exportHistory(event, {})).resolves.toEqual({
      success: false,
      error: 'plain'
    });
  });
});
