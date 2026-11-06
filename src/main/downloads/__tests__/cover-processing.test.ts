import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

// Pipeline okładek pobrań: sieć/yt-dlp/ffmpeg są mockowane, ale sprawdzamy
// kolejność, argumenty i bramki walidacji (w tym ścieżki custom).
const state = vi.hoisted(() => ({
  stat: vi.fn(async (_path: string): Promise<{ isFile: () => boolean; size: number }> => ({
    isFile: () => true,
    size: 1024
  })),
  realpath: vi.fn(async (path: string) => path),
  mkdir: vi.fn(async () => undefined),
  rm: vi.fn(async () => undefined),
  runCommand: vi.fn(async (_bin?: string, _args?: string[], _opts?: unknown) => ''),
  resolveBin: vi.fn(async (tool?: string) => `/bin/${tool}`),
  replaceFileAtomic: vi.fn(async () => undefined),
  safeUnlink: vi.fn(async (_path?: string) => undefined),
  getYtAuthConfig: vi.fn(async () => null),
  cleanupYtAuthTemp: vi.fn(async () => undefined),
  buildYtArgs: vi.fn((args: string[]) => args),
  writeCover: vi.fn(
    async (_path?: string, _source?: string): Promise<{ success: boolean; error?: string }> => ({
      success: true
    })
  ),
  buildSectionArgs: vi.fn((start: number, end: number) => ['-section', `${start}-${end}`]),
  clipFormatSelector: vi.fn((format: string) => `selector-${format}`),
  acceptable: true,
  protectedPath: false,
  sensitivePath: false,
  loggerWarn: vi.fn()
}));

vi.mock('fs/promises', () => {
  const mod = {
    stat: (...args: [string]) => state.stat(...args),
    realpath: (...args: [string]) => state.realpath(...args),
    mkdir: (...args: unknown[]) => state.mkdir(...(args as [])),
    rm: (...args: unknown[]) => state.rm(...(args as []))
  };
  return { ...mod, default: mod };
});
vi.mock('../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: vi.fn(), error: vi.fn() }
}));
vi.mock('../../binaries', () => ({ resolveBin: state.resolveBin }));
vi.mock('../../utils/exec', () => ({ runCommand: state.runCommand }));
vi.mock('../../utils/fs-atomic', () => ({
  replaceFileAtomic: state.replaceFileAtomic,
  safeUnlink: state.safeUnlink
}));
vi.mock('../../path-policy', () => ({
  isProtectedPath: () => state.protectedPath,
  isSensitivePath: () => state.sensitivePath
}));
vi.mock('../../youtube/youtube-auth', () => ({
  getYtAuthConfig: state.getYtAuthConfig,
  cleanupYtAuthTemp: state.cleanupYtAuthTemp
}));
vi.mock('../../ipc/youtube/youtube-utils', () => ({ buildYtArgs: state.buildYtArgs }));
vi.mock('../../ipc/media/media-handlers', () => ({
  writeCoverToAudioFile: state.writeCover
}));
vi.mock('../cover-spec', () => ({
  buildSectionArgs: state.buildSectionArgs,
  clipFormatSelector: state.clipFormatSelector,
  clipCopiedCodecAcceptable: () => state.acceptable,
  clipCopiedCodecWebmAcceptable: () => state.acceptable,
  siblingCoverPath: (outputPath: string, format: string) =>
    outputPath.replace(/\.[^.]+$/, `.${format}`)
}));

const { removeThumbnailFiles, applyMetadataOverride, processCover } =
  await import('../cover-processing');

const output = '/music/song.mp3';
const workDir = join(tmpdir(), 'onda-cover-src', 'task-1');

function ctx(cover: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    taskId: 'task-1',
    url: 'https://youtube.com/watch?v=1',
    cover,
    outputPath: output,
    ...overrides
  } as never;
}

beforeEach(() => {
  state.stat.mockReset();
  state.stat.mockResolvedValue({ isFile: () => true, size: 1024 });
  state.realpath.mockReset();
  state.realpath.mockImplementation(async (path: string) => path);
  state.mkdir.mockClear();
  state.rm.mockClear();
  state.runCommand.mockReset();
  state.runCommand.mockResolvedValue('');
  state.resolveBin.mockReset();
  state.resolveBin.mockImplementation(async (tool?: string) => `/bin/${tool}`);
  state.replaceFileAtomic.mockClear();
  state.safeUnlink.mockClear();
  state.getYtAuthConfig.mockReset();
  state.getYtAuthConfig.mockResolvedValue(null);
  state.cleanupYtAuthTemp.mockClear();
  state.buildYtArgs.mockClear();
  state.writeCover.mockReset();
  state.writeCover.mockResolvedValue({ success: true });
  state.acceptable = true;
  state.protectedPath = false;
  state.sensitivePath = false;
});

