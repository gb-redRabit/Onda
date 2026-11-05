import { describe, expect, it } from 'vitest';
import { clipVideo, concatVideos } from '../video-clip';

const sender = {} as never;

describe('video tool validation', () => {
  it('rejects a clip without a job id or safe input path', async () => {
    await expect(
      clipVideo(sender, { jobId: '', inputPath: '/a.mp4', startSec: 0, endSec: 1 } as never)
    ).resolves.toEqual({ success: false, error: 'Invalid job id' });

    await expect(
      clipVideo(sender, {
        jobId: 'clip-1',
        inputPath: 'relative.mp4',
        startSec: 0,
        endSec: 1
      } as never)
    ).resolves.toEqual({ success: false, error: 'Invalid input path' });
  });

  it('rejects an inverted or empty clip range', async () => {
    await expect(
      clipVideo(sender, {
        jobId: 'clip-2',
        inputPath: '/a.mp4',
        startSec: 5,
        endSec: 5
      } as never)
    ).resolves.toEqual({ success: false, error: 'Invalid clip range' });
  });

  it('rejects an unknown output container', async () => {
    await expect(
      clipVideo(sender, {
        jobId: 'clip-3',
        inputPath: '/a.mp4',
        startSec: 0,
        endSec: 1,
        container: 'avi'
      } as never)
    ).resolves.toEqual({ success: false, error: 'Invalid output container' });
  });

  it('requires at least two inputs for concatenation', async () => {
    await expect(
      concatVideos(sender, { jobId: 'concat-1', inputPaths: ['/a.mp4'] } as never)
    ).resolves.toEqual({ success: false, error: 'Select at least two videos' });
  });

  it('rejects too many inputs and an unknown container before touching disk', async () => {
    await expect(
      concatVideos(sender, {
        jobId: 'concat-2',
        inputPaths: Array.from({ length: 51 }, (_unused, i) => `/v${i}.mp4`),
        container: 'mp4'
      } as never)
    ).resolves.toEqual({ success: false, error: 'Too many input files' });

    await expect(
      concatVideos(sender, {
        jobId: 'concat-3',
        inputPaths: ['/a.mp4', '/b.mp4'],
        container: 'avi'
      } as never)
    ).resolves.toEqual({ success: false, error: 'Invalid output container' });
  });
});
