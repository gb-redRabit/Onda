import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  mkdir: vi.fn(),
  mkdtemp: vi.fn(),
  rm: vi.fn(),
  stat: vi.fn(),
  writeFile: vi.fn(),
  tmpdir: vi.fn(),
  loggerWarn: vi.fn(),
  isProtectedPath: vi.fn(),
  isSafeAbsolutePath: vi.fn(),
  detectEncoder: vi.fn(),
  probeDuration: vi.fn(),
  buildClipArgs: vi.fn(),
  buildConcatArgs: vi.fn(),
  buildThumbnailArgs: vi.fn(),
  parseFrameRate: vi.fn(),
  resolveClipOutputPath: vi.fn(),
  resolveConcatOutputPath: vi.fn(),
  cancelJob: vi.fn(),
  runJob: vi.fn(),
  clipContainers: new Set(['mp4', 'mkv', 'webm'])
}));

vi.mock('fs/promises', () => ({
  mkdir: state.mkdir,
  mkdtemp: state.mkdtemp,
  rm: state.rm,
  stat: state.stat,
  writeFile: state.writeFile
}));
vi.mock('os', () => ({ tmpdir: state.tmpdir }));
vi.mock('path', () => ({
  dirname: (path: string) => path.replace(/\\/g, '/').slice(0, path.lastIndexOf('/')),
  join: (...parts: string[]) => parts.join('/')
}));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: vi.fn(), error: vi.fn() }
}));
vi.mock('../../path-policy', () => ({ isProtectedPath: state.isProtectedPath }));
vi.mock('../../utils/validate', () => ({ isSafeAbsolutePath: state.isSafeAbsolutePath }));
vi.mock('../media-convert', () => ({
  detectH264Encoder: state.detectEncoder,
  probeDuration: state.probeDuration
}));
vi.mock('../video-clip-args', () => ({
  buildClipArgs: state.buildClipArgs,
  buildConcatArgs: state.buildConcatArgs,
  buildClipThumbnailArgs: state.buildThumbnailArgs,
  parseFrameRate: state.parseFrameRate,
  resolveClipOutputPath: state.resolveClipOutputPath,
  resolveConcatOutputPath: state.resolveConcatOutputPath,
  CLIP_CONTAINERS: state.clipContainers
}));
vi.mock('../video-clip-job', () => ({
  cancelMediaJob: state.cancelJob,
  runMediaJob: state.runJob
}));
vi.mock('../video-clip-thumbnails', () => ({ clipThumbnails: vi.fn() }));

async function load() {
  return import('../video-clip');
}

function clip(overrides: Record<string, unknown> = {}) {
  return {
    jobId: 'job-1',
    inputPath: 'C:/video/in.mp4',
    startSec: 1,
    endSec: 5,
    container: 'mp4',
    ...overrides
  } as any;
}

function concat(overrides: Record<string, unknown> = {}) {
  return {
    jobId: 'job-2',
    inputPaths: ['C:/video/a.mp4', 'C:/video/b.mp4'],
    container: 'mp4',
    ...overrides
  } as any;
}

function sender() {
  return { id: 1 } as never;
}

beforeEach(() => {
  state.mkdir.mockReset();
  state.mkdir.mockResolvedValue(undefined);
  state.mkdtemp.mockReset();
  state.mkdtemp.mockResolvedValue('C:/temp/onda-concat-x');
  state.rm.mockReset();
  state.rm.mockResolvedValue(undefined);
  state.stat.mockReset();
  state.stat.mockResolvedValue({ isFile: () => true });
  state.writeFile.mockReset();
  state.writeFile.mockResolvedValue(undefined);
  state.tmpdir.mockReturnValue('C:/temp');
  state.loggerWarn.mockReset();
  state.isProtectedPath.mockReset();
  state.isProtectedPath.mockReturnValue(false);
  state.isSafeAbsolutePath.mockReset();
  state.isSafeAbsolutePath.mockReturnValue(true);
  state.detectEncoder.mockReset();
  state.detectEncoder.mockResolvedValue('libx264');
  state.probeDuration.mockReset();
  state.probeDuration.mockResolvedValue(0);
  state.buildClipArgs.mockReset();
  state.buildClipArgs.mockReturnValue(['-clip']);
  state.buildConcatArgs.mockReset();
  state.buildConcatArgs.mockReturnValue(['-concat']);
  state.resolveClipOutputPath.mockReset();
  state.resolveClipOutputPath.mockReturnValue('C:/video/out.mp4');
  state.resolveConcatOutputPath.mockReset();
  state.resolveConcatOutputPath.mockReturnValue('C:/video/joined.mp4');
  state.cancelJob.mockReset();
  state.runJob.mockReset();
  state.runJob.mockResolvedValue({ success: true, outputPath: 'C:/video/out.mp4' });
});

