import { describe, it, expect, vi, beforeEach } from 'vitest';

// Siatka regresyjna hosterów yt-dlp (Dropbox / Yandex.Disk / Internet Archive).
// `runCommand` (yt-dlp) i `resolveBin` są mockowane — test offline.

vi.mock('../../../utils/exec', () => ({ runCommand: vi.fn() }));
vi.mock('../../../binaries', () => ({ resolveBin: vi.fn(async () => 'yt-dlp') }));

import { runCommand } from '../../../utils/exec';
import { dropboxProvider, yandexProvider, archiveProvider } from '../hoster';
import { inspectHoster, __resetHosterCache } from '../hoster/ytdlp-resolve';

const runMock = vi.mocked(runCommand);

beforeEach(() => {
  runMock.mockReset();
  __resetHosterCache();
});

describe('inspectHoster', () => {
  it('maps a single-file info into one entry', async () => {
    runMock.mockResolvedValueOnce(
      JSON.stringify({ id: 'f1', title: 'clip.mp4', url: 'https://cdn/clip.mp4', filesize: 123 })
    );
    const entries = await inspectHoster('https://www.dropbox.com/s/abc/clip.mp4');
    expect(entries).toEqual([
      { id: 'f1', url: 'https://cdn/clip.mp4', title: 'clip.mp4', size: 123 }
    ]);
  });

  it('maps a playlist (archive details) into many entries', async () => {
    runMock.mockResolvedValueOnce(
      JSON.stringify({
        entries: [
          { id: 'a', title: 'A', url: 'https://ia/a.mp3' },
          { id: 'b', title: 'B', url: 'https://ia/b.mp3', filesize_approx: 50 }
        ]
      })
    );
    const entries = await inspectHoster('https://archive.org/details/x');
    expect(entries.map((e) => e.id)).toEqual(['a', 'b']);
    expect(entries[1].size).toBe(50);
  });
});

describe('hoster providers', () => {
  it('lists entries as file RemoteItems', async () => {
    runMock.mockResolvedValueOnce(
      JSON.stringify({ id: 'f1', title: 'clip.mp4', url: 'https://cdn/clip.mp4' })
    );
    const items = await dropboxProvider.listFolder({
      provider: 'dropbox',
      shareId: 'https://www.dropbox.com/s/abc/clip.mp4'
    });
    expect(items).toEqual([
      { id: 'f1', name: 'clip.mp4', kind: 'file', size: undefined, parentId: null }
    ]);
  });

  it('resolves the matching entry url by id', async () => {
    runMock.mockResolvedValueOnce(
      JSON.stringify({
        entries: [
          { id: 'a', title: 'A', url: 'https://ia/a.mp3' },
          { id: 'b', title: 'B', url: 'https://ia/b.mp3' }
        ]
      })
    );
    const out = await archiveProvider.resolveFileUrl(
      { provider: 'archive', shareId: 'https://archive.org/details/x' },
      'b'
    );
    expect(out.url).toBe('https://ia/b.mp3');
  });

  it('matches its domains only', () => {
    expect(dropboxProvider.match('https://www.dropbox.com/s/x/y')).toBe(true);
    expect(yandexProvider.match('https://disk.yandex.ru/d/x')).toBe(true);
    expect(archiveProvider.match('https://archive.org/details/x')).toBe(true);
    expect(dropboxProvider.match('https://example.com/x')).toBe(false);
  });

  it('passes "--" separator before the URL and rejects CLI flags or mismatched domains', async () => {
    runMock.mockResolvedValueOnce(
      JSON.stringify({ id: 'f1', title: 'clip.mp4', url: 'https://cdn/clip.mp4' })
    );
    await dropboxProvider.listFolder({
      provider: 'dropbox',
      shareId: 'https://www.dropbox.com/s/abc/clip.mp4'
    });
    expect(runMock).toHaveBeenCalledWith(
      'yt-dlp',
      ['--no-warnings', '-J', '--', 'https://www.dropbox.com/s/abc/clip.mp4'],
      { timeout: 60000 }
    );

    await expect(inspectHoster('--exec=calc.exe')).rejects.toThrow();
    await expect(
      dropboxProvider.listFolder({ provider: 'dropbox', shareId: '--exec=calc.exe' })
    ).rejects.toThrow();
    await expect(
      dropboxProvider.resolveFileUrl({ provider: 'dropbox', shareId: 'http://127.0.0.1/' }, '1')
    ).rejects.toThrow();
  });

  it('reuses cached inspection between listFolder and resolveFileUrl', async () => {
    runMock.mockResolvedValueOnce(
      JSON.stringify({ id: 'f1', title: 'clip.mp4', url: 'https://cdn/clip.mp4' })
    );
    const ref = { provider: 'dropbox', shareId: 'https://www.dropbox.com/s/abc/clip.mp4' };
    await dropboxProvider.listFolder(ref);
    const resolved = await dropboxProvider.resolveFileUrl(ref, 'f1');
    expect(resolved.url).toBe('https://cdn/clip.mp4');
    expect(runMock).toHaveBeenCalledTimes(1);
  });
});
