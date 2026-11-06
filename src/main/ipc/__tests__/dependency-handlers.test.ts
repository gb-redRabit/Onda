import { beforeEach, describe, expect, it, vi } from 'vitest';

// Rejestracja kanałów `dep:*`: sprawdzamy mapowanie narzędzi i wybór ścieżki
// instalacji, bez uruchamiania instalatorów.
const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  resolveBinInfo: vi.fn(),
  invalidateBinaries: vi.fn(),
  abortTool: vi.fn(),
  fetchLatestYtdlpVersion: vi.fn(async (): Promise<string | null> => null),
  ffmpegDownloadUrl: vi.fn((): string | null => null),
  installYtdlpManaged: vi.fn(async () => ({ success: true })),
  installFfmpegManaged: vi.fn(async () => ({ success: true })),
  installSystem: vi.fn(async () => ({ success: true })),
  uninstallTool: vi.fn(async () => ({ success: true }))
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => {
      mocks.handlers.set(channel, handler);
    }
  }
}));
vi.mock('../../binaries', () => ({
  resolveBinInfo: mocks.resolveBinInfo,
  invalidateBinaries: mocks.invalidateBinaries
}));
vi.mock('../dependency/dependency-download', () => ({
  abortTool: mocks.abortTool,
  fetchLatestYtdlpVersion: mocks.fetchLatestYtdlpVersion
}));
vi.mock('../dependency/dependency-utils', () => ({
  ffmpegDownloadUrl: mocks.ffmpegDownloadUrl
}));
vi.mock('../dependency/dependency-install', () => ({
  installYtdlpManaged: mocks.installYtdlpManaged,
  installFfmpegManaged: mocks.installFfmpegManaged,
  installSystem: mocks.installSystem,
  uninstallTool: mocks.uninstallTool
}));

const { registerDependencyHandlers } = await import('../dependency/dependency-handlers');
registerDependencyHandlers();

function handler(channel: string): (...args: any[]) => any {
  const found = mocks.handlers.get(channel);
  if (!found) throw new Error(`${channel} was not registered`);
  return found;
}

const info = (overrides: Record<string, unknown> = {}) => ({
  path: '/usr/bin/tool',
  managed: true,
  version: '1.2.3',
  source: 'managed',
  broken: false,
  error: null,
  ...overrides
});

beforeEach(() => {
  mocks.resolveBinInfo.mockReset();
  mocks.resolveBinInfo.mockResolvedValue(null);
  mocks.invalidateBinaries.mockClear();
  mocks.abortTool.mockClear();
  mocks.fetchLatestYtdlpVersion.mockReset();
  mocks.fetchLatestYtdlpVersion.mockResolvedValue(null);
  mocks.ffmpegDownloadUrl.mockReset();
  mocks.ffmpegDownloadUrl.mockReturnValue(null);
  mocks.installYtdlpManaged.mockClear();
  mocks.installFfmpegManaged.mockClear();
  mocks.installSystem.mockClear();
  mocks.uninstallTool.mockClear();
});

describe('registration', () => {
  it('registers all dependency channels', () => {
    expect([...mocks.handlers.keys()]).toEqual(
      expect.arrayContaining([
        'dep:checkFfmpeg',
        'dep:checkFfprobe',
        'dep:checkMkvextract',
        'dep:checkYtdlp',
        'dep:recheck',
        'dep:getPaths',
        'dep:checkUpdateYtdlp',
        'dep:cancelInstall',
        'dep:installFfmpeg',
        'dep:installMkvextract',
        'dep:installYtdlp',
        'dep:updateYtdlp',
        'dep:removeYtdlp',
        'dep:removeFfmpeg',
        'dep:removeFfprobe',
        'dep:removeMkvextract'
      ])
    );
  });
});

describe('dep:check*', () => {
  it('reports a missing tool', async () => {
    expect(await handler('dep:checkFfmpeg')({})).toEqual({
      installed: false,
      version: null,
      path: null,
      managed: false,
      source: null,
      broken: false,
      error: null
    });
  });

  it('reports resolved tool details', async () => {
    mocks.resolveBinInfo.mockResolvedValue(info());
    expect(await handler('dep:checkYtdlp')({})).toEqual({
      installed: true,
      version: '1.2.3',
      path: '/usr/bin/tool',
      managed: true,
      source: 'managed',
      broken: false,
      error: null
    });
    expect(mocks.resolveBinInfo).toHaveBeenCalledWith('yt-dlp');
  });

  it('maps each channel to its tool', async () => {
    mocks.resolveBinInfo.mockResolvedValue(info());
    await handler('dep:checkFfmpeg')({});
    await handler('dep:checkFfprobe')({});
    await handler('dep:checkMkvextract')({});
    expect(mocks.resolveBinInfo.mock.calls.map((c) => c[0])).toEqual([
      'ffmpeg',
      'ffprobe',
      'mkvextract'
    ]);
  });
});

