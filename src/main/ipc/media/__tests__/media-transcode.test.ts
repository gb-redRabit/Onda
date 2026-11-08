import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  mkdir: vi.fn(),
  stat: vi.fn(),
  readdir: vi.fn(),
  rm: vi.fn(),
  createHash: vi.fn(),
  update: vi.fn(),
  digest: vi.fn(),
  tmpdir: vi.fn(),
  runCommand: vi.fn(),
  resolveBin: vi.fn(),
  sourceStamp: vi.fn(),
  errMsg: vi.fn((err: unknown) => String(err)),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn()
}));

vi.mock('fs/promises', () => ({
  mkdir: state.mkdir,
  stat: state.stat,
  readdir: state.readdir,
  rm: state.rm
}));
vi.mock('path', () => ({ join: (...parts: string[]) => parts.join('/') }));
vi.mock('crypto', () => ({ createHash: state.createHash }));
vi.mock('os', () => ({ default: { tmpdir: state.tmpdir } }));
vi.mock('../../../../shared/helpers', () => ({ errMsg: state.errMsg }));
vi.mock('../../../../shared/logger', () => ({
  logger: { error: state.error, warn: state.warn, info: state.info }
}));
vi.mock('../../../utils/exec', () => ({ runCommand: state.runCommand }));
vi.mock('../../../binaries', () => ({ resolveBin: state.resolveBin }));
vi.mock('../../../utils/source-stamp', () => ({ sourceStamp: state.sourceStamp }));

async function load() {
  return import('../media-transcode');
}

beforeEach(() => {
  state.mkdir.mockReset();
  state.mkdir.mockResolvedValue(undefined);
  state.stat.mockReset();
  state.stat.mockRejectedValue(new Error('ENOENT'));
  state.readdir.mockReset();
  state.readdir.mockResolvedValue([]);
  state.rm.mockReset();
  state.rm.mockResolvedValue(undefined);
  state.update.mockReset();
  state.digest.mockReset();
  state.digest.mockReturnValue('hash123');
  state.update.mockReturnValue({ digest: state.digest });
  state.createHash.mockReset();
  state.createHash.mockReturnValue({ update: state.update });
  state.tmpdir.mockReturnValue('/tmp');
  state.runCommand.mockReset();
  state.runCommand.mockResolvedValue(undefined);
  state.resolveBin.mockReset();
  state.resolveBin.mockResolvedValue('/bin/ffmpeg');
  state.sourceStamp.mockReset();
  state.sourceStamp.mockResolvedValue('stamp');
  state.errMsg.mockReset();
  state.errMsg.mockImplementation((err: unknown) => String(err));
  state.error.mockReset();
  state.warn.mockReset();
});

describe('transcodeAudioChunk', () => {
  it('rejects invalid numeric inputs', async () => {
    const { transcodeAudioChunk } = await load();
    expect(await transcodeAudioChunk('C:/a.mp3', Number.NaN, 10)).toBeNull();
    expect(await transcodeAudioChunk('C:/a.mp3', 0, Number.POSITIVE_INFINITY)).toBeNull();
    expect(await transcodeAudioChunk('C:/a.mp3', -1, 10)).toBeNull();
    expect(await transcodeAudioChunk('C:/a.mp3', 0, 0)).toBeNull();
    expect(state.mkdir).not.toHaveBeenCalled();
  });

  it('returns an existing chunk without spawning ffmpeg', async () => {
    state.stat.mockResolvedValueOnce({ mtimeMs: 0 });
    const { transcodeAudioChunk } = await load();
    expect(await transcodeAudioChunk('C:/a.mp3', 1, 2)).toBe(
      '/tmp/onda/audio-transcodes/hash123_1_2.m4a'
    );
    expect(state.runCommand).not.toHaveBeenCalled();
  });

  it('creates the chunk with a hashed key', async () => {
    const { transcodeAudioChunk } = await load();
    const out = await transcodeAudioChunk('C:/a.mp3', 1.9, 2.1);

    expect(out).toBe('/tmp/onda/audio-transcodes/hash123_1_3.m4a');
    expect(state.mkdir).toHaveBeenCalledWith('/tmp/onda/audio-transcodes', {
      recursive: true
    });
    expect(state.update).toHaveBeenCalledWith('C:/a.mp3stamp');
    expect(state.runCommand).toHaveBeenCalledWith(
      '/bin/ffmpeg',
      [
        '-v',
        'error',
        '-ss',
        '1.9',
        '-i',
        'C:/a.mp3',
        '-map',
        '0:a:0',
        '-t',
        '2.1',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '/tmp/onda/audio-transcodes/hash123_1_3.m4a',
        '-y'
      ],
      { timeout: 120000 }
    );
  });

  it('falls back to the ffmpeg name and reports failures', async () => {
    state.resolveBin.mockResolvedValueOnce(null);
    const { transcodeAudioChunk } = await load();
    expect(await transcodeAudioChunk('C:/a.mp3', 0, 1)).not.toBeNull();
    expect(state.runCommand.mock.calls[0][0]).toBe('ffmpeg');

    state.runCommand.mockRejectedValueOnce(new Error('ffmpeg failed'));
    expect(await transcodeAudioChunk('C:/b.mp3', 0, 1)).toBeNull();
    expect(state.error).toHaveBeenCalledWith('transcode', 'audio chunk failed', expect.any(String));
  });
});

