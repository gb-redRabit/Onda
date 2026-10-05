import { getStore } from '../ipc/cover/cover-cache';

// Readery ustawień pobierania wyodrębnione z `download-manager.ts` (plan 2.8).

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

// Górne/dolne granice chronią przed uszkodzonym ustawieniem, które inaczej dałoby
// lawinę ponowień (np. attempts=1e9) albo przepełnienie opóźnienia (baseMs=1e18).
const MIN_RETRY_ATTEMPTS = 1;
const MAX_RETRY_ATTEMPTS = 10;
const MIN_RETRY_BASE_MS = 100;
const MAX_RETRY_BASE_MS = 60_000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export async function readRetryConfig(): Promise<{ attempts: number; baseMs: number }> {
  try {
    const store = await getStore();
    const d = store.get('download') as { retryAttempts?: number; retryBaseMs?: number } | undefined;
    const attempts =
      typeof d?.retryAttempts === 'number' && Number.isFinite(d.retryAttempts)
        ? clamp(d.retryAttempts, MIN_RETRY_ATTEMPTS, MAX_RETRY_ATTEMPTS)
        : DEFAULT_RETRY_ATTEMPTS;
    const baseMs =
      typeof d?.retryBaseMs === 'number' && Number.isFinite(d.retryBaseMs)
        ? clamp(d.retryBaseMs, MIN_RETRY_BASE_MS, MAX_RETRY_BASE_MS)
        : DEFAULT_RETRY_BASE_MS;
    return { attempts, baseMs };
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
