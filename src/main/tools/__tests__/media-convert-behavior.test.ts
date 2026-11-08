import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  existsSync: vi.fn(),
  mkdir: vi.fn(),
  stat: vi.fn(),
  resolveBin: vi.fn(),
  runCommand: vi.fn(),
  isProtectedPath: vi.fn(),
  isSafeAbsolutePath: vi.fn(),
  cancelJob: vi.fn(),
  cancelAll: vi.fn(),
  runJob: vi.fn()
}));

vi.mock('fs', () => ({ existsSync: state.existsSync }));
vi.mock('fs/promises', () => ({ mkdir: state.mkdir, stat: state.stat }));
vi.mock('path', () => ({
  basename: (path: string, ext?: string) => {
    const base = path.split(/[\\/]/).pop() || '';
    return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
  },
  dirname: (path: string) => path.replace(/\\/g, '/').slice(0, path.lastIndexOf('/')),
  extname: (path: string) => {
    const base = path.split(/[\\/]/).pop() || '';
    const index = base.lastIndexOf('.');
    return index > 0 ? base.slice(index) : '';
  },
  join: (...parts: string[]) => parts.join('/')
}));
vi.mock('../../binaries', () => ({ resolveBin: state.resolveBin }));
vi.mock('../../utils/exec', () => ({ runCommand: state.runCommand }));
vi.mock('../../path-policy', () => ({ isProtectedPath: state.isProtectedPath }));
vi.mock('../../utils/validate', () => ({ isSafeAbsolutePath: state.isSafeAbsolutePath }));
vi.mock('../ffmpeg-job', () => ({
  cancelFfmpegJob: state.cancelJob,
  cancelAllFfmpegJobs: state.cancelAll,
  runFfmpegJob: state.runJob
}));

async function load() {
  return import('../media-convert');
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    jobId: 'job-1',
    kind: 'audio',
    inputPath: 'C:/media/in.wav',
    ...overrides
  } as any;
}

function sender() {
  return { id: 1 } as never;
}

beforeEach(() => {
  state.existsSync.mockReset();
  state.existsSync.mockReturnValue(false);
  state.mkdir.mockReset();
  state.mkdir.mockResolvedValue(undefined);
  state.stat.mockReset();
  state.stat.mockResolvedValue({ isFile: () => true });
  state.resolveBin.mockReset();
  state.resolveBin.mockResolvedValue('/bin/ffmpeg');
  state.runCommand.mockReset();
  state.runCommand.mockResolvedValue('10.5\n');
  state.isProtectedPath.mockReset();
  state.isProtectedPath.mockReturnValue(false);
  state.isSafeAbsolutePath.mockReset();
  state.isSafeAbsolutePath.mockReturnValue(true);
  state.cancelJob.mockReset();
  state.cancelAll.mockReset();
  state.runJob.mockReset();
  state.runJob.mockResolvedValue({ success: true, outputPath: 'C:/media/out.mp3' });
});

describe('resolveConvertOutputPath', () => {
  it('normalises extensions and uses the output folder', async () => {
    const { resolveConvertOutputPath } = await load();
    expect(resolveConvertOutputPath('C:/media/in.wav', 'D:/out', 'mp3')).toBe('D:/out/in.mp3');
    expect(resolveConvertOutputPath('C:/media/in.wav', undefined, '.flac')).toBe(
      'C:/media/in.flac'
    );
  });

  it('avoids the source file and existing outputs', async () => {
    state.existsSync.mockReturnValueOnce(true).mockReturnValueOnce(false);
    const { resolveConvertOutputPath } = await load();
    expect(resolveConvertOutputPath('C:/media/in.mp3', undefined, '.mp3')).toBe(
      'C:/media/in (converted 2).mp3'
    );
  });

  it('treats a case-insensitive source match as a conflict', async () => {
    const { resolveConvertOutputPath } = await load();
    expect(resolveConvertOutputPath('C:/Media/IN.wav', undefined, 'WAV')).toBe(
      'C:/Media/IN (converted).WAV'
    );
  });
});