describe('removeThumbnailFiles', () => {
  it('removes every thumbnail extension next to the audio file', async () => {
    await removeThumbnailFiles('/music/Album/song.mp3');

    expect(state.safeUnlink.mock.calls.map((c) => c[0])).toEqual([
      join('/music/Album', 'song.jpg'),
      join('/music/Album', 'song.jpeg'),
      join('/music/Album', 'song.webp'),
      join('/music/Album', 'song.png')
    ]);
  });
});

describe('applyMetadataOverride', () => {
  it('does nothing without tags', async () => {
    await applyMetadataOverride(output, {});
    expect(state.runCommand).not.toHaveBeenCalled();
  });

  it('muxes artist, album and date with stream copy and atomic replace', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(555);

    await applyMetadataOverride(output, { artist: 'A', album: 'B', year: '2001' });

    const tmpOut = join(dirname(output), 'song.tmp-555.mp3');
    expect(state.runCommand).toHaveBeenCalledWith(
      '/bin/ffmpeg',
      [
        '-y',
        '-i',
        output,
        '-metadata',
        'artist=A',
        '-metadata',
        'album=B',
        '-metadata',
        'date=2001',
        '-c',
        'copy',
        tmpOut
      ],
      { timeout: 120000 }
    );
    expect(state.replaceFileAtomic).toHaveBeenCalledWith(tmpOut, output);
    now.mockRestore();
  });

  it('cleans the temporary file and rethrows on failure', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(777);
    state.runCommand.mockRejectedValue(new Error('ffmpeg failed'));

    await expect(applyMetadataOverride(output, { artist: 'A' })).rejects.toThrow('ffmpeg failed');

    expect(state.safeUnlink).toHaveBeenCalledWith(join(dirname(output), 'song.tmp-777.mp3'));
    now.mockRestore();
  });
});

describe('processCover: no-op covers', () => {
  it.each(['none', 'thumbnail'])('returns embedded for type %s', async (type) => {
    await expect(processCover(ctx({ type }))).resolves.toEqual({ status: 'embedded' });
    expect(state.mkdir).not.toHaveBeenCalled();
    expect(state.writeCover).not.toHaveBeenCalled();
  });
});

describe('processCover: custom images', () => {
  it('embeds a valid custom image', async () => {
    await expect(
      processCover(ctx({ type: 'custom', customPath: '/pictures/cover.png' }))
    ).resolves.toEqual({ status: 'embedded' });

    expect(state.writeCover).toHaveBeenCalledWith(output, '/pictures/cover.png');
  });

  it.each([
    ['unsupported extension', '/pictures/cover.gif', 'unsupported image type .gif'],
    ['missing file', '/pictures/missing.jpg', 'image not found'],
    ['directory', '/pictures/dir.jpg', 'image is not a file'],
    ['empty file', '/pictures/empty.jpg', 'image too large'],
    ['oversized file', '/pictures/huge.jpg', 'image too large'],
    ['protected path', '/pictures/secret.jpg', 'image path not allowed']
  ])('rejects %s', async (_label, customPath, expected) => {
    if (expected === 'image not found') {
      state.stat.mockRejectedValue(new Error('ENOENT'));
    } else if (expected === 'image is not a file') {
      state.stat.mockResolvedValue({ isFile: () => false, size: 100 });
    } else if (expected === 'image too large') {
      state.stat.mockResolvedValue({
        isFile: () => true,
        size: customPath.includes('huge') ? 11 * 1024 * 1024 : 0
      });
    } else if (expected === 'image path not allowed') {
      state.protectedPath = true;
    }

    await expect(processCover(ctx({ type: 'custom', customPath }))).resolves.toEqual({
      status: 'error',
      error: expected
    });
    expect(state.writeCover).not.toHaveBeenCalled();
  });

  it('reports an embed failure', async () => {
    state.writeCover.mockResolvedValue({ success: false, error: 'no tags' });

    await expect(
      processCover(ctx({ type: 'custom', customPath: '/pictures/cover.jpg' }))
    ).resolves.toEqual({ status: 'error', error: 'no tags' });
  });
});

