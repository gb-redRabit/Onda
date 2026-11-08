import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  getPath: vi.fn(),
  windowCtor: vi.fn(),
  loadURL: vi.fn(),
  isDestroyed: vi.fn(() => false),
  destroy: vi.fn(),
  fromPartition: vi.fn(),
  cookiesGet: vi.fn(),
  cookiesSet: vi.fn(),
  flushStore: vi.fn(),
  readFile: vi.fn(),
  unlink: vi.fn(),
  writeRestricted: vi.fn(),
  serializeCookies: vi.fn(),
  parseCookies: vi.fn(),
  randomUUID: vi.fn(),
  loggerWarn: vi.fn(),
  loggerInfo: vi.fn(),
  cookieOnDomain: vi.fn(),
  hasSessionCookies: vi.fn()
}));

vi.mock('electron', () => ({
  app: { getPath: state.getPath },
  BrowserWindow: class {
    constructor(options: unknown) {
      state.windowCtor(options);
    }
    loadURL = state.loadURL;
    isDestroyed = state.isDestroyed;
    destroy = state.destroy;
  },
  session: { fromPartition: state.fromPartition }
}));
vi.mock('path', () => ({ join: (...parts: string[]) => parts.join('/') }));
vi.mock('crypto', () => ({ randomUUID: state.randomUUID }));
vi.mock('fs/promises', () => ({ readFile: state.readFile, unlink: state.unlink }));
vi.mock('../../utils/file-permissions', () => ({
  writeFileRestricted: state.writeRestricted
}));
vi.mock('../../ipc/youtube/youtube-utils', () => ({
  serializeCookies: state.serializeCookies,
  parseNetscapeCookies: state.parseCookies
}));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: state.loggerInfo, error: vi.fn() }
}));
vi.mock('../youtube-auth-cookies', () => ({
  SESSION_COOKIE_NAMES: ['SID', 'HSID', 'SSID'],
  YT_COOKIE_HOST: '.youtube.com',
  cookieOnDomain: state.cookieOnDomain,
  hasSessionCookies: state.hasSessionCookies
}));

function cookie(name: string, overrides: Record<string, unknown> = {}) {
  return {
    name,
    value: `v-${name}`,
    domain: '.youtube.com',
    path: '/',
    ...overrides
  } as any;
}

function cookieLine(domain: string, expiry: number, name: string) {
  return [domain, 'TRUE', '/', 'FALSE', String(expiry), name, 'value'].join('\t');
}

async function load() {
  vi.resetModules();
  return import('../youtube-auth-session');
}

beforeEach(() => {
  state.getPath.mockImplementation((name: string) => (name === 'temp' ? 'C:/temp' : 'C:/userData'));
  state.windowCtor.mockReset();
  state.loadURL.mockReset();
  state.loadURL.mockResolvedValue(undefined);
  state.isDestroyed.mockReset();
  state.isDestroyed.mockReturnValue(false);
  state.destroy.mockReset();
  state.cookiesGet.mockReset();
  state.cookiesGet.mockResolvedValue([]);
  state.cookiesSet.mockReset();
  state.cookiesSet.mockResolvedValue(undefined);
  state.flushStore.mockReset();
  state.fromPartition.mockReset();
  state.fromPartition.mockReturnValue({
    cookies: { get: state.cookiesGet, set: state.cookiesSet, flushStore: state.flushStore }
  });
  state.readFile.mockReset();
  state.readFile.mockRejectedValue(new Error('ENOENT'));
  state.unlink.mockReset();
  state.unlink.mockResolvedValue(undefined);
  state.writeRestricted.mockReset();
  state.writeRestricted.mockResolvedValue(undefined);
  state.serializeCookies.mockReset();
  state.serializeCookies.mockReturnValue('cookie-file');
  state.parseCookies.mockReset();
  state.parseCookies.mockReturnValue([]);
  state.randomUUID.mockReset();
  state.randomUUID.mockReturnValue('uuid-1');
  state.loggerWarn.mockReset();
  state.loggerInfo.mockReset();
  state.cookieOnDomain.mockReset();
  state.cookieOnDomain.mockImplementation((domain: string) => domain === '.youtube.com');
  state.hasSessionCookies.mockReset();
  state.hasSessionCookies.mockReturnValue([]);
});

describe('paths and constants', () => {
  it('stores cookies under the user data directory', async () => {
    const { AUTH_PARTITION, cookiesFilePath } = await load();
    expect(AUTH_PARTITION).toBe('persist:youtube-auth');
    expect(cookiesFilePath()).toBe('C:/userData/youtube-cookies.txt');
  });
});