describe('audio arguments', () => {
  it('builds lossless and PCM targets', async () => {
    const { buildAudioConvertArgs } = await load();
    expect(buildAudioConvertArgs('in', 'out', 'flac', 192)).toContain('flac');
    expect(buildAudioConvertArgs('in', 'out', 'wav', 192)).toContain('pcm_s16le');
  });

  it('builds ogg, opus, aac and m4a targets', async () => {
    const { buildAudioConvertArgs } = await load();
    expect(buildAudioConvertArgs('in', 'out', 'ogg', 128)).toEqual(
      expect.arrayContaining(['-c:a', 'libvorbis', '-b:a', '128k'])
    );
    expect(buildAudioConvertArgs('in', 'out', 'opus', 128)).toEqual(
      expect.arrayContaining(['-c:a', 'libopus', '-b:a', '128k'])
    );
    expect(buildAudioConvertArgs('in', 'out', 'aac', 128)).toEqual(
      expect.arrayContaining(['-c:a', 'aac', '-b:a', '128k'])
    );
    expect(buildAudioConvertArgs('in', 'out', 'm4a', 128)).toEqual(
      expect.arrayContaining(['-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart'])
    );
  });

  it('falls back to mp3 with the default bitrate', async () => {
    const { buildAudioConvertArgs } = await load();
    const args = buildAudioConvertArgs('in', 'out', 'mp3', 999);
    expect(args).toEqual(
      expect.arrayContaining([
        '-c:a',
        'libmp3lame',
        '-b:a',
        '192k',
        '-id3v2_version',
        '3',
        '-map_metadata',
        '0',
        '-progress',
        'pipe:1',
        '-nostats',
        'out'
      ])
    );
  });
});

describe('video arguments', () => {
  it('builds WebM CRF targets', async () => {
    const { buildVideoConvertArgs } = await load();
    const high = buildVideoConvertArgs('in', 'out', 'webm', 'high');
    expect(high).toEqual(
      expect.arrayContaining(['-c:v', 'libvpx-vp9', '-crf', '24', '-b:v', '0', '-c:a', 'libopus'])
    );
    expect(buildVideoConvertArgs('in', 'out', 'webm', 'medium')).toEqual(
      expect.arrayContaining(['-crf', '32'])
    );
    expect(buildVideoConvertArgs('in', 'out', 'webm', 'low')).toEqual(
      expect.arrayContaining(['-crf', '40'])
    );
  });

  it('uses libx264 CRF presets and faststart for mp4', async () => {
    const { buildVideoConvertArgs } = await load();
    const high = buildVideoConvertArgs('in', 'out', 'mp4', 'high');
    expect(high).toEqual(
      expect.arrayContaining([
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '18',
        '-movflags',
        '+faststart'
      ])
    );
    expect(buildVideoConvertArgs('in', 'out', 'mkv', 'low')).toEqual(
      expect.arrayContaining(['-crf', '28'])
    );
    expect(buildVideoConvertArgs('in', 'out', 'mkv', 'low')).not.toContain('-movflags');
  });

  it('uses bitrate mode for hardware encoders', async () => {
    const { buildVideoConvertArgs } = await load();
    expect(buildVideoConvertArgs('in', 'out', 'mp4', 'high', 'libopenh264')).toEqual(
      expect.arrayContaining(['-c:v', 'libopenh264', '-b:v', '8M'])
    );
    expect(buildVideoConvertArgs('in', 'out', 'mp4', 'medium', 'h264_mf')).toEqual(
      expect.arrayContaining(['-c:v', 'h264_mf', '-b:v', '4M'])
    );
    expect(buildVideoConvertArgs('in', 'out', 'mp4', 'low', 'h264_mf')).toEqual(
      expect.arrayContaining(['-b:v', '2M'])
    );
  });

  it('falls back to mpeg4 qscale', async () => {
    const { buildVideoConvertArgs } = await load();
    expect(buildVideoConvertArgs('in', 'out', 'mp4', 'high', 'mpeg4')).toEqual(
      expect.arrayContaining(['-c:v', 'mpeg4', '-q:v', '2'])
    );
    expect(buildVideoConvertArgs('in', 'out', 'mp4', 'medium', 'mpeg4')).toEqual(
      expect.arrayContaining(['-q:v', '4'])
    );
    expect(buildVideoConvertArgs('in', 'out', 'mp4', 'low', 'mpeg4')).toEqual(
      expect.arrayContaining(['-q:v', '6'])
    );
  });
});

