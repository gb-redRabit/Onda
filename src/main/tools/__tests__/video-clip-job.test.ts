import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  runFfmpegJob: vi.fn(),
  cancelFfmpegJob: vi.fn(),
  cancelAllFfmpegJobs: vi.fn()
}));

vi.mock('../ffmpeg-job', () => ({
  MAX_FFMPEG_JOB_MS: 12345,
  runFfmpegJob: h.runFfmpegJob,
  cancelFfmpegJob: h.cancelFfmpegJob,
  cancelAllFfmpegJobs: h.cancelAllFfmpegJobs
}));

import { MAX_JOB_MS, cancelAllMediaJobs, cancelMediaJob, runMediaJob } from '../video-clip-job';

beforeEach(() => {
  h.runFfmpegJob.mockReset().mockResolvedValue({ success: true });
  h.cancelFfmpegJob.mockReset().mockReturnValue(true);
  h.cancelAllFfmpegJobs.mockReset().mockReturnValue(2);
});

describe('video clip job facade', () => {
  it('exposes the shared timeout', () => {
    expect(MAX_JOB_MS).toBe(12345);
  });

  it('runs media jobs through the ffmpeg runner', async () => {
    const options = { jobId: 'j1' } as never;

    await expect(runMediaJob(options)).resolves.toEqual({ success: true });
    expect(h.runFfmpegJob).toHaveBeenCalledWith(options);
  });

  it('cancels a single job', () => {
    expect(cancelMediaJob('j1')).toBe(true);
    expect(h.cancelFfmpegJob).toHaveBeenCalledWith('j1');
  });

  it('cancels all jobs', () => {
    expect(cancelAllMediaJobs()).toBe(2);
    expect(h.cancelAllFfmpegJobs).toHaveBeenCalledTimes(1);
  });
});