describe('processCover: frame', () => {
  it('rejects frame covers for non-yt-dlp sources', async () => {
    await expect(processCover(ctx({ type: 'frame' }, { sourceMode: 'provider' }))).resolves.toEqual(
      {
        status: 'error',
        error: "cover type 'frame' is unavailable for provider sources"
      }
    );
    expect(state.runCommand).not.toHaveBeenCalled();
  });

  it('downloads a section, extracts one frame and embeds it', async () => {
    const result = await processCover(ctx({ type: 'frame', frameTime: 12 }));

    expect(result).toEqual({ status: 'embedded' });
    expect(state.mkdir).toHaveBeenCalledWith(workDir, { recursive: true });
    expect(state.buildSectionArgs).toHaveBeenCalledWith(12, 13);

    const downloadArgs = state.runCommand.mock.calls[0][1]!;
    expect(downloadArgs).toEqual(
      expect.arrayContaining([
        '-o',
        join(workDir, 'frame.mp4'),
        '--',
        'https://youtube.com/watch?v=1'
      ])
    );
    expect(state.runCommand).toHaveBeenLastCalledWith(
      '/bin/ffmpeg',
      [
        '-y',
        '-i',
        join(workDir, 'frame.mp4'),
        '-frames:v',
        '1',
        '-q:v',
        '2',
        join(workDir, 'frame.jpg')
      ],
      { timeout: 60000 }
    );
    expect(state.writeCover).toHaveBeenCalledWith(output, join(workDir, 'frame.jpg'));
    expect(state.rm).toHaveBeenCalledWith(workDir, { recursive: true, force: true });
  });

  it('defaults the frame time to 30s', async () => {
    await processCover(ctx({ type: 'frame' }));
    expect(state.buildSectionArgs).toHaveBeenCalledWith(30, 31);
  });

  it('returns an error when the frame cannot be embedded but still cleans up', async () => {
    state.writeCover.mockResolvedValue({ success: false, error: 'bad cover' });

    await expect(processCover(ctx({ type: 'frame' }))).resolves.toEqual({
      status: 'error',
      error: 'bad cover'
    });
    expect(state.rm).toHaveBeenCalledWith(workDir, { recursive: true, force: true });
  });
});

describe('processCover: clip', () => {
  it('copies the stream when the codec is acceptable and embeds the thumbnail', async () => {
    const result = await processCover(
      ctx({ type: 'clip', clipFormat: 'webm', clipStart: 5, clipEnd: 15 })
    );

    expect(result).toEqual({ status: 'saved' });
    expect(state.clipFormatSelector).toHaveBeenCalledWith('webm');

    const downloadArgs = state.runCommand.mock.calls[0][1]!;
    expect(downloadArgs).toEqual(
      expect.arrayContaining([
        '--download-sections',
        '*5-15',
        '--write-thumbnail',
        '--convert-thumbnails',
        'jpg',
        '--',
        'https://youtube.com/watch?v=1'
      ])
    );

    const copyArgs = state.runCommand.mock.calls[1][1]!;
    expect(copyArgs).toEqual(expect.arrayContaining(['-c:v', 'copy', '-an', '/music/song.webm']));
    expect(state.writeCover).toHaveBeenCalledWith(output, join(workDir, 'clip.jpg'));
    expect(state.rm).toHaveBeenCalledWith(workDir, { recursive: true, force: true });
  });

  it('re-encodes webm when the copied codec is not acceptable', async () => {
    state.acceptable = false;

    await processCover(ctx({ type: 'clip', clipFormat: 'webm' }));

    const encode = state.runCommand.mock.calls.at(-1)!;
    expect(encode[1]).toEqual(
      expect.arrayContaining(['-c:v', 'libvpx-vp9', '-crf', '24', '-b:v', '0', '-an'])
    );
    expect(encode[1]).toContain('/music/song.webm');
  });

  it('re-encodes mp4 with openh264 when needed', async () => {
    state.acceptable = false;

    await processCover(ctx({ type: 'clip', clipFormat: 'mp4' }));

    const encode = state.runCommand.mock.calls.at(-1)!;
    expect(encode[1]).toEqual(
      expect.arrayContaining(['-c:v', 'libopenh264', '-b:v', '8000k', '-an'])
    );
    expect(encode[1]).toContain('/music/song.mp4');
  });

  it('still saves the clip when embedding the thumbnail fails', async () => {
    state.writeCover.mockRejectedValue(new Error('container mismatch'));

    await expect(processCover(ctx({ type: 'clip', clipFormat: 'webm' }))).resolves.toEqual({
      status: 'saved'
    });
    expect(state.loggerWarn).toHaveBeenCalled();
  });

  it('returns an error when the download fails', async () => {
    state.runCommand.mockRejectedValue(new Error('yt-dlp failed'));

    await expect(processCover(ctx({ type: 'clip', clipFormat: 'webm' }))).resolves.toEqual({
      status: 'error',
      error: 'yt-dlp failed'
    });
    expect(state.rm).toHaveBeenCalledWith(workDir, { recursive: true, force: true });
  });
});
