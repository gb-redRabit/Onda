import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { existsSync } from 'fs';
import { rm } from 'fs/promises';
import type { WebContents } from 'electron';
import { resolveBin } from '../binaries';
import { logger } from '../../shared/logger';
import type { MediaConvertProgress, MediaConvertResult } from '../../shared/types/tools';
import { parseTimeToSeconds } from './video-clip-args';

// Wspólny runner zadań FFmpeg dla konwersji, cięcia i łączenia: spawn,
// parser `-progress`, timeout, anulowanie i sprzątanie plików. Wcześniej
// `media-convert.ts` i `video-clip-job.ts` miały ~100 linii niemal identycznego
// kodu, więc poprawki (np. timeout czy anulowanie) mogły się rozjechać.

export const MAX_FFMPEG_JOB_MS = 2 * 60 * 60 * 1000;

export interface ActiveFfmpegJob {
  child: ChildProcessWithoutNullStreams;
  canceled: boolean;
}

export const activeFfmpegJobs = new Map<string, ActiveFfmpegJob>();

export interface FfmpegJobOptions {
  jobId: string;
  args: string[];
  outputPath: string;
  durationSec: number;
  sender: WebContents;
  /** Komunikat zwracany po przekroczeniu `MAX_FFMPEG_JOB_MS`. */
  timeoutMessage: string;
  /** Etykieta logu, np. `conversion`, `clip` albo `concat`. */
  label: string;
  /** Dodatkowy kontekst w logu (np. ścieżka wejściowa). */
  logContext?: string;
  /** Sprzątanie po zakończeniu (np. katalog listy concat). */
  onFinish?: () => void;
  /** Wynik `resolveBin('ffmpeg')`, gdy wywołujący już go rozwiązał. */
  ffmpeg?: string;
}

function sendProgress(sender: WebContents, payload: MediaConvertProgress): void {
  if (sender.isDestroyed()) return;
  sender.send('tools:progress', payload);
}

export async function runFfmpegJob(options: FfmpegJobOptions): Promise<MediaConvertResult> {
  const ffmpeg = options.ffmpeg ?? ((await resolveBin('ffmpeg')) || 'ffmpeg');
  return new Promise<MediaConvertResult>((resolve) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(ffmpeg, options.args, { windowsHide: true });
    } catch (error) {
      resolve({ success: false, error: `Cannot start FFmpeg: ${String(error)}` });
      return;
    }
    const active: ActiveFfmpegJob = { child, canceled: false };
    activeFfmpegJobs.set(options.jobId, active);

    let stdoutBuffer = '';
    let lastPercent = 0;
    let stderrTail = '';
    let settled = false;
    let timedOut = false;

    const finish = (result: MediaConvertResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      activeFfmpegJobs.delete(options.jobId);
      options.onFinish?.();
      if (!result.success) {
        void rm(options.outputPath, { force: true }).catch(() => undefined);
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      active.canceled = true;
      try {
        child.kill();
      } catch {
        // proces mógł już zakończyć się
      }
      finish({ success: false, canceled: true, error: options.timeoutMessage });
    }, MAX_FFMPEG_JOB_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString('utf-8');
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const [key, raw] = line.split('=', 2);
        if (!key) continue;
        if (key === 'out_time_us' || key === 'out_time_ms') {
          const micros = Number(raw);
          if (!Number.isFinite(micros)) continue;
          const timeSec = micros / 1_000_000;
          lastPercent =
            options.durationSec > 0 ? Math.min(100, (timeSec / options.durationSec) * 100) : -1;
          sendProgress(options.sender, { jobId: options.jobId, percent: lastPercent, timeSec });
        } else if (key === 'out_time') {
          const timeSec = parseTimeToSeconds(raw);
          lastPercent =
            options.durationSec > 0 ? Math.min(100, (timeSec / options.durationSec) * 100) : -1;
          sendProgress(options.sender, { jobId: options.jobId, percent: lastPercent, timeSec });
        } else if (key === 'speed') {
          sendProgress(options.sender, {
            jobId: options.jobId,
            percent: lastPercent,
            speed: raw
          });
        }
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString('utf-8')).slice(-4000);
    });

    child.on('error', (error) => {
      finish({ success: false, error: `FFmpeg failed: ${error.message}` });
    });

    child.on('close', (code) => {
      if (active.canceled) {
        finish({ success: false, canceled: true });
        return;
      }
      if (timedOut) {
        finish({ success: false, canceled: true, error: options.timeoutMessage });
        return;
      }
      if (code === 0 && existsSync(options.outputPath)) {
        sendProgress(options.sender, { jobId: options.jobId, percent: 100 });
        finish({ success: true, outputPath: options.outputPath });
        return;
      }
      const context = options.logContext ? ` for ${options.logContext}` : '';
      logger.warn('tools', `${options.label} failed (${code})${context}`);
      finish({
        success: false,
        error: stderrTail.trim() || `FFmpeg exited with code ${code}`
      });
    });
  });
}

export function cancelFfmpegJob(jobId: string): boolean {
  const job = activeFfmpegJobs.get(jobId);
  if (!job) return false;
  job.canceled = true;
  try {
    job.child.kill();
  } catch {
    // proces mógł już zakończyć się
  }
  return true;
}

/** Anuluje wszystkie aktywne zadania FFmpeg przy zamykaniu aplikacji. */
export function cancelAllFfmpegJobs(): number {
  const ids = [...activeFfmpegJobs.keys()];
  for (const id of ids) cancelFfmpegJob(id);
  return ids.length;
}