describe('session cookies', () => {
  it('merges unfiltered and YouTube cookies without duplicates', async () => {
    state.cookiesGet
      .mockResolvedValueOnce([cookie('SID'), cookie('HSID')])
      .mockResolvedValueOnce([cookie('SID'), cookie('SSID', { path: '/x' })]);
    const { getSessionCookies } = await load();
    const cookies = await getSessionCookies();
    expect(cookies.map((c) => `${c.name}${c.path}`)).toEqual(['SID/', 'HSID/', 'SSID/x']);
    expect(state.fromPartition).toHaveBeenCalledWith('persist:youtube-auth');
  });

  it('warms the auth session once when the cookie file holds a session', async () => {
    state.readFile.mockResolvedValue(cookieLine('.youtube.com', 0, 'SID'));
    const { getSessionCookies } = await load();

    await getSessionCookies();
    await getSessionCookies();
    expect(state.windowCtor).toHaveBeenCalledTimes(1);
    expect(state.windowCtor).toHaveBeenCalledWith({
      show: false,
      webPreferences: { partition: 'persist:youtube-auth', sandbox: true }
    });
    expect(state.loadURL).toHaveBeenCalledWith('about:blank');
    expect(state.destroy).toHaveBeenCalledTimes(1);
  });

  it('logs warm-up failures and always destroys the window', async () => {
    state.readFile.mockResolvedValue(cookieLine('.youtube.com', 0, 'SID'));
    state.loadURL.mockRejectedValueOnce(new Error('load'));
    state.isDestroyed.mockReturnValueOnce(true);
    const { getSessionCookies } = await load();
    await getSessionCookies();

    expect(state.loggerWarn).toHaveBeenCalledWith(
      'ytauth',
      'session warm-up failed',
      expect.any(Error)
    );
    expect(state.destroy).not.toHaveBeenCalled();
  });

  it('skips the warm-up without a saved session', async () => {
    const { getSessionCookies } = await load();
    await getSessionCookies();
    expect(state.windowCtor).not.toHaveBeenCalled();
  });
});

describe('restorePartitionSession', () => {
  it('reports true when the partition already has a session', async () => {
    state.hasSessionCookies.mockReturnValue([cookie('SID')]);
    const { restorePartitionSession } = await load();
    expect(await restorePartitionSession()).toBe(true);
  });

  it('returns false without a live session or saved file', async () => {
    const { restorePartitionSession } = await load();
    expect(await restorePartitionSession()).toBe(false);
  });

  it('re-seeds the partition from the cookie file', async () => {
    state.readFile.mockResolvedValue(cookieLine('.youtube.com', 0, 'SID'));
    state.parseCookies.mockReturnValue([
      {
        url: 'https://www.youtube.com',
        name: 'SID',
        value: 'v',
        path: '/',
        secure: true,
        domain: '.youtube.com',
        expirationDate: 123
      },
      {
        url: 'https://www.youtube.com',
        name: 'HSID',
        value: 'h',
        path: '/',
        secure: true
      }
    ]);
    state.cookiesSet.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('rejected'));
    state.hasSessionCookies.mockReturnValueOnce([]).mockReturnValueOnce([cookie('SID')]);

    const { restorePartitionSession } = await load();
    expect(await restorePartitionSession()).toBe(true);
    expect(state.cookiesSet).toHaveBeenNthCalledWith(1, {
      url: 'https://www.youtube.com',
      name: 'SID',
      value: 'v',
      path: '/',
      secure: true,
      domain: '.youtube.com',
      expirationDate: 123
    });
    expect(state.cookiesSet).toHaveBeenNthCalledWith(2, {
      url: 'https://www.youtube.com',
      name: 'HSID',
      value: 'h',
      path: '/',
      secure: true
    });
    expect(state.flushStore).toHaveBeenCalled();
  });

  it('tolerates a missing flushStore', async () => {
    state.readFile.mockResolvedValue(cookieLine('.youtube.com', 0, 'SID'));
    state.parseCookies.mockReturnValue([
      { url: 'u', name: 'SID', value: 'v', path: '/', secure: true }
    ]);
    state.flushStore.mockImplementation(() => {
      throw new Error('unsupported');
    });
    state.hasSessionCookies.mockReturnValueOnce([]).mockReturnValueOnce([cookie('SID')]);

    const { restorePartitionSession } = await load();
    expect(await restorePartitionSession()).toBe(true);
  });

  it('logs failures and resolves false', async () => {
    state.readFile.mockResolvedValue(cookieLine('.youtube.com', 0, 'SID'));
    state.parseCookies.mockImplementationOnce(() => {
      throw new Error('parse');
    });
    const { restorePartitionSession } = await load();
    expect(await restorePartitionSession()).toBe(false);
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'ytauth',
      'restorePartitionSession failed',
      expect.any(Error)
    );
  });
});

