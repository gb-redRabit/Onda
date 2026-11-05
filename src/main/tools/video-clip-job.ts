import type { MediaConvertResult } from '../../shared/types/tools';
import {
  MAX_FFMPEG_JOB_MS,
  cancelAllFfmpegJobs,
  cancelFfmpegJob,
  runFfmpegJob,
  type FfmpegJobOptions
} from './ffmpeg-job';

// Cienka warstwa zgodności dla cięcia/łączenia; cały runner żyje w `ffmpeg-job.ts`.

export const MAX_JOB_MS = MAX_FFMPEG_JOB_MS;
export type MediaJobOptions = Omit<FfmpegJobOptions, 'ffmpeg'>;

export function runMediaJob(options: MediaJobOptions): Promise<MediaConvertResult> {
  return runFfmpegJob(options);
}

export function cancelMediaJob(jobId: string): boolean {
  return cancelFfmpegJob(jobId);
}

/** Anuluje wszystkie aktywne cięcia/łączenia przy zamykaniu aplikacji. */
export function cancelAllMediaJobs(): number {
  return cancelAllFfmpegJobs();
}
