import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_THUMB_SIZE } from '../../../../shared/constants';

const state = vi.hoisted(() => ({
  access: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  rm: vi.fn(),
  mkdtemp: vi.fn(),
  runCommand: vi.fn(),
  resolveBin: vi.fn(),
  nativeThumb: vi.fn(),
  fileIcon: vi.fn(),
  getThumbnail: vi.fn(),
  extractCover: vi.fn(),
  clearDir: vi.fn(),
  sourceStamp: vi.fn(),
  loadSharp: vi.fn(),
  sharp: vi.fn(),
  pipeline: null as any,
  loggerWarn: vi.fn(),
  cpus: vi.fn(() => [{}, {}]),
  tmpdir: vi.fn(() => 'C:/Temp')
}));

vi.mock('electron', () => ({
  app: { getFileIcon: state.fileIcon },
  nativeImage: { createThumbnailFromPath: state.nativeThumb }
}));
vi.mock('fs/promises', () => ({
  access: state.access,
  readFile: state.readFile,
  writeFile: state.writeFile,
  mkdir: state.mkdir,
  rm: state.rm,
  mkdtemp: state.mkdtemp
}));
vi.mock('os', () => ({
  default: { tmpdir: state.tmpdir, cpus: state.cpus }
}));
vi.mock('../../../utils/lazy-sharp', () => ({ loadSharp: state.loadSharp }));
vi.mock('../../cover/cover-cache', () => ({ extractAndCacheCover: state.extractCover }));
vi.mock('../../../utils/sharp', () => ({
  SharpService: { getThumbnail: state.getThumbnail }
}));
vi.mock('../../../utils/clear-dir', () => ({ clearDirContents: state.clearDir }));
vi.mock('../../../utils/exec', () => ({ runCommand: state.runCommand }));
vi.mock('../../../binaries', () => ({ resolveBin: state.resolveBin }));
vi.mock('../../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: vi.fn(), error: vi.fn() }
}));
vi.mock('../../../utils/source-stamp', () => ({ sourceStamp: state.sourceStamp }));

import {
  batchThumbnails,
  clearThumbnailCache,
  getThumbnail,
  videoFrameArgs,
  videoFrameThumbnail
} from '../media-thumbnails';

function icon(jpeg = Buffer.from('native')) {
  return {
    isEmpty: () => false,
    toJPEG: () => jpeg,
    toDataURL: () => 'data:icon'
  };
}

beforeEach(() => {
  state.access.mockReset();
  state.access.mockRejectedValue(new Error('missing'));
  state.readFile.mockReset();
  state.readFile.mockImplementation(async (path: string) =>
    path.includes('frame') ? Buffer.from('raw') : Buffer.from('cached')
  );
  state.writeFile.mockReset();
  state.writeFile.mockResolvedValue(undefined);
  state.mkdir.mockReset();
  state.mkdir.mockResolvedValue(undefined);
  state.rm.mockReset();
  state.rm.mockResolvedValue(undefined);
  state.mkdtemp.mockReset();
  state.mkdtemp.mockResolvedValue('C:/Temp/vthumb');
  state.runCommand.mockReset();
  state.runCommand.mockResolvedValue(undefined);
  state.resolveBin.mockReset();
  state.resolveBin.mockResolvedValue('ffmpeg');
  state.nativeThumb.mockReset();
  state.nativeThumb.mockResolvedValue(icon());
  state.fileIcon.mockReset();
  state.fileIcon.mockResolvedValue(icon(Buffer.from('shellicon')));
  state.getThumbnail.mockReset();
  state.getThumbnail.mockResolvedValue(null);
  state.extractCover.mockReset();
  state.extractCover.mockResolvedValue({ type: null, data: null });
  state.clearDir.mockReset();
  state.clearDir.mockResolvedValue({ removed: 2, bytesFreed: 100 });
  state.sourceStamp.mockReset();
  state.sourceStamp.mockResolvedValue('stamp');
  state.pipeline = {
    resize: vi.fn(function (this: any) {
      return this;
    }),
    jpeg: vi.fn(function (this: any) {
      return this;
    }),
    toBuffer: vi.fn(async () => Buffer.from('sharp'))
  };
  state.sharp.mockReset();
  state.sharp.mockImplementation(() => state.pipeline);
  state.loadSharp.mockReset();
  state.loadSharp.mockResolvedValue(state.sharp);
  state.loggerWarn.mockReset();
  state.cpus.mockReturnValue([{}, {}]);
});

describe('cache helpers', () => {
  it('clears the shared thumbnail cache', async () => {
    await expect(clearThumbnailCache()).resolves.toEqual({ removed: 2, bytesFreed: 100 });
    expect(state.clearDir).toHaveBeenCalled();
  });

  it('serves a cached data URL without rebuilding', async () => {
    state.access.mockResolvedValue(undefined);
    state.readFile.mockResolvedValue(Buffer.from('cached'));

    await expect(getThumbnail('D:/a.png', 100)).resolves.toBe(
      `data:image/jpeg;base64,${Buffer.from('cached').toString('base64')}`
    );
    expect(state.nativeThumb).not.toHaveBeenCalled();
  });
});