describe('exporting sessions', () => {
  it('writes serialized cookies with platform line endings', async () => {
    state.hasSessionCookies.mockReturnValue([cookie('SID')]);
    state.serializeCookies.mockReturnValue('payload');
    const { exportSessionCookies } = await load();

    expect(await exportSessionCookies()).toBe(true);
    expect(state.serializeCookies).toHaveBeenCalledWith(
      expect.any(Array),
      process.platform === 'win32' ? '\r\n' : '\n'
    );
    expect(state.writeRestricted).toHaveBeenCalledWith(
      'C:/userData/youtube-cookies.txt',
      'payload'
    );
    expect(state.loggerInfo).toHaveBeenCalledWith('ytauth', 'cookies exported');
  });

  it('skips export without a live session', async () => {
    const { exportSessionCookies } = await load();
    expect(await exportSessionCookies()).toBe(false);
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'ytauth',
      'export skipped — no .youtube.com session cookies'
    );
    expect(state.writeRestricted).not.toHaveBeenCalled();
  });

  it('reports write failures', async () => {
    state.hasSessionCookies.mockReturnValue([cookie('SID')]);
    state.writeRestricted.mockRejectedValueOnce(new Error('disk'));
    const { exportSessionCookies } = await load();
    expect(await exportSessionCookies()).toBe(false);
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'ytauth',
      'exportSessionCookies failed',
      expect.any(Error)
    );
  });
});

describe('temporary session files', () => {
  it('writes a unique temp cookie file', async () => {
    state.hasSessionCookies.mockReturnValue([cookie('SID')]);
    state.serializeCookies.mockReturnValue('payload');
    const { writeTempSessionCookies } = await load();

    expect(await writeTempSessionCookies()).toBe('C:/temp/onda-yt-cookies-uuid-1.txt');
    expect(state.writeRestricted).toHaveBeenCalledWith(
      'C:/temp/onda-yt-cookies-uuid-1.txt',
      'payload'
    );
  });

  it('returns null without a session or on write failures', async () => {
    let module = await load();
    expect(await module.writeTempSessionCookies()).toBeNull();

    state.hasSessionCookies.mockReturnValue([cookie('SID')]);
    state.writeRestricted.mockRejectedValueOnce(new Error('disk'));
    module = await load();
    expect(await module.writeTempSessionCookies()).toBeNull();
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'ytauth',
      'writeTempSessionCookies failed',
      expect.any(Error)
    );
  });

  it('cleans up only temporary auth files', async () => {
    const { cleanupYtAuthTemp } = await load();
    await cleanupYtAuthTemp(null);
    await cleanupYtAuthTemp({ temp: false, cookiesPath: 'C:/cookies.txt' } as never);
    await cleanupYtAuthTemp({ temp: true } as never);
    expect(state.unlink).not.toHaveBeenCalled();

    await cleanupYtAuthTemp({ temp: true, cookiesPath: 'C:/tmp.txt' } as never);
    expect(state.unlink).toHaveBeenCalledWith('C:/tmp.txt');

    state.unlink.mockRejectedValueOnce(new Error('gone'));
    await expect(
      cleanupYtAuthTemp({ temp: true, cookiesPath: 'C:/tmp2.txt' } as never)
    ).resolves.toBeUndefined();
  });
});

describe('cookie file session validation', () => {
  it('accepts valid SID-family cookies with future or session expiry', async () => {
    const now = Math.floor(Date.now() / 1000);
    state.readFile.mockResolvedValue(['short', cookieLine('.youtube.com', 0, 'SID')].join('\n'));
    const { cookieFileHasValidYouTubeSession } = await load();
    expect(await cookieFileHasValidYouTubeSession()).toBe(true);

    state.readFile.mockResolvedValue(cookieLine('.youtube.com', now + 100, 'HSID'));
    expect(await cookieFileHasValidYouTubeSession()).toBe(true);
  });

  it('rejects expired, foreign or unknown cookies', async () => {
    const now = Math.floor(Date.now() / 1000);
    state.readFile.mockResolvedValue(
      [
        cookieLine('.youtube.com', now - 10, 'SID'),
        cookieLine('.example.com', 0, 'SID'),
        cookieLine('.youtube.com', 0, 'OTHER')
      ].join('\n')
    );
    const { cookieFileHasValidYouTubeSession } = await load();
    expect(await cookieFileHasValidYouTubeSession()).toBe(false);
  });

  it('returns false when the file cannot be read', async () => {
    const { cookieFileHasValidYouTubeSession } = await load();
    expect(await cookieFileHasValidYouTubeSession()).toBe(false);
  });
});