describe('dep:recheck and dep:getPaths', () => {
  it('invalidates the probe cache and returns true', () => {
    expect(handler('dep:recheck')({})).toBe(true);
    expect(mocks.invalidateBinaries).toHaveBeenCalledTimes(1);
  });

  it('invalidates before reporting all four tools', async () => {
    mocks.resolveBinInfo.mockImplementation(async (tool: string) =>
      tool === 'ffprobe' ? null : info({ path: `/bin/${tool}` })
    );

    const result = await handler('dep:getPaths')({});

    expect(mocks.invalidateBinaries).toHaveBeenCalled();
    expect(result).toHaveLength(4);
    expect(result.map((r: { tool: string }) => r.tool)).toEqual([
      'ffmpeg',
      'ffprobe',
      'yt-dlp',
      'mkvextract'
    ]);
    expect(result[0]).toMatchObject({ path: '/bin/ffmpeg', managed: true, version: '1.2.3' });
    expect(result[1]).toEqual({
      tool: 'ffprobe',
      path: null,
      managed: false,
      version: null,
      source: null,
      broken: false,
      error: null
    });
  });
});

describe('dep:checkUpdateYtdlp', () => {
  it('reports an update when the latest tag differs', async () => {
    mocks.fetchLatestYtdlpVersion.mockResolvedValue('2026.08.19');
    mocks.resolveBinInfo.mockResolvedValue(info({ version: '2026.08.18' }));

    expect(await handler('dep:checkUpdateYtdlp')({})).toEqual({
      updateAvailable: true,
      current: '2026.08.18',
      latest: '2026.08.19'
    });
  });

  it('does not report an update when versions match or are missing', async () => {
    mocks.fetchLatestYtdlpVersion.mockResolvedValue('2026.08.19');
    mocks.resolveBinInfo.mockResolvedValue(info({ version: '2026.08.19' }));
    expect(await handler('dep:checkUpdateYtdlp')({})).toMatchObject({ updateAvailable: false });

    mocks.fetchLatestYtdlpVersion.mockResolvedValue(null);
    expect(await handler('dep:checkUpdateYtdlp')({})).toMatchObject({ updateAvailable: false });
  });
});

describe('install and remove channels', () => {
  it('aborts the requested tool', () => {
    expect(handler('dep:cancelInstall')({}, 'ffmpeg')).toBe(true);
    expect(mocks.abortTool).toHaveBeenCalledWith('ffmpeg');
  });

  it('prefers the pinned managed FFmpeg when available', async () => {
    mocks.ffmpegDownloadUrl.mockReturnValue('https://example.com/ffmpeg.zip');
    const sender = {};
    await handler('dep:installFfmpeg')({ sender });

    expect(mocks.installFfmpegManaged).toHaveBeenCalledWith(sender);
    expect(mocks.installSystem).not.toHaveBeenCalled();
  });

  it('falls back to the system package manager without a pinned build', async () => {
    const sender = {};
    await handler('dep:installFfmpeg')({ sender });

    expect(mocks.installSystem).toHaveBeenCalledWith(sender, 'ffmpeg');
    expect(mocks.installFfmpegManaged).not.toHaveBeenCalled();
  });

  it('routes yt-dlp install and update with the right flag', async () => {
    const sender = {};
    await handler('dep:installYtdlp')({ sender });
    await handler('dep:updateYtdlp')({ sender });
    expect(mocks.installYtdlpManaged.mock.calls).toEqual([
      [sender, false],
      [sender, true]
    ]);
  });

  it('routes mkvextract through the system installer', async () => {
    const sender = {};
    await handler('dep:installMkvextract')({ sender });
    expect(mocks.installSystem).toHaveBeenCalledWith(sender, 'mkvextract');
  });

  it('routes every remove channel to the matching tool', async () => {
    const sender = {};
    await handler('dep:removeYtdlp')({ sender });
    await handler('dep:removeFfmpeg')({ sender });
    await handler('dep:removeFfprobe')({ sender });
    await handler('dep:removeMkvextract')({ sender });

    expect(mocks.uninstallTool.mock.calls).toEqual([
      [sender, 'yt-dlp'],
      [sender, 'ffmpeg'],
      [sender, 'ffprobe'],
      [sender, 'mkvextract']
    ]);
  });
});