describe('encoder detection', () => {
  it('prefers libx264 and then fallbacks', async () => {
    const { detectH264Encoder } = await load();
    state.runCommand.mockResolvedValueOnce('libx264 libopenh264');
    expect(await detectH264Encoder()).toBe('libx264');
    state.runCommand.mockResolvedValueOnce('libopenh264');
    expect(await detectH264Encoder()).toBe('libopenh264');
    state.runCommand.mockResolvedValueOnce('h264_mf');
    expect(await detectH264Encoder()).toBe('h264_mf');
    state.runCommand.mockResolvedValueOnce('nothing');
    expect(await detectH264Encoder()).toBe('mpeg4');
  });

  it('falls back to the ffmpeg name and mpeg4 on errors', async () => {
    const { detectH264Encoder } = await load();
    state.resolveBin.mockResolvedValueOnce(null);
    state.runCommand.mockResolvedValueOnce('libx264');
    expect(await detectH264Encoder()).toBe('libx264');
    expect(state.runCommand.mock.calls.at(-1)?.[0]).toBe('ffmpeg');

    state.runCommand.mockRejectedValueOnce(new Error('exec'));
    expect(await detectH264Encoder()).toBe('mpeg4');
  });
});

describe('duration probing', () => {
  it('returns positive durations', async () => {
    const { probeDuration } = await load();
    expect(await probeDuration('C:/a.mp4')).toBe(10.5);
    expect(state.runCommand).toHaveBeenCalledWith(
      '/bin/ffmpeg',
      expect.arrayContaining(['--', 'C:/a.mp4']),
      { timeout: 15000 }
    );
  });

  it('returns zero for invalid values and failures', async () => {
    const { probeDuration } = await load();
    state.runCommand.mockResolvedValueOnce('not-a-number');
    expect(await probeDuration('C:/a.mp4')).toBe(0);
    state.runCommand.mockResolvedValueOnce('-3');
    expect(await probeDuration('C:/a.mp4')).toBe(0);
    state.runCommand.mockRejectedValueOnce(new Error('probe'));
    expect(await probeDuration('C:/a.mp4')).toBe(0);
    state.resolveBin.mockResolvedValueOnce(null);
    state.runCommand.mockResolvedValueOnce('5');
    expect(await probeDuration('C:/a.mp4')).toBe(5);
    expect(state.runCommand.mock.calls.at(-1)?.[0]).toBe('ffprobe');
  });
});

