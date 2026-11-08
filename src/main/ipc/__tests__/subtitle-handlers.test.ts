import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => any>,
  getTempDir: vi.fn(),
  resolveBin: vi.fn(),
  runCommand: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn(),
  rm: vi.fn(),
  stat: vi.fn(),
  realpath: vi.fn(),
  readTextFileWithinBounds: vi.fn(),
  readCachedFonts: vi.fn(),
  writeCachedFonts: vi.fn(),
  fontCacheStats: vi.fn(),
  clearFontCache: vi.fn(),
  uniqueId: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn()
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => any) => {
      state.handlers[channel] = fn;
    }
  }
}));
vi.mock('fs/promises', () => ({
  readdir: state.readdir,
  readFile: state.readFile,
  mkdir: state.mkdir,
  unlink: state.unlink,
  rm: state.rm,
  stat: state.stat,
  realpath: state.realpath
}));
vi.mock('path', () => ({
  join: (...parts: string[]) => parts.filter(Boolean).join('/').replace(/\/+/g, '/'),
  extname: (p: string) => {
    const base = p.split(/[\\/]/).pop() || '';
    const index = base.lastIndexOf('.');
    return index > 0 ? base.slice(index) : '';
  },
  basename: (p: string, ext?: string) => {
    const base = p.split(/[\\/]/).pop() || '';
    return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
  },
  dirname: (p: string) => {
    const index = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    return index > 0 ? p.slice(0, index) : p;
  },
  sep: '/'
}));
vi.mock('../cover/cover-cache', () => ({ getTempDir: state.getTempDir }));
vi.mock('../../binaries', () => ({ resolveBin: state.resolveBin }));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: state.warn, error: state.error, info: state.info }
}));
vi.mock('../../utils/exec', () => ({ runCommand: state.runCommand }));
vi.mock('../../../shared/helpers', () => ({
  isNonNegativeInt: (value: unknown) =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0
}));
vi.mock('../../utils/validate', () => ({
  isSafeAbsolutePath: (value: unknown) =>
    typeof value === 'string' && /^[A-Za-z]:\//.test(value.replace(/\\/g, '/'))
}));
vi.mock('../../utils/read-text-file', () => ({
  readTextFileWithinBounds: state.readTextFileWithinBounds,
  SUBTITLE_EXTS: ['.srt', '.ass'],
  SUBTITLE_MAX_BYTES: 2 * 1024 * 1024
}));
vi.mock('../font-cache', () => ({
  readCachedFonts: state.readCachedFonts,
  writeCachedFonts: state.writeCachedFonts,
  fontCacheStats: state.fontCacheStats,
  clearFontCache: state.clearFontCache
}));
vi.mock('../../utils/ids', () => ({ uniqueId: state.uniqueId }));

async function load() {
  vi.resetModules();
  const module = await import('../subtitle-handlers');
  module.registerSubtitleHandlers();
  return state.handlers;
}

function font(name: string, bytes = 4) {
  return { name, ext: 'ttf', data: Array.from({ length: bytes }, () => 1) };
}

beforeEach(() => {
  state.handlers = {};
  for (const value of Object.values(state)) {
    if (value && typeof value === 'object' && 'mockReset' in value) {
      (value as { mockReset: () => void }).mockReset();
    }
  }
  state.getTempDir.mockReturnValue('C:/temp');
  state.resolveBin.mockResolvedValue('/bin/tool');
  state.runCommand.mockResolvedValue('');
  state.readdir.mockResolvedValue([]);
  state.readFile.mockResolvedValue('content');
  state.mkdir.mockResolvedValue(undefined);
  state.unlink.mockResolvedValue(undefined);
  state.rm.mockResolvedValue(undefined);
  state.stat.mockResolvedValue({ size: 10 });
  state.realpath.mockImplementation(async (p: string) => p);
  state.readTextFileWithinBounds.mockResolvedValue({ ok: true, text: 'subs' });
  state.readCachedFonts.mockResolvedValue(null);
  state.writeCachedFonts.mockResolvedValue(undefined);
  state.fontCacheStats.mockResolvedValue({ files: 1, bytes: 2, videos: 3 });
  state.clearFontCache.mockResolvedValue({ removed: 4, bytesFreed: 5 });
  state.uniqueId.mockReturnValue('u1');
});

