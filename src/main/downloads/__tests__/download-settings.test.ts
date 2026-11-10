import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getStore: vi.fn(),
  store: { get: vi.fn() },
  download: undefined as unknown
}));

vi.mock('../../ipc/cover/cover-cache', () => ({ getStore: h.getStore }));

import {
  DEFAULT_RETRY_ATTEMPTS,
  DEFAULT_RETRY_BASE_MS,
  MAX_CONCURRENT,
  readHashFilesEnabled,
  readMaxConcurrent,
  readNightSchedule,
  readRetryConfig
} from '../download-settings';

beforeEach(() => {
  h.download = undefined;
  h.getStore.mockReset();
  h.getStore.mockResolvedValue(h.store);
  h.store.get.mockReset();
  h.store.get.mockImplementation((key: string) => (key === 'download' ? h.download : undefined));
});

describe('readMaxConcurrent', () => {
  it('returns the stored value capped at the maximum', async () => {
    h.download = { maxConcurrent: 3 };
    await expect(readMaxConcurrent()).resolves.toBe(3);

    h.download = { maxConcurrent: 99 };
    await expect(readMaxConcurrent()).resolves.toBe(MAX_CONCURRENT);
  });

  it('falls back to one for missing or invalid values', async () => {
    for (const download of [undefined, {}, { maxConcurrent: 0 }, { maxConcurrent: -2 }]) {
      h.download = download;
      await expect(readMaxConcurrent()).resolves.toBe(1);
    }
  });

  it('falls back to one on store failures', async () => {
    h.getStore.mockRejectedValueOnce(new Error('store'));
    await expect(readMaxConcurrent()).resolves.toBe(1);
  });
});

describe('readRetryConfig', () => {
  it('returns defaults when settings are missing', async () => {
    await expect(readRetryConfig()).resolves.toEqual({
      attempts: DEFAULT_RETRY_ATTEMPTS,
      baseMs: DEFAULT_RETRY_BASE_MS
    });
  });

  it('accepts values within range', async () => {
    h.download = { retryAttempts: 5, retryBaseMs: 2500 };
    await expect(readRetryConfig()).resolves.toEqual({ attempts: 5, baseMs: 2500 });
  });

  it('clamps attempts and delays to safe bounds', async () => {
    h.download = { retryAttempts: 1000, retryBaseMs: 1 };
    await expect(readRetryConfig()).resolves.toEqual({ attempts: 10, baseMs: 100 });

    h.download = { retryAttempts: 0, retryBaseMs: 1e9 };
    await expect(readRetryConfig()).resolves.toEqual({ attempts: 1, baseMs: 60_000 });
  });

  it('ignores non-numeric and non-finite values', async () => {
    h.download = { retryAttempts: '3', retryBaseMs: Number.NaN };
    await expect(readRetryConfig()).resolves.toEqual({
      attempts: DEFAULT_RETRY_ATTEMPTS,
      baseMs: DEFAULT_RETRY_BASE_MS
    });

    h.download = { retryAttempts: Number.POSITIVE_INFINITY, retryBaseMs: Number.NEGATIVE_INFINITY };
    await expect(readRetryConfig()).resolves.toEqual({
      attempts: DEFAULT_RETRY_ATTEMPTS,
      baseMs: DEFAULT_RETRY_BASE_MS
    });
  });

  it('returns defaults on store failures', async () => {
    h.getStore.mockRejectedValueOnce(new Error('store'));
    await expect(readRetryConfig()).resolves.toEqual({
      attempts: DEFAULT_RETRY_ATTEMPTS,
      baseMs: DEFAULT_RETRY_BASE_MS
    });
  });
});

describe('readHashFilesEnabled', () => {
  it('reads the boolean flag', async () => {
    h.download = { hashFiles: true };
    await expect(readHashFilesEnabled()).resolves.toBe(true);

    h.download = { hashFiles: false };
    await expect(readHashFilesEnabled()).resolves.toBe(false);

    h.download = {};
    await expect(readHashFilesEnabled()).resolves.toBe(false);
  });

  it('defaults to false on failures', async () => {
    h.getStore.mockRejectedValueOnce(new Error('store'));
    await expect(readHashFilesEnabled()).resolves.toBe(false);
  });
});

describe('readNightSchedule', () => {
  it('returns defaults without settings', async () => {
    await expect(readNightSchedule()).resolves.toEqual({ enabled: false, start: 22, end: 6 });
  });

  it('reads stored schedule values including zero', async () => {
    h.download = {
      nightScheduleEnabled: true,
      nightScheduleStart: 0,
      nightScheduleEnd: 23
    };
    await expect(readNightSchedule()).resolves.toEqual({ enabled: true, start: 0, end: 23 });
  });

  it('falls back to defaults on failures', async () => {
    h.getStore.mockRejectedValueOnce(new Error('store'));
    await expect(readNightSchedule()).resolves.toEqual({ enabled: false, start: 22, end: 6 });
  });
});