describe('convertMedia', () => {
  it('validates the request', async () => {
    const { convertMedia } = await load();
    expect(await convertMedia(sender(), null as never)).toEqual({
      success: false,
      error: 'Invalid job id'
    });
    expect(await convertMedia(sender(), request({ jobId: '' }))).toEqual({
      success: false,
      error: 'Invalid job id'
    });
    expect(await convertMedia(sender(), request({ kind: 'image' }))).toEqual({
      success: false,
      error: 'Invalid media kind'
    });
    state.isSafeAbsolutePath.mockReturnValueOnce(false);
    expect(await convertMedia(sender(), request())).toEqual({
      success: false,
      error: 'Invalid input path'
    });
  });

  it('requires an existing input file', async () => {
    const { convertMedia } = await load();
    state.stat.mockResolvedValueOnce({ isFile: () => false });
    expect(await convertMedia(sender(), request())).toEqual({
      success: false,
      error: 'Input file does not exist'
    });
    state.stat.mockRejectedValueOnce(new Error('ENOENT'));
    expect(await convertMedia(sender(), request())).toEqual({
      success: false,
      error: 'Input file does not exist'
    });
  });

  it('validates the output folder', async () => {
    const { convertMedia } = await load();
    state.isSafeAbsolutePath.mockImplementation((path: string) => path !== 'relative');
    expect(await convertMedia(sender(), request({ outputDir: 'relative' }))).toEqual({
      success: false,
      error: 'Invalid output folder'
    });

    state.isProtectedPath.mockReturnValueOnce(true);
    expect(await convertMedia(sender(), request({ outputDir: 'C:/Windows' }))).toEqual({
      success: false,
      error: 'Invalid output folder'
    });
  });

  it('reports folder creation failures', async () => {
    const { convertMedia } = await load();
    state.mkdir.mockRejectedValueOnce(new Error('denied'));
    expect(await convertMedia(sender(), request())).toEqual({
      success: false,
      error: 'Cannot create output folder: Error: denied'
    });
  });

  it('runs audio conversions with defaults', async () => {
    const { convertMedia } = await load();
    state.stat.mockResolvedValueOnce({ isFile: () => true });
    const result = await convertMedia(
      sender(),
      request({ audioFormat: 'invalid', audioBitrate: 999 })
    );

    expect(result).toMatchObject({ success: true });
    const job = state.runJob.mock.calls[0][0];
    expect(job).toMatchObject({
      jobId: 'job-1',
      durationSec: 10.5,
      ffmpeg: '/bin/ffmpeg',
      timeoutMessage: 'Conversion timed out',
      label: 'conversion',
      logContext: 'C:/media/in.wav'
    });
    expect(job.outputPath).toBe('C:/media/in.mp3');
    expect(job.args).toEqual(expect.arrayContaining(['libmp3lame', '192k']));
  });

  it('runs audio conversions using the requested format and bitrate', async () => {
    const { convertMedia } = await load();
    await convertMedia(sender(), request({ audioFormat: 'flac', audioBitrate: 320 }));
    const job = state.runJob.mock.calls[0][0];
    expect(job.outputPath).toBe('C:/media/in.flac');
    expect(job.args).toContain('flac');
  });

  it('runs video conversions with a detected encoder', async () => {
    const { convertMedia } = await load();
    state.runCommand.mockResolvedValueOnce('libx264').mockResolvedValueOnce('12');
    await convertMedia(
      sender(),
      request({ kind: 'video', inputPath: 'C:/media/in.mkv', videoContainer: 'mp4' })
    );

    const job = state.runJob.mock.calls[0][0];
    expect(job.outputPath).toBe('C:/media/in.mp4');
    expect(job.args).toEqual(
      expect.arrayContaining(['-c:v', 'libx264', '-movflags', '+faststart'])
    );
    expect(job.durationSec).toBe(12);
  });

  it('falls back for invalid video containers and qualities', async () => {
    const { convertMedia } = await load();
    state.runCommand.mockResolvedValueOnce('nothing').mockResolvedValueOnce('0');
    await convertMedia(
      sender(),
      request({
        kind: 'video',
        inputPath: 'C:/media/in.mkv',
        videoContainer: 'avi',
        videoQuality: 'ultra'
      })
    );
    const job = state.runJob.mock.calls[0][0];
    expect(job.outputPath).toBe('C:/media/in.mp4');
    expect(job.args).toEqual(expect.arrayContaining(['-c:v', 'mpeg4']));
    expect(job.durationSec).toBe(0);
  });

  it('uses the requested output folder', async () => {
    const { convertMedia } = await load();
    await convertMedia(sender(), request({ outputDir: '  D:/converted  ' }));
    expect(state.mkdir).toHaveBeenCalledWith('D:/converted', { recursive: true });
    expect(state.runJob.mock.calls[0][0].outputPath).toBe('D:/converted/in.mp3');
  });
});

describe('cancellation', () => {
  it('delegates narrow and global cancellation', async () => {
    const { cancelMediaConvert, cancelAllMediaConvert } = await load();
    state.cancelJob.mockReturnValue(true);
    state.cancelAll.mockReturnValue(3);
    expect(cancelMediaConvert('job-1')).toBe(true);
    expect(state.cancelJob).toHaveBeenCalledWith('job-1');
    expect(cancelAllMediaConvert()).toBe(3);
    expect(state.cancelAll).toHaveBeenCalled();
  });
});