describe('transcodeAudio', () => {
  it('returns a cached transcode', async () => {
    state.stat.mockResolvedValueOnce({ mtimeMs: 0 });
    const { transcodeAudio } = await load();
    expect(await transcodeAudio('C:/a.mp3')).toBe('/tmp/onda/audio-transcodes/hash123.m4a');
    expect(state.mkdir).toHaveBeenCalledWith('/tmp/onda/audio-transcodes', {
      recursive: true
    });
  });

  it('transcodes the whole file', async () => {
    const { transcodeAudio } = await load();
    expect(await transcodeAudio('C:/a.mp3')).toBe('/tmp/onda/audio-transcodes/hash123.m4a');
    expect(state.runCommand).toHaveBeenCalledWith(
      '/bin/ffmpeg',
      [
        '-v',
        'error',
        '-i',
        'C:/a.mp3',
        '-map',
        '0:a:0',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '/tmp/onda/audio-transcodes/hash123.m4a',
        '-y'
      ],
      { timeout: 600000 }
    );
  });

  it('logs and returns null on failure', async () => {
    state.runCommand.mockRejectedValueOnce(new Error('ffmpeg failed'));
    const { transcodeAudio } = await load();
    expect(await transcodeAudio('C:/a.mp3')).toBeNull();
    expect(state.error).toHaveBeenCalledWith(
      'transcode',
      'audio transcode failed',
      expect.any(String)
    );
  });
});

describe('transcodeVideo', () => {
  it('returns a cached video transcode', async () => {
    state.stat.mockResolvedValueOnce({ mtimeMs: 0 });
    const { transcodeVideo } = await load();
    expect(await transcodeVideo('C:/a.mkv')).toBe('/tmp/onda/video-transcodes/hash123.mp4');
    expect(state.mkdir).toHaveBeenCalledWith('/tmp/onda/video-transcodes', {
      recursive: true
    });
  });

  it('transcodes with H.264/AAC and faststart', async () => {
    const { transcodeVideo } = await load();
    expect(await transcodeVideo('C:/a.mkv')).toBe('/tmp/onda/video-transcodes/hash123.mp4');
    expect(state.runCommand).toHaveBeenCalledWith(
      '/bin/ffmpeg',
      [
        '-v',
        'error',
        '-i',
        'C:/a.mkv',
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        '/tmp/onda/video-transcodes/hash123.mp4',
        '-y'
      ],
      { timeout: 30 * 60 * 1000 }
    );
  });

  it('logs and returns null on failure', async () => {
    state.runCommand.mockRejectedValueOnce(new Error('ffmpeg failed'));
    const { transcodeVideo } = await load();
    expect(await transcodeVideo('C:/a.mkv')).toBeNull();
    expect(state.error).toHaveBeenCalledWith(
      'transcode',
      'video transcode failed',
      expect.any(String)
    );
  });
});

describe('cleanupOldTranscodes', () => {
  it('removes entries older than a day from both caches', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000_000);
    state.readdir
      .mockResolvedValueOnce(['old.m4a', 'new.m4a'])
      .mockResolvedValueOnce(['old.mp4', 'new.mp4']);
    state.stat.mockImplementation(async (path: string) => ({
      mtimeMs: path.includes('old') ? 0 : 999_999_000
    }));

    const { cleanupOldTranscodes } = await load();
    await cleanupOldTranscodes();

    expect(state.mkdir).toHaveBeenCalledWith('/tmp/onda/audio-transcodes', {
      recursive: true
    });
    expect(state.mkdir).toHaveBeenCalledWith('/tmp/onda/video-transcodes', {
      recursive: true
    });
    expect(state.rm).toHaveBeenCalledTimes(2);
    expect(state.rm).toHaveBeenCalledWith('/tmp/onda/audio-transcodes/old.m4a', {
      force: true
    });
    expect(state.rm).toHaveBeenCalledWith('/tmp/onda/video-transcodes/old.mp4', {
      force: true
    });
  });

  it('logs per-entry stat failures and continues', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000_000);
    state.readdir.mockResolvedValueOnce(['broken.m4a']).mockResolvedValueOnce([]);
    state.stat.mockRejectedValueOnce(new Error('stat failed'));

    const { cleanupOldTranscodes } = await load();
    await cleanupOldTranscodes();
    expect(state.warn).toHaveBeenCalledWith(
      'media',
      'transcode cleanup failed for broken.m4a',
      expect.any(Error)
    );
  });

  it('logs a global failure when directories cannot be read', async () => {
    state.readdir.mockRejectedValueOnce(new Error('readdir failed'));
    const { cleanupOldTranscodes } = await load();
    await expect(cleanupOldTranscodes()).resolves.toBeUndefined();
    expect(state.warn).toHaveBeenCalledWith('media', 'transcode cleanup failed', expect.any(Error));
  });

  it('skips entries with unreadable mtimes and continues', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000_000);
    state.readdir.mockResolvedValueOnce(['a.m4a']).mockResolvedValueOnce(['b.mp4']);
    state.stat.mockResolvedValueOnce({ mtimeMs: Number.NaN }).mockResolvedValueOnce({ mtimeMs: 1 });
    const { cleanupOldTranscodes } = await load();
    await cleanupOldTranscodes();
    expect(state.rm).toHaveBeenCalledTimes(1);
    expect(state.rm).toHaveBeenCalledWith('/tmp/onda/video-transcodes/b.mp4', {
      force: true
    });
  });
});
