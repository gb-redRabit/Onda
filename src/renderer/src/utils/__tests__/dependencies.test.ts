import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DepToolStatus } from '@shared/types/ipc';
import {
  EMPTY_DEP_STATUS,
  isStatus,
  recheckDependencies,
  safeCheck,
  toolApi,
  type DepRow
} from '../dependencies';

function row(tool: DepRow['tool']): DepRow {
  return {
    name: tool,
    tool,
    descriptionKey: 'key',
    description: 'desc',
    installed: true,
    version: '1',
    path: '/bin',
    managed: true,
    source: 'managed',
    broken: false,
    probeError: null,
    updateAvailable: false,
    installing: false,
    percent: 0,
    error: null
  };
}

const api = {
  installMkvextract: vi.fn(),
  checkMkvextract: vi.fn(),
  removeMkvextract: vi.fn(),
  installYtdlp: vi.fn(),
  checkYtdlp: vi.fn(),
  removeYtdlp: vi.fn(),
  installFfmpeg: vi.fn(),
  checkFfprobe: vi.fn(),
  removeFfprobe: vi.fn(),
  checkFfmpeg: vi.fn(),
  removeFfmpeg: vi.fn(),
  invoke: vi.fn()
};

beforeEach(() => {
  Object.defineProperty(window, 'api', { value: api, configurable: true });
  for (const fn of Object.values(api)) fn.mockReset();
  api.invoke.mockResolvedValue(undefined);
});

afterEach(() => {
  delete (window as { api?: unknown }).api;
});

describe('toolApi', () => {
  it('maps every tool to its bridge functions', () => {
    expect(toolApi(row('mkvextract'))).toEqual({
      install: api.installMkvextract,
      check: api.checkMkvextract,
      remove: api.removeMkvextract
    });
    expect(toolApi(row('yt-dlp'))).toEqual({
      install: api.installYtdlp,
      check: api.checkYtdlp,
      remove: api.removeYtdlp
    });
    expect(toolApi(row('ffprobe'))).toEqual({
      install: api.installFfmpeg,
      check: api.checkFfprobe,
      remove: api.removeFfprobe
    });
    expect(toolApi(row('ffmpeg'))).toEqual({
      install: api.installFfmpeg,
      check: api.checkFfmpeg,
      remove: api.removeFfmpeg
    });
  });
});

describe('safeCheck', () => {
  it('returns the fallback without a probe', async () => {
    await expect(safeCheck(undefined, EMPTY_DEP_STATUS)).resolves.toBe(EMPTY_DEP_STATUS);
  });

  it('returns the probe value and falls back on rejection', async () => {
    const status = { installed: true } as DepToolStatus;
    await expect(safeCheck(async () => status, EMPTY_DEP_STATUS)).resolves.toBe(status);
    await expect(
      safeCheck(async () => {
        throw new Error('probe failed');
      }, EMPTY_DEP_STATUS)
    ).resolves.toBe(EMPTY_DEP_STATUS);
  });
});

describe('recheckDependencies', () => {
  it('asks main to clear the resolver cache and ignores bridge failures', async () => {
    await recheckDependencies();
    expect(api.invoke).toHaveBeenCalledWith('dep:recheck');

    api.invoke.mockRejectedValueOnce(new Error('old build'));
    await expect(recheckDependencies()).resolves.toBeUndefined();
  });
});

describe('isStatus', () => {
  it('accepts objects carrying the installed flag', () => {
    expect(isStatus({ installed: true })).toBe(true);
    expect(isStatus({ installed: false, version: '1' })).toBe(true);
    expect(isStatus(null)).toBe(false);
    expect(isStatus('installed')).toBe(false);
    expect(isStatus({})).toBe(false);
  });
});
