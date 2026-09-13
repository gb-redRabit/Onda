import { getStore } from '../ipc/cover-cache';

// Download settings readers extracted from `download-manager.ts` (plan 2.8).

export const MAX_CONCURRENT = 8;
export const DEFAULT_RETRY_ATTEMPTS = 3;
export const DEFAULT_RETRY_BASE_MS = 1500;

export async function readMaxConcurrent(): Promise<number> {
  try {
    const store = await getStore();
    const download = store.get('download') as { maxConcurrent?: number } | undefined;
    const value = download?.maxConcurrent;
    if (value && value > 0) return Math.min(value, MAX_CONCURRENT);
    return 1;
  } catch {
    return 1;
  }
}

export async function readRetryConfig(): Promise<{ attempts: number; baseMs: number }> {
  try {
    const store = await getStore();
    const d = store.get('download') as { retryAttempts?: number; retryBaseMs?: number } | undefined;
    return {
      attempts: typeof d?.retryAttempts === 'number' ? d.retryAttempts : DEFAULT_RETRY_ATTEMPTS,
      baseMs: typeof d?.retryBaseMs === 'number' ? d.retryBaseMs : DEFAULT_RETRY_BASE_MS
    };
  } catch {
    return { attempts: DEFAULT_RETRY_ATTEMPTS, baseMs: DEFAULT_RETRY_BASE_MS };
  }
}

export async function readHashFilesEnabled(): Promise<boolean> {
  try {
    const store = await getStore();
    const download = store.get('download') as { hashFiles?: boolean } | undefined;
    return !!download?.hashFiles;
  } catch {
    return false;
  }
}

export interface NightSchedule {
  enabled: boolean;
  start: number;
  end: number;
}

export async function readNightSchedule(): Promise<NightSchedule> {
  try {
    const store = await getStore();
    const download = store.get('download') as
      | {
          nightScheduleEnabled?: boolean;
          nightScheduleStart?: number;
          nightScheduleEnd?: number;
        }
      | undefined;
    return {
      enabled: !!download?.nightScheduleEnabled,
      start: download?.nightScheduleStart ?? 22,
      end: download?.nightScheduleEnd ?? 6
    };
  } catch {
    return { enabled: false, start: 22, end: 6 };
  }
}