describe('registration and listEmbedded', () => {
  it('registers every subtitle channel', async () => {
    const h = await load();
    expect(Object.keys(h)).toEqual(
      expect.arrayContaining([
        'subtitles:listEmbedded',
        'subtitles:extractEmbedded',
        'subtitles:findExternal',
        'subtitles:readFile',
        'subtitles:extractAttachments',
        'subtitles:fontCacheStats',
        'subtitles:fontCacheClear'
      ])
    );
  });

  it('rejects unsafe paths without spawning ffprobe', async () => {
    const h = await load();
    expect(await h['subtitles:listEmbedded']({}, 'relative.mp4')).toEqual([]);
    expect(state.runCommand).not.toHaveBeenCalled();
  });

  it('maps ffprobe streams with defaults', async () => {
    state.runCommand.mockResolvedValue(
      JSON.stringify({
        streams: [
          { index: 2, codec_name: 'subrip', tags: { language: 'pl', title: 'Polski' } },
          { index: 3, tags: {} },
          { index: 4, codec_name: 7, tags: { language: 9 } }
        ]
      })
    );
    const h = await load();
    expect(await h['subtitles:listEmbedded']({}, 'C:/video/a.mkv')).toEqual([
      { index: 2, language: 'pl', title: 'Polski', codec: 'subrip' },
      { index: 3, language: 'und', title: '', codec: 'unknown' },
      { index: 4, language: 9, title: '', codec: 7 }
    ]);
    expect(state.runCommand).toHaveBeenCalledWith(
      '/bin/tool',
      [
        '-v',
        'quiet',
        '-select_streams',
        's',
        '-show_entries',
        'stream=index,codec_name:stream_tags=language,title',
        '-of',
        'json',
        '--',
        'C:/video/a.mkv'
      ],
      { timeout: 10000 }
    );
  });

  it('falls back to the ffprobe name and survives failures', async () => {
    state.resolveBin.mockResolvedValueOnce(null);
    state.runCommand.mockResolvedValueOnce(JSON.stringify({ streams: [] }));
    const h = await load();
    expect(await h['subtitles:listEmbedded']({}, 'C:/a.mkv')).toEqual([]);
    expect(state.runCommand.mock.calls.at(-1)?.[0]).toBe('ffprobe');

    state.runCommand.mockRejectedValueOnce(new Error('probe failed'));
    expect(await h['subtitles:listEmbedded']({}, 'C:/a.mkv')).toEqual([]);
    expect(state.warn).toHaveBeenCalledWith(
      'subtitles',
      'listEmbedded ffprobe failed for C:/a.mkv',
      expect.any(Error)
    );
  });
});