describe('clipVideo', () => {
  it('runs a copy clip with defaults', async () => {
    const { clipVideo } = await load();
    const result = await clipVideo(sender(), clip());

    expect(result).toMatchObject({ success: true });
    expect(state.resolveClipOutputPath).toHaveBeenCalledWith('C:/video/in.mp4', undefined, 'mp4');
    expect(state.mkdir).toHaveBeenCalledWith('C:/video', { recursive: true });
    expect(state.detectEncoder).not.toHaveBeenCalled();
    expect(state.buildClipArgs).toHaveBeenCalledWith('C:/video/in.mp4', 'C:/video/out.mp4', 1, 5, {
      container: 'mp4',
      mode: 'copy',
      format: 'video',
      audio: 'keep',
      rotation: 0,
      targetSizeMb: 0,
      encoder: 'libx264'
    });
    expect(state.runJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      args: ['-clip'],
      outputPath: 'C:/video/out.mp4',
      durationSec: 4,
      sender: sender(),
      timeoutMessage: 'Clip timed out',
      label: 'clip',
      logContext: 'C:/video/in.mp4'
    });
  });

  it('detects an encoder when re-encoding is needed', async () => {
    const { clipVideo } = await load();
    await clipVideo(sender(), clip({ mode: 'exact' }));
    expect(state.detectEncoder).toHaveBeenCalled();
    expect(state.buildClipArgs.mock.calls[0][4]).toMatchObject({
      mode: 'exact',
      encoder: 'libx264'
    });
  });

  it('forces re-encoding for rotation, mute and target size', async () => {
    const { clipVideo } = await load();
    await clipVideo(sender(), clip({ rotation: 90, audio: 'mute', targetSizeMb: 500 }));
    expect(state.detectEncoder).toHaveBeenCalled();
    expect(state.buildClipArgs.mock.calls[0][4]).toMatchObject({
      rotation: 90,
      audio: 'mute',
      targetSizeMb: 500
    });
  });

  it('skips encoder detection for WebM and GIF', async () => {
    const { clipVideo } = await load();
    state.resolveClipOutputPath.mockReturnValue('C:/video/out.gif');
    await clipVideo(sender(), clip({ container: 'webm', mode: 'exact' }));
    expect(state.detectEncoder).not.toHaveBeenCalled();

    await clipVideo(sender(), clip({ format: 'gif', container: 'webm' }));
    expect(state.resolveClipOutputPath).toHaveBeenLastCalledWith(
      'C:/video/in.mp4',
      undefined,
      'gif'
    );
    expect(state.buildClipArgs.mock.calls[1][4]).toMatchObject({ format: 'gif' });
  });

  it('normalises mode, audio, rotation and target size', async () => {
    const { clipVideo } = await load();
    await clipVideo(
      sender(),
      clip({
        mode: 'odd',
        audio: 'remove',
        rotation: 45,
        targetSizeMb: 2000
      })
    );
    expect(state.buildClipArgs.mock.calls[0][4]).toMatchObject({
      mode: 'copy',
      audio: 'remove',
      rotation: 0,
      targetSizeMb: 1000
    });

    await clipVideo(sender(), clip({ targetSizeMb: -1, rotation: 270 }));
    expect(state.buildClipArgs.mock.calls[1][4]).toMatchObject({
      rotation: 270,
      targetSizeMb: 0
    });
  });

  it('clamps the range to the source duration', async () => {
    state.probeDuration.mockResolvedValueOnce(100);
    const { clipVideo } = await load();
    await clipVideo(sender(), clip({ startSec: 95, endSec: 200 }));
    expect(state.buildClipArgs.mock.calls[0].slice(2, 4)).toEqual([95, 100]);

    state.probeDuration.mockResolvedValueOnce(5);
    await clipVideo(sender(), clip({ startSec: 4, endSec: 10 }));
    expect(state.buildClipArgs.mock.calls[1].slice(2, 4)).toEqual([4, 5]);
  });

  it('rejects ranges that are too short after clamping', async () => {
    const { clipVideo } = await load();
    expect(await clipVideo(sender(), clip({ startSec: 0, endSec: 0.04 }))).toEqual({
      success: false,
      error: 'Clip range is outside the video'
    });
    expect(state.runJob).not.toHaveBeenCalled();
  });

  it('validates output folders', async () => {
    const { clipVideo } = await load();
    state.isSafeAbsolutePath.mockImplementation((path: string) => path !== 'relative');
    expect(await clipVideo(sender(), clip({ outputDir: 'relative' }))).toEqual({
      success: false,
      error: 'Invalid output folder'
    });

    state.isProtectedPath.mockReturnValueOnce(true);
    expect(await clipVideo(sender(), clip({ outputDir: 'C:/Windows' }))).toEqual({
      success: false,
      error: 'Invalid output folder'
    });
  });

  it('passes a trimmed output directory', async () => {
    const { clipVideo } = await load();
    await clipVideo(sender(), clip({ outputDir: '  D:/clips  ' }));
    expect(state.resolveClipOutputPath).toHaveBeenCalledWith('C:/video/in.mp4', 'D:/clips', 'mp4');
  });

  it('reports folder creation failures', async () => {
    state.mkdir.mockRejectedValueOnce(new Error('denied'));
    const { clipVideo } = await load();
    expect(await clipVideo(sender(), clip())).toEqual({
      success: false,
      error: 'Cannot create output folder: Error: denied'
    });
  });
});