describe('build strategies', () => {
  it('builds images from the shell thumbnail', async () => {
    const result = await getThumbnail('D:/a.png', 100);

    expect(state.nativeThumb).toHaveBeenCalledWith('D:/a.png', { width: 100, height: 100 });
    expect(state.writeFile).toHaveBeenCalledWith(expect.any(String), Buffer.from('native'));
    expect(result).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('sanitizes thumbnail sizes', async () => {
    await getThumbnail('D:/a.png', 5);
    expect(state.nativeThumb).toHaveBeenLastCalledWith('D:/a.png', { width: 320, height: 320 });

    await getThumbnail('D:/a.png', 99_999);
    expect(state.nativeThumb).toHaveBeenLastCalledWith('D:/a.png', {
      width: MAX_THUMB_SIZE,
      height: MAX_THUMB_SIZE
    });

    await getThumbnail('D:/a.png', 'nope' as unknown as number);
    expect(state.nativeThumb).toHaveBeenLastCalledWith('D:/a.png', { width: 320, height: 320 });
  });

  it('uses SharpService for audio and skips the shell thumbnail', async () => {
    state.getThumbnail.mockResolvedValueOnce(Buffer.from('sharp'));
    state.extractCover.mockResolvedValueOnce({ type: 'image', data: null });

    const result = await getThumbnail('D:/a.mp3', 80);

    expect(state.nativeThumb).not.toHaveBeenCalled();
    expect(state.getThumbnail).toHaveBeenCalledWith('D:/a.mp3', 80);
    expect(result).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('falls back to an embedded audio cover', async () => {
    state.getThumbnail.mockResolvedValueOnce(null);
    state.extractCover.mockResolvedValueOnce({
      type: 'image',
      data: `data:image/png;base64,${Buffer.from('cover').toString('base64')}`
    });

    const result = await getThumbnail('D:/a.mp3', 80);

    expect(state.writeFile).toHaveBeenCalledWith(expect.any(String), Buffer.from('cover'));
    expect(result).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('downscales large covers', async () => {
    state.getThumbnail.mockResolvedValueOnce(null);
    state.extractCover.mockResolvedValueOnce({
      type: 'image',
      data: `data:image/png;base64,${Buffer.alloc(60_000, 1).toString('base64')}`
    });

    await getThumbnail('D:/a.mp3', 80);

    expect(state.sharp).toHaveBeenCalled();
    expect(state.pipeline.resize).toHaveBeenCalledWith(80, 80, { fit: 'outside' });
    expect(state.writeFile).toHaveBeenCalledWith(expect.any(String), Buffer.from('sharp'));
  });

  it('logs large-cover downscale failures and keeps the original', async () => {
    state.getThumbnail.mockResolvedValueOnce(null);
    state.extractCover.mockResolvedValueOnce({
      type: 'image',
      data: `data:image/png;base64,${Buffer.alloc(60_000, 1).toString('base64')}`
    });
    state.loadSharp.mockRejectedValueOnce(new Error('sharp'));

    const result = await getThumbnail('D:/a.mp3', 80);

    expect(state.loggerWarn).toHaveBeenCalledWith(
      'media',
      'cover downscale failed for D:/a.mp3',
      expect.any(Error)
    );
    expect(result).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('uses the shell icon for non-media files', async () => {
    state.nativeThumb.mockResolvedValueOnce({ isEmpty: () => true });
    state.getThumbnail.mockResolvedValueOnce(null);

    const result = await getThumbnail('D:/doc.pdf', 60);

    expect(state.fileIcon).toHaveBeenCalledWith('D:/doc.pdf', { size: 'normal' });
    expect(result).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('returns null when nothing can be produced', async () => {
    state.nativeThumb.mockResolvedValueOnce({ isEmpty: () => true });
    state.getThumbnail.mockResolvedValueOnce(null);
    state.fileIcon.mockResolvedValueOnce({ isEmpty: () => true });

    await expect(getThumbnail('D:/doc.pdf', 60)).resolves.toBeNull();
    expect(state.writeFile).not.toHaveBeenCalled();
  });

  it('builds video thumbnails through the FFmpeg frame path', async () => {
    await getThumbnail('D:/clip.mp4', 120);

    expect(state.resolveBin).toHaveBeenCalledWith('ffmpeg');
    expect(state.runCommand).toHaveBeenCalledWith(
      'ffmpeg',
      videoFrameArgs('D:/clip.mp4', expect.stringContaining('frame.jpg'), '1'),
      { timeout: 20000 }
    );
    expect(state.sharp).toHaveBeenCalled();
  });

  it('logs unexpected build failures', async () => {
    state.sourceStamp.mockRejectedValueOnce(new Error('stat'));
    await expect(getThumbnail('D:/a.png', 60)).resolves.toBeNull();

    expect(state.loggerWarn).toHaveBeenCalledWith(
      'media',
      'getThumbnail failed for D:/a.png',
      expect.any(Error)
    );
  });

  it('deduplicates concurrent builds', async () => {
    let release!: (value: Buffer) => void;
    state.getThumbnail.mockImplementation(
      () =>
        new Promise<Buffer>((resolve) => {
          release = resolve;
        })
    );

    const first = getThumbnail('D:/a.mp3', 80);
    const second = getThumbnail('D:/a.mp3', 80);
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(state.getThumbnail).toHaveBeenCalledTimes(1);

    release(Buffer.from('sharp'));
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });
});

describe('video frames', () => {
  it('builds FFmpeg arguments', () => {
    expect(videoFrameArgs('D:/a.mp4', 'C:/out.jpg', '3')).toEqual([
      '-v',
      'quiet',
      '-ss',
      '3',
      '-i',
      'D:/a.mp4',
      '-frames:v',
      '1',
      '-q:v',
      '3',
      '-update',
      '1',
      'C:/out.jpg',
      '-y'
    ]);
  });

  it('returns null when the temp folder cannot be created', async () => {
    state.mkdtemp.mockRejectedValueOnce(new Error('tmp'));
    await expect(videoFrameThumbnail('D:/a.mp4', 100)).resolves.toBeNull();
  });

  it('retries at zero seconds and scales the frame', async () => {
    state.runCommand.mockRejectedValueOnce(new Error('seek')).mockResolvedValueOnce(undefined);

    const result = await videoFrameThumbnail('D:/a.mp4', 100);

    expect(state.runCommand).toHaveBeenCalledTimes(2);
    expect(state.runCommand.mock.calls[1][1]).toContain('0');
    expect(state.pipeline.resize).toHaveBeenCalledWith(100, 100, {
      fit: 'outside',
      withoutEnlargement: true
    });
    expect(result).toEqual(Buffer.from('sharp'));
    expect(state.rm).toHaveBeenCalledWith('C:/Temp/vthumb', { recursive: true, force: true });
  });

  it('returns null when both frame attempts fail', async () => {
    state.runCommand.mockRejectedValue(new Error('ffmpeg'));
    await expect(videoFrameThumbnail('D:/a.mp4', 100)).resolves.toBeNull();
  });

  it('returns null for an empty frame', async () => {
    state.readFile.mockResolvedValue(Buffer.alloc(0));
    await expect(videoFrameThumbnail('D:/a.mp4', 100)).resolves.toBeNull();
  });

  it('logs unexpected frame failures and cleans up', async () => {
    state.loadSharp.mockRejectedValueOnce(new Error('sharp'));

    await expect(videoFrameThumbnail('D:/a.mp4', 100)).resolves.toBeNull();

    expect(state.loggerWarn).toHaveBeenCalledWith(
      'media',
      'video frame thumbnail failed for D:/a.mp4',
      expect.any(Error)
    );
    expect(state.rm).toHaveBeenCalled();
  });
});

describe('batch thumbnails', () => {
  it('returns built and cached thumbnails', async () => {
    state.access.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('miss'));
    state.readFile
      .mockResolvedValueOnce(Buffer.from('cached'))
      .mockResolvedValue(Buffer.from('raw'));

    const result = await batchThumbnails(['D:/a.png', 'D:/b.png'], 64);

    expect(result['D:/a.png']).toMatch(/^data:image\/jpeg;base64,/);
    expect(result['D:/b.png']).toMatch(/^data:image\/jpeg;base64,/);
    expect(state.mkdir).toHaveBeenCalled();
    expect(state.cpus).toHaveBeenCalled();
  });

  it('skips entries that fail and logs them', async () => {
    state.sourceStamp.mockRejectedValueOnce(new Error('broken')).mockResolvedValueOnce('stamp');

    const result = await batchThumbnails(['D:/bad.png', 'D:/good.png'], 64);

    expect(result).not.toHaveProperty('D:/bad.png');
    expect(result).toHaveProperty('D:/good.png');
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'media',
      'batch thumbnail skipped for D:/bad.png',
      expect.any(Error)
    );
  });

  it('omits files with no build result', async () => {
    state.nativeThumb.mockResolvedValue({ isEmpty: () => true });
    state.getThumbnail.mockResolvedValue(null);
    state.fileIcon.mockResolvedValue({ isEmpty: () => true });

    await expect(batchThumbnails(['D:/doc.pdf'], 64)).resolves.toEqual({});
  });
});