describe('extractEmbedded', () => {
  it('validates the file and stream index', async () => {
    const h = await load();
    expect(await h['subtitles:extractEmbedded']({}, 'relative.mp4', 0)).toBeNull();
    expect(await h['subtitles:extractEmbedded']({}, 'C:/a.mkv', -1)).toBeNull();
    expect(await h['subtitles:extractEmbedded']({}, 'C:/a.mkv', 1.5)).toBeNull();
    expect(state.mkdir).not.toHaveBeenCalled();
  });

  it('copies a text subtitle without transcoding', async () => {
    state.runCommand.mockResolvedValueOnce('subrip\n').mockResolvedValueOnce('');
    const h = await load();
    expect(await h['subtitles:extractEmbedded']({}, 'C:/a.mkv', 1)).toEqual({
      content: 'content',
      format: 'srt'
    });

    expect(state.mkdir).toHaveBeenCalledWith('C:/temp', { recursive: true });
    expect(state.runCommand.mock.calls[1][1]).toEqual([
      '-v',
      'error',
      '-i',
      'C:/a.mkv',
      '-map',
      '0:1',
      '-c:s',
      'copy',
      '-y',
      'C:/temp/sub_u1.srt'
    ]);
    expect(state.readFile).toHaveBeenCalledWith('C:/temp/sub_u1.srt', 'utf-8');
    expect(state.unlink).toHaveBeenCalledWith('C:/temp/sub_u1.srt');
  });

  it('uses the ASS extension for ass and ssa codecs', async () => {
    state.runCommand.mockResolvedValueOnce('ass');
    const h = await load();
    expect(await h['subtitles:extractEmbedded']({}, 'C:/a.mkv', 0)).toEqual({
      content: 'content',
      format: 'ass'
    });
    expect(state.runCommand.mock.calls[1][1]).toContain('C:/temp/sub_u1.ass');

    wrapperReset();
    state.uniqueId.mockReturnValue('u2');
    state.runCommand.mockResolvedValueOnce('ssa');
    const h2 = await load();
    expect(await h2['subtitles:extractEmbedded']({}, 'C:/a.mkv', 0)).toEqual({
      content: 'content',
      format: 'ass'
    });
  });

  it('transcodes to SRT when the direct copy fails', async () => {
    state.uniqueId.mockReturnValue('u1');
    state.runCommand
      .mockResolvedValueOnce('subrip')
      .mockRejectedValueOnce(new Error('copy failed\nmore'))
      .mockResolvedValueOnce('');
    const h = await load();
    expect(await h['subtitles:extractEmbedded']({}, 'C:/a.mkv', 2)).toEqual({
      content: 'content',
      format: 'srt'
    });
    expect(state.warn).toHaveBeenCalledWith(
      'subtitles',
      'copy failed for stream 2 (subrip), trying transcode',
      'copy failed'
    );
    expect(state.readFile).toHaveBeenCalledWith('C:/temp/sub_u1.srt', 'utf-8');
    expect(state.unlink).toHaveBeenCalledWith('C:/temp/sub_u1.srt');
  });

  it('transcodes binary subtitle codecs directly', async () => {
    state.runCommand.mockResolvedValueOnce('pgs_subtitle');
    const h = await load();
    expect(await h['subtitles:extractEmbedded']({}, 'C:/a.mkv', 3)).toEqual({
      content: 'content',
      format: 'srt'
    });
    expect(state.runCommand.mock.calls[1][1]).toContain('srt');
  });

  it('returns null on probe, read or command failures', async () => {
    state.runCommand.mockRejectedValueOnce(new Error('probe'));
    const h = await load();
    expect(await h['subtitles:extractEmbedded']({}, 'C:/a.mkv', 0)).toBeNull();
    expect(state.error).toHaveBeenCalledWith(
      'subtitles',
      'extractEmbedded failed',
      expect.any(Error)
    );

    state.runCommand.mockResolvedValueOnce('subrip');
    state.readFile.mockRejectedValueOnce(new Error('read'));
    expect(await h['subtitles:extractEmbedded']({}, 'C:/a.mkv', 0)).toBeNull();
  });
});

describe('findExternal and readFile', () => {
  it('finds matching subtitle files in the video directory', async () => {
    state.readdir.mockResolvedValue([
      'Movie.srt',
      'Movie.pl.ass',
      'Movie2.srt',
      'Other.vtt',
      'Movie.txt',
      'Movie.WEBVTT'
    ]);
    const h = await load();
    expect(await h['subtitles:findExternal']({}, 'C:/video/Movie.mkv')).toEqual([
      { name: 'Movie.srt', path: 'C:/video/Movie.srt', format: 'srt' },
      { name: 'Movie.pl.ass', path: 'C:/video/Movie.pl.ass', format: 'ass' }
    ]);
    expect(state.readdir).toHaveBeenCalledWith('C:/video');
  });

  it('rejects unsafe paths and readdir failures', async () => {
    const h = await load();
    expect(await h['subtitles:findExternal']({}, 'Movie.mkv')).toEqual([]);

    state.readdir.mockRejectedValueOnce(new Error('denied'));
    expect(await h['subtitles:findExternal']({}, 'C:/video/Movie.mkv')).toEqual([]);
  });

  it('returns bounded text or null', async () => {
    const h = await load();
    expect(await h['subtitles:readFile']({}, 'C:/video/Movie.srt')).toBe('subs');
    expect(state.readTextFileWithinBounds).toHaveBeenCalledWith(
      'C:/video/Movie.srt',
      ['.srt', '.ass'],
      2 * 1024 * 1024,
      'subtitles'
    );

    state.readTextFileWithinBounds.mockResolvedValueOnce({ ok: false, reason: 'too-big' });
    expect(await h['subtitles:readFile']({}, 'C:/video/Movie.srt')).toBeNull();
  });
});

