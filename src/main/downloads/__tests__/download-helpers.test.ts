import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getPath: vi.fn(),
  resolveFolderTokens: vi.fn(),
  isSafeAbsolutePath: vi.fn(),
  isProtectedDestructivePath: vi.fn()
}));

vi.mock('electron', () => ({ app: { getPath: h.getPath } }));
vi.mock('../cover-spec', () => ({ resolveFolderTokens: h.resolveFolderTokens }));
vi.mock('../../utils/validate', () => ({ isSafeAbsolutePath: h.isSafeAbsolutePath }));
vi.mock('../../path-policy', () => ({
  isProtectedDestructivePath: h.isProtectedDestructivePath
}));

import {
  buildFormatSelector,
  deriveHttpFileName,
  formatEta,
  isAllowedDownloadDir,
  mapFilenameTemplate,
  outputExtensions,
  parseYtDlpProgress,
  resolveOutputDir,
  sanitizeFileName
} from '../download-helpers';

const job = (over: Record<string, unknown> = {}) =>
  ({
    id: 'j1',
    title: 'Song',
    url: 'https://cdn.test/path/song.flac',
    kind: 'audio',
    format: 'mp3',
    ...over
  }) as never;

beforeEach(() => {
  h.getPath.mockReset().mockImplementation((name: string) => {
    if (name === 'downloads') return 'D:/Downloads';
    return `D:/${name}`;
  });
  h.resolveFolderTokens.mockReset().mockImplementation((value: string) => value);
  h.isSafeAbsolutePath.mockReset().mockReturnValue(true);
  h.isProtectedDestructivePath.mockReset().mockReturnValue(false);
});

describe('mapFilenameTemplate', () => {
  it('maps tokens and strips reserved characters', () => {
    expect(mapFilenameTemplate('{artist} - {title}: {album}/{year} {id}')).toBe(
      '%(artist,uploader,channel)s - %(title)s %(album)s %(release_year)s %(id)s'
    );
  });

  it('falls back to the title token for an empty template', () => {
    expect(mapFilenameTemplate('   ')).toBe('%(title)s');
    expect(mapFilenameTemplate('///')).toBe('%(title)s');
  });
});

describe('parseYtDlpProgress', () => {
  it('parses destination lines', () => {
    expect(parseYtDlpProgress('[download] Destination: D:/out/song.mp3')).toEqual({
      destination: 'D:/out/song.mp3'
    });
    expect(parseYtDlpProgress('[ExtractAudio] Destination: /out/a.flac')).toEqual({
      destination: '/out/a.flac'
    });
    expect(parseYtDlpProgress('[Merger] Destination: /out/m.mp4')).toEqual({
      destination: '/out/m.mp4'
    });
  });

  it('parses progress with speed and eta', () => {
    expect(parseYtDlpProgress('[download]  42.5% of 1.2MiB at 1.5MiB/s ETA 00:10')).toEqual({
      progress: 42.5,
      speed: '1.5MiB/s',
      eta: '00:10'
    });
  });

  it('clamps progress and omits optional fields', () => {
    expect(parseYtDlpProgress('[download] 150%')).toEqual({ progress: 100 });
    expect(parseYtDlpProgress('[download] 0%')).toEqual({ progress: 0 });
  });

  it('ignores unrelated lines', () => {
    expect(parseYtDlpProgress('[info] something')).toBeNull();
  });
});

describe('buildFormatSelector', () => {
  it('selects audio and best video formats', () => {
    expect(buildFormatSelector('best', 'audio')).toBe('bestaudio/best');
    expect(buildFormatSelector('1080p', 'video')).toBe('bestvideo[height<=1080]+bestaudio/best');
    expect(buildFormatSelector('best', 'video')).toBe('bestvideo+bestaudio/best');
    expect(buildFormatSelector('bestaudio', 'video')).toBe('bestvideo+bestaudio/best');
  });
});

describe('resolveOutputDir', () => {
  it('expands allowed tokens', () => {
    h.resolveFolderTokens.mockReturnValue('D:/Music/Channel');

    expect(resolveOutputDir(job({ outputDir: ' D:/Music/{channel} ' }))).toBe('D:/Music/Channel');
    expect(h.resolveFolderTokens).toHaveBeenCalledWith('D:/Music/{channel}', {
      channelTitle: undefined,
      playlistTitle: undefined
    });
  });

  it('falls back to the downloads folder without tokens or unsafe results', () => {
    h.resolveFolderTokens.mockReturnValue('');

    expect(resolveOutputDir(job({ outputDir: '' }))).toBe('D:/Downloads');
    expect(resolveOutputDir(job({ outputDir: undefined }))).toBe('D:/Downloads');

    h.resolveFolderTokens.mockReturnValue('C:/Windows');
    h.isSafeAbsolutePath.mockReturnValue(false);

    expect(resolveOutputDir(job({ outputDir: 'C:/Windows' }))).toBe('D:/Downloads');
  });
});

describe('isAllowedDownloadDir', () => {
  it('rejects relative and protected directories', () => {
    h.isSafeAbsolutePath.mockReturnValue(false);
    expect(isAllowedDownloadDir('relative')).toBe(false);

    h.isSafeAbsolutePath.mockReturnValue(true);
    h.isProtectedDestructivePath.mockReturnValue(true);
    expect(isAllowedDownloadDir('C:/Users/me/AppData')).toBe(false);
  });

  it('accepts a safe directory', () => {
    expect(isAllowedDownloadDir('D:/Downloads')).toBe(true);
    expect(h.isProtectedDestructivePath).toHaveBeenCalledWith('D:/Downloads', process.platform, [
      'D:/home',
      'D:/appData',
      'D:/userData'
    ]);
  });

  it('rejects when the policy check throws', () => {
    h.isProtectedDestructivePath.mockImplementation(() => {
      throw new Error('bad path');
    });

    expect(isAllowedDownloadDir('D:/Downloads')).toBe(false);
  });
});

describe('outputExtensions', () => {
  it('uses the video container, best-audio set or explicit format', () => {
    expect(outputExtensions(job({ kind: 'video', videoContainer: 'mkv' }))).toEqual(['.mkv']);
    expect(outputExtensions(job({ kind: 'video' }))).toEqual(['.mp4']);
    expect(outputExtensions(job({ kind: 'audio', format: 'best' }))).toContain('.webm');
    expect(outputExtensions(job({ kind: 'audio', format: 'flac' }))).toEqual(['.flac']);
    expect(outputExtensions(job({ kind: 'audio', format: undefined }))).toEqual(['.mp3']);
  });
});

describe('formatEta', () => {
  it('formats seconds, minutes and hours', () => {
    expect(formatEta(5.4)).toBe('5s');
    expect(formatEta(65)).toBe('1m');
    expect(formatEta(3700)).toBe('1h');
    expect(formatEta(-5)).toBe('0s');
  });
});

describe('sanitizeFileName', () => {
  it('removes reserved characters from file names', () => {
    const result = sanitizeFileName('a<>b.mp3');

    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).toContain('.mp3');
  });
});

describe('deriveHttpFileName', () => {
  it('uses the URL extension when possible', () => {
    expect(deriveHttpFileName(job({ url: 'https://cdn.test/a.MP4?x=1' }))).toBe('Song.mp4');
  });

  it('falls back to .bin for missing or invalid URLs', () => {
    expect(deriveHttpFileName(job({ url: 'not-a-url', title: '' }))).toBe('download.bin');
  });

  it('falls back when the extension is too long', () => {
    expect(deriveHttpFileName(job({ url: 'https://cdn.test/a.verylongextension' }))).toBe(
      'Song.bin'
    );
  });
});