describe('concatVideos', () => {
  it('writes a concat list and runs the job', async () => {
    state.probeDuration.mockResolvedValueOnce(3).mockResolvedValueOnce(4);
    const { concatVideos } = await load();
    const result = await concatVideos(sender(), concat());

    expect(result).toMatchObject({ success: true });
    expect(state.mkdtemp).toHaveBeenCalledWith('C:/temp/onda-concat-');
    expect(state.writeFile).toHaveBeenCalledWith(
      'C:/temp/onda-concat-x/inputs.txt',
      "file 'C:/video/a.mp4'\nfile 'C:/video/b.mp4'",
      'utf8'
    );
    expect(state.resolveConcatOutputPath).toHaveBeenCalledWith(
      ['C:/video/a.mp4', 'C:/video/b.mp4'],
      undefined,
      'mp4'
    );
    expect(state.detectEncoder).not.toHaveBeenCalled();
    expect(state.buildConcatArgs).toHaveBeenCalledWith(
      'C:/temp/onda-concat-x/inputs.txt',
      'C:/video/joined.mp4',
      { container: 'mp4', mode: 'copy', audio: 'keep', encoder: 'libx264' }
    );
    expect(state.runJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-2',
        args: ['-concat'],
        outputPath: 'C:/video/joined.mp4',
        durationSec: 7,
        timeoutMessage: 'Concat timed out',
        label: 'concat'
      })
    );
  });

  it('escapes quotes and backslashes in the concat list', async () => {
    const { concatVideos } = await load();
    await concatVideos(sender(), concat({ inputPaths: ["C:\\video\\a's.mp4", 'C:/video/b.mp4'] }));
    expect(state.writeFile).toHaveBeenCalledWith(
      'C:/temp/onda-concat-x/inputs.txt',
      "file 'C:/video/a'\\''s.mp4'\nfile 'C:/video/b.mp4'",
      'utf8'
    );
  });

  it('cleans up the list directory when the job finishes', async () => {
    const { concatVideos } = await load();
    await concatVideos(sender(), concat());
    const onFinish = state.runJob.mock.calls[0][0].onFinish;
    onFinish();
    await Promise.resolve();
    expect(state.rm).toHaveBeenCalledWith('C:/temp/onda-concat-x', {
      recursive: true,
      force: true
    });
  });

  it('re-encodes for exact mode, mute and WebM cases', async () => {
    const { concatVideos } = await load();
    await concatVideos(sender(), concat({ mode: 'exact' }));
    expect(state.detectEncoder).toHaveBeenCalledTimes(1);
    expect(state.buildConcatArgs.mock.calls[0][2]).toMatchObject({
      mode: 'exact',
      encoder: 'libx264'
    });

    await concatVideos(sender(), concat({ audio: 'mute' }));
    expect(state.buildConcatArgs.mock.calls[1][2]).toMatchObject({ mode: 'exact' });

    await concatVideos(sender(), concat({ container: 'webm', mode: 'exact' }));
    expect(state.detectEncoder).toHaveBeenCalledTimes(2);
    expect(state.buildConcatArgs.mock.calls[2][2]).toMatchObject({
      container: 'webm',
      mode: 'exact',
      encoder: 'libx264'
    });
  });

  it('validates each input path', async () => {
    const { concatVideos } = await load();
    state.isSafeAbsolutePath.mockImplementation((path: string) => path !== 'relative');
    expect(await concatVideos(sender(), concat({ inputPaths: ['C:/a.mp4', 'relative'] }))).toEqual({
      success: false,
      error: 'Invalid input path'
    });

    state.stat.mockResolvedValueOnce({ isFile: () => false });
    expect(await concatVideos(sender(), concat())).toEqual({
      success: false,
      error: 'Input file does not exist'
    });

    state.stat.mockRejectedValueOnce(new Error('ENOENT'));
    expect(await concatVideos(sender(), concat())).toEqual({
      success: false,
      error: 'Input file does not exist'
    });
  });

  it('validates the output folder and creation', async () => {
    const { concatVideos } = await load();
    state.isSafeAbsolutePath.mockImplementation((path: string) => path !== 'relative');
    expect(await concatVideos(sender(), concat({ outputDir: 'relative' }))).toEqual({
      success: false,
      error: 'Invalid output folder'
    });

    state.mkdir.mockRejectedValueOnce(new Error('denied'));
    expect(await concatVideos(sender(), concat())).toEqual({
      success: false,
      error: 'Cannot create output folder: Error: denied'
    });
  });

  it('cleans up and reports listing errors', async () => {
    state.writeFile.mockRejectedValueOnce(new Error('disk'));
    const { concatVideos } = await load();
    expect(await concatVideos(sender(), concat())).toEqual({
      success: false,
      error: 'Concat failed: Error: disk'
    });
    await Promise.resolve();
    expect(state.rm).toHaveBeenCalledWith('C:/temp/onda-concat-x', {
      recursive: true,
      force: true
    });
    expect(state.loggerWarn).toHaveBeenCalledWith('tools', 'concat failed: Error: disk');
  });

  it('does not clean a directory that was never created', async () => {
    state.mkdtemp.mockRejectedValueOnce(new Error('mkdir'));
    const { concatVideos } = await load();
    expect(await concatVideos(sender(), concat())).toEqual({
      success: false,
      error: 'Concat failed: Error: mkdir'
    });
    expect(state.rm).not.toHaveBeenCalled();
  });
});

describe('cancellation', () => {
  it('delegates clip and concat cancellation', async () => {
    const { cancelVideoClip, cancelVideoConcat } = await load();
    state.cancelJob.mockReturnValueOnce(true).mockReturnValueOnce(false);
    expect(cancelVideoClip('a')).toBe(true);
    expect(cancelVideoConcat('b')).toBe(false);
    expect(state.cancelJob.mock.calls).toEqual([['a'], ['b']]);
  });
});
