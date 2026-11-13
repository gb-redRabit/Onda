import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getPath: vi.fn(() => 'D:/userData'),
  resolveBinary: vi.fn()
}));

vi.mock('electron', () => ({ app: { getPath: h.getPath } }));
vi.mock('../ipc/dependency/dependency-utils', () => ({ resolveBinary: h.resolveBinary }));

type BinariesApi = typeof import('../binaries');

let binaries: BinariesApi;

beforeEach(async () => {
  h.getPath.mockClear();
  h.resolveBinary.mockReset();
  vi.resetModules();
  binaries = await import('../binaries');
});

describe('getBinDir', () => {
  it('resolves and caches the managed bin directory', () => {
    const first = binaries.getBinDir();
    const second = binaries.getBinDir();

    expect(first).toBe(second);
    expect(first.replace(/\\/g, '/')).toMatch(/userData\/bin$/);
    expect(h.getPath).toHaveBeenCalledTimes(1);
  });
});

describe('resolveBin', () => {
  it('returns a working path and caches it', async () => {
    h.resolveBinary.mockResolvedValue({ path: '/bin/yt-dlp', broken: false, managed: true });

    await expect(binaries.resolveBin('yt-dlp')).resolves.toBe('/bin/yt-dlp');
    await expect(binaries.resolveBin('yt-dlp')).resolves.toBe('/bin/yt-dlp');

    expect(h.resolveBinary).toHaveBeenCalledTimes(1);
  });

  it('returns null for a broken binary and caches the miss', async () => {
    h.resolveBinary.mockResolvedValue({ path: '/bin/yt-dlp', broken: true, managed: true });

    await expect(binaries.resolveBin('yt-dlp')).resolves.toBeNull();
    await expect(binaries.resolveBin('yt-dlp')).resolves.toBeNull();

    expect(h.resolveBinary).toHaveBeenCalledTimes(1);
  });

  it('returns null when nothing resolves', async () => {
    h.resolveBinary.mockResolvedValue(null);

    await expect(binaries.resolveBin('ffmpeg')).resolves.toBeNull();
  });
});

describe('resolveBinInfo', () => {
  it('returns full info and caches it', async () => {
    const info = { path: '/bin/ffmpeg', broken: false, managed: false };
    h.resolveBinary.mockResolvedValue(info);

    await expect(binaries.resolveBinInfo('ffmpeg')).resolves.toEqual(info);
    await expect(binaries.resolveBinInfo('ffmpeg')).resolves.toEqual(info);

    expect(h.resolveBinary).toHaveBeenCalledTimes(1);
  });

  it('caches a null result', async () => {
    h.resolveBinary.mockResolvedValue(null);

    await expect(binaries.resolveBinInfo('ffmpeg')).resolves.toBeNull();
    await expect(binaries.resolveBinInfo('ffmpeg')).resolves.toBeNull();

    expect(h.resolveBinary).toHaveBeenCalledTimes(1);
  });
});

describe('invalidateBinaries', () => {
  it('clears every cached result', async () => {
    h.resolveBinary.mockResolvedValue({ path: '/bin/yt-dlp', broken: false, managed: true });
    await binaries.resolveBin('yt-dlp');

    binaries.invalidateBinaries();
    await binaries.resolveBin('yt-dlp');

    expect(h.resolveBinary).toHaveBeenCalledTimes(2);
  });
});