describe('extractAttachments', () => {
  function ffprobeStreams(names: string[]) {
    return JSON.stringify({
      streams: names.map((filename, index) => ({
        index: index + 5,
        codec_type: 'attachment',
        tags: { filename }
      }))
    });
  }

  beforeEach(() => {
    state.resolveBin.mockImplementation(async (name: string) => {
      if (name === 'mkvextract') return '/bin/mkvextract';
      return `/bin/${name}`;
    });
  });

  it('returns cached fonts without spawning tools', async () => {
    state.readCachedFonts.mockResolvedValueOnce([font('Cached')]);
    const h = await load();
    expect(await h['subtitles:extractAttachments']({}, 'C:/a.mkv')).toEqual([font('Cached')]);
    expect(state.runCommand).not.toHaveBeenCalled();
  });

  it('rejects unsafe paths', async () => {
    const h = await load();
    expect(await h['subtitles:extractAttachments']({}, 'relative.mkv')).toEqual([]);
    expect(state.readCachedFonts).not.toHaveBeenCalled();
  });

  it('extracts attachments with mkvextract and caches them', async () => {
    state.runCommand.mockResolvedValueOnce(ffprobeStreams(['My Font.TTF', 'Other.otf']));
    state.readdir.mockResolvedValue(['att_0.ttf', 'att_1.otf']);
    state.readFile
      .mockResolvedValueOnce(Buffer.from([1, 2, 3]))
      .mockResolvedValueOnce(Buffer.from([4, 5]));
    const h = await load();

    expect(await h['subtitles:extractAttachments']({}, 'C:/a.mkv')).toEqual([
      { name: 'My Font', ext: 'ttf', data: [1, 2, 3] },
      { name: 'Other', ext: 'otf', data: [4, 5] }
    ]);
    const extractCalls = state.runCommand.mock.calls.filter(
      (call) => call[0] === '/bin/mkvextract'
    );
    expect(extractCalls).toHaveLength(2);
    expect(extractCalls[0][1]).toEqual([
      'C:/a.mkv',
      'attachments',
      expect.stringMatching(/^1:.*att_0\.ttf$/)
    ]);
    expect(extractCalls[1][1]).toEqual([
      'C:/a.mkv',
      'attachments',
      expect.stringMatching(/^2:.*att_1\.otf$/)
    ]);
    expect(state.writeCachedFonts).toHaveBeenCalledWith('C:/a.mkv', [
      { name: 'My Font', ext: 'ttf', data: [1, 2, 3] },
      { name: 'Other', ext: 'otf', data: [4, 5] }
    ]);
    expect(state.rm).toHaveBeenCalledWith(expect.any(String), { recursive: true, force: true });
  });

  it('falls back to ffmpeg when mkvextract is unavailable', async () => {
    state.resolveBin.mockImplementation(async (name: string) => {
      if (name === 'mkvextract') throw new Error('missing');
      return `/bin/${name}`;
    });
    state.runCommand.mockResolvedValueOnce(ffprobeStreams(['Font.ttf']));
    state.readdir.mockResolvedValue(['att_0.ttf']);
    state.readFile.mockResolvedValue(Buffer.from([9]));
    const h = await load();

    expect(await h['subtitles:extractAttachments']({}, 'C:/a.mkv')).toHaveLength(1);
    expect(state.warn).toHaveBeenCalledWith(
      'subtitles',
      'mkvextract unavailable',
      expect.any(Error)
    );
    expect(state.runCommand).toHaveBeenCalledWith(
      '/bin/ffmpeg',
      expect.arrayContaining(['-dump_attachment:5', 'att_0.ttf', '-t', '0.001']),
      expect.objectContaining({ cwd: expect.any(String) })
    );
  });

  it('uses ffmpeg when mkvextract fails or stat fails', async () => {
    state.runCommand.mockImplementation(async (bin: string, _args: string[]) => {
      if (bin === '/bin/tool' || bin === '/bin/ffprobe') return ffprobeStreams(['Font.TTF']);
      if (bin === '/bin/mkvextract') throw new Error('extract failed');
      return '';
    });
    state.readdir.mockResolvedValue(['att_0.ttf']);
    state.readFile.mockResolvedValue(Buffer.from([7]));
    const h = await load();
    expect(await h['subtitles:extractAttachments']({}, 'C:/a.mkv')).toHaveLength(1);
    expect(state.runCommand).toHaveBeenCalledWith(
      '/bin/ffmpeg',
      expect.any(Array),
      expect.objectContaining({ cwd: expect.any(String) })
    );
  });

  it('returns early when there are no attachment streams', async () => {
    state.runCommand.mockResolvedValueOnce(JSON.stringify({ streams: [] }));
    const h = await load();
    expect(await h['subtitles:extractAttachments']({}, 'C:/a.mkv')).toEqual([]);
    expect(state.mkdir).toHaveBeenCalled();
    expect(state.rm).toHaveBeenCalled();
    expect(state.writeCachedFonts).not.toHaveBeenCalled();
  });

  it('recovers from a failed ffprobe listing', async () => {
    state.runCommand.mockRejectedValueOnce(new Error('probe'));
    const h = await load();
    expect(await h['subtitles:extractAttachments']({}, 'C:/a.mkv')).toEqual([]);
    expect(state.warn).toHaveBeenCalledWith(
      'attachments',
      'ffprobe list failed',
      expect.any(Error)
    );
  });

  it('skips oversized fonts and files outside the dump directory', async () => {
    state.runCommand.mockResolvedValueOnce(ffprobeStreams(['Big.ttf', 'Link.ttf', 'Ok.ttf']));
    state.readdir.mockResolvedValue(['att_0.ttf', 'att_1.ttf', 'att_2.ttf']);
    state.stat.mockImplementation(async (p: string) =>
      p.endsWith('att_0.ttf') ? { size: 26 * 1024 * 1024 } : { size: 10 }
    );
    state.realpath.mockImplementation(async (p: string) =>
      p.endsWith('att_1.ttf') ? '/outside/att_1.ttf' : p
    );
    state.readFile.mockResolvedValue(Buffer.from([1]));
    const h = await load();

    expect(await h['subtitles:extractAttachments']({}, 'C:/a.mkv')).toEqual([
      { name: 'Ok', ext: 'ttf', data: [1] }
    ]);
    expect(state.warn).toHaveBeenCalledWith(
      'subtitles',
      expect.stringContaining('skipping oversized attachment')
    );
  });

  it('falls back to the dumped base name and default extension', async () => {
    state.runCommand.mockResolvedValueOnce(ffprobeStreams(['Untitled']));
    state.readdir.mockResolvedValue(['att_0.bin']);
    state.readFile.mockResolvedValue(Buffer.from([2]));
    const h = await load();
    expect(await h['subtitles:extractAttachments']({}, 'C:/a.mkv')).toEqual([
      { name: 'Untitled', ext: 'ttf', data: [2] }
    ]);
  });

  it('skips unreadable entries and logs unexpected failures', async () => {
    state.runCommand.mockResolvedValueOnce(ffprobeStreams(['Font.ttf']));
    state.readdir.mockRejectedValueOnce(new Error('readdir'));
    const h = await load();
    expect(await h['subtitles:extractAttachments']({}, 'C:/a.mkv')).toEqual([]);
    expect(state.error).toHaveBeenCalledWith(
      'subtitles',
      'extractAttachments failed',
      expect.any(Error)
    );
    expect(state.rm).toHaveBeenCalled();
  });
});

describe('font cache handlers', () => {
  it('delegates stats and clear', async () => {
    const h = await load();
    expect(await h['subtitles:fontCacheStats']()).toEqual({ files: 1, bytes: 2, videos: 3 });
    expect(await h['subtitles:fontCacheClear']()).toEqual({ removed: 4, bytesFreed: 5 });
  });
});

describe('spawn concurrency limit', () => {
  it('processes at most four subtitle jobs at once', async () => {
    const pending: Array<() => void> = [];
    state.runCommand.mockImplementation(
      () => new Promise<string>((resolve) => pending.push(() => resolve('{"streams":[]}')))
    );
    const h = await load();

    const jobs = Array.from({ length: 5 }, () => h['subtitles:listEmbedded']({}, 'C:/a.mkv'));
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    expect(state.runCommand).toHaveBeenCalledTimes(4);

    pending.shift()!();
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    expect(state.runCommand).toHaveBeenCalledTimes(5);

    pending.forEach((resolve) => resolve());
    await Promise.all(jobs);
  });
});

function wrapperReset() {
  state.handlers = {};
}
