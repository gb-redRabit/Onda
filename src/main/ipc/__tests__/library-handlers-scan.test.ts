import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaFile } from '../../../shared/types/media';

const h = vi.hoisted(() => ({
  stat: vi.fn(),
  scanDir: vi.fn(),
  classify: vi.fn(),
  filter: vi.fn(),
  budget: { truncated: false },
  loadScanned: vi.fn(),
  setScanned: vi.fn(),
  sanitize: vi.fn(),
  broadcast: vi.fn(),
  warn: vi.fn()
}));

vi.mock('fs/promises', () => ({ stat: h.stat }));
vi.mock('../library/library-scan', () => ({
  createScanBudget: () => h.budget,
  scanDir: h.scanDir,
  classifyFolderType: h.classify,
  filterFilesForFolderType: h.filter
}));
vi.mock('../library/library-store', () => ({
  loadLibraryScanned: h.loadScanned,
  setLibraryScanned: h.setScanned
}));
vi.mock('../library/library-handlers-paths', () => ({ sanitizeFolderPaths: h.sanitize }));
vi.mock('../../utils/broadcast', () => ({ broadcastToAllWindows: h.broadcast }));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: h.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { MAX_SCANNED_FILES, runLibraryScan } from '../library/library-handlers-scan';

const file = (path: string): MediaFile => ({ path, name: path, type: 'audio' }) as MediaFile;

function dirStat(isDirectory = true) {
  return { isDirectory: () => isDirectory };
}

beforeEach(() => {
  h.stat.mockReset().mockResolvedValue(dirStat());
  h.scanDir.mockReset().mockResolvedValue({ files: [file('/a/1.mp3')] });
  h.classify.mockReset().mockReturnValue('audio');
  h.filter.mockReset().mockImplementation((files: MediaFile[]) => files);
  h.budget = { truncated: false };
  h.loadScanned.mockReset().mockResolvedValue(null);
  h.setScanned.mockReset();
  h.sanitize.mockReset().mockImplementation((paths: string[]) => paths);
  h.broadcast.mockReset();
  h.warn.mockClear();
});

// Library scan orchestration: sequential folders, incremental reuse, abort safety
// and the shared file budget.

describe('runLibraryScan', () => {
  it('scans folders sequentially and reports progress and types', async () => {
    const progress = vi.fn();
    const signal = new AbortController().signal;
    h.sanitize.mockReturnValue(['/a', '/b']);
    h.scanDir
      .mockResolvedValueOnce({ files: [file('/a/1.mp3')] })
      .mockResolvedValueOnce({ files: [file('/b/2.mp4')] });
    h.classify.mockReturnValueOnce('audio').mockReturnValueOnce('video');

    const result = await runLibraryScan(['/a', '/b'], signal, progress, true);

    expect(result).toMatchObject({
      count: 2,
      folderTypes: { '/a': 'audio', '/b': 'video' },
      aborted: false,
      truncated: false
    });
    expect(progress.mock.calls).toEqual([
      [1, 2],
      [2, 2]
    ]);
    expect(h.setScanned).toHaveBeenCalledWith({
      files: [file('/a/1.mp3'), file('/b/2.mp4')],
      folderTypes: { '/a': 'audio', '/b': 'video' }
    });
    expect(h.broadcast).toHaveBeenCalledWith('library:updated');
    expect(h.scanDir).toHaveBeenCalledWith('/a', 8, 0, signal, expect.any(Map), h.budget, false);
  });

  it('reuses previous files for incremental scans and tolerates malformed entries', async () => {
    const previous = file('/a/1.mp3');
    h.loadScanned.mockResolvedValue({
      files: [previous, null, { name: 'no path' }]
    });

    await runLibraryScan(['/a'], new AbortController().signal);

    const map = h.scanDir.mock.calls[0]![4] as Map<string, MediaFile>;
    expect(map.get('/a/1.mp3')).toBe(previous);
    expect(map.size).toBe(1);
  });

  it('skips non-directories and scan errors without failing the whole run', async () => {
    h.sanitize.mockReturnValue(['/missing', '/broken']);
    h.stat.mockResolvedValueOnce(dirStat(false)).mockResolvedValueOnce(dirStat());
    h.scanDir.mockRejectedValueOnce(new Error('permission denied'));

    const result = await runLibraryScan(['/missing', '/broken'], new AbortController().signal);

    expect(result.count).toBe(0);
    expect(result.folderTypes).toEqual({});
    expect(h.warn).toHaveBeenCalledWith('library', 'scan skipped (not a directory): /missing');
    expect(h.warn).toHaveBeenCalledWith(
      'library',
      expect.stringContaining('scan error for /broken')
    );
    expect(h.setScanned).toHaveBeenCalledWith({ files: [], folderTypes: {} });
  });

  it('does not persist an aborted scan', async () => {
    const controller = new AbortController();
    h.sanitize.mockReturnValue(['/a']);
    h.scanDir.mockImplementation(async () => {
      controller.abort();
      return { files: [file('/a/1.mp3')] };
    });

    const result = await runLibraryScan(['/a'], controller.signal);

    expect(result.aborted).toBe(true);
    expect(h.setScanned).not.toHaveBeenCalled();
    expect(h.broadcast).not.toHaveBeenCalled();
  });

  it('stops before starting more folders once aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    h.sanitize.mockReturnValue(['/a', '/b']);

    const result = await runLibraryScan(['/a', '/b'], controller.signal);

    expect(h.scanDir).not.toHaveBeenCalled();
    expect(result.aborted).toBe(true);
    expect(h.setScanned).not.toHaveBeenCalled();
  });

  it('reports a truncated budget with a warning', async () => {
    h.budget = { truncated: true };

    const result = await runLibraryScan(['/a'], new AbortController().signal);

    expect(result.truncated).toBe(true);
    expect(h.warn).toHaveBeenCalledWith(
      'library',
      `scan hit the ${MAX_SCANNED_FILES} file ceiling — the library is incomplete`
    );
  });

  it('treats a missing stat result as a skipped folder', async () => {
    h.stat.mockResolvedValueOnce(null);

    const result = await runLibraryScan(['/a'], new AbortController().signal);

    expect(result.count).toBe(0);
    expect(h.warn).toHaveBeenCalledWith('library', 'scan skipped (not a directory): /a');
  });

  it('treats a stat rejection as a skipped folder', async () => {
    h.stat.mockRejectedValueOnce(new Error('gone'));

    const result = await runLibraryScan(['/a'], new AbortController().signal);

    expect(result.count).toBe(0);
    expect(h.warn).toHaveBeenCalledWith('library', 'scan skipped (not a directory): /a');
  });
});
