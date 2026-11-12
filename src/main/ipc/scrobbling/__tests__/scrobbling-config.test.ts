import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getStore: vi.fn(),
  sanitize: vi.fn(),
  decrypt: vi.fn((value: string) => `dec:${value}`)
}));

vi.mock('../../cover/cover-cache', () => ({ getStore: mocks.getStore }));
vi.mock('../../settings/settings-schema', () => ({ sanitizeSettings: mocks.sanitize }));
vi.mock('../../settings/settings-crypto', () => ({ decryptSecret: mocks.decrypt }));

import { SCROBBLE_KEY_IDS, readScrobblingConfig, readScrobblingStatus } from '../scrobbling-config';

function key(overrides: Record<string, unknown>) {
  return { id: '', service: 'lastfm', key: 'encrypted', ...overrides };
}

function storeWith(keys: unknown[]) {
  mocks.getStore.mockResolvedValue({ store: { any: 'value' } });
  mocks.sanitize.mockReturnValue({ sanitized: { apiKeys: { keys } } });
}

beforeEach(() => {
  mocks.getStore.mockReset();
  mocks.sanitize.mockReset();
  mocks.decrypt.mockClear();
});

describe('readScrobblingConfig', () => {
  it('decrypts keys and maps last.fm + listenbrainz state', async () => {
    storeWith([
      key({ id: SCROBBLE_KEY_IDS.lastfmApiKey }),
      key({ id: SCROBBLE_KEY_IDS.lastfmApiSecret }),
      key({
        id: SCROBBLE_KEY_IDS.lastfmSession,
        isActive: true,
        values: { username: 'alice' }
      }),
      key({
        id: SCROBBLE_KEY_IDS.listenbrainzToken,
        isActive: true,
        values: { username: 'bob' }
      })
    ]);

    await expect(readScrobblingConfig()).resolves.toEqual({
      lastfm: {
        apiKey: 'dec:encrypted',
        apiSecret: 'dec:encrypted',
        sessionKey: 'dec:encrypted',
        enabled: true,
        username: 'alice'
      },
      listenbrainz: {
        token: 'dec:encrypted',
        enabled: true,
        username: 'bob'
      }
    });
    expect(mocks.decrypt).toHaveBeenCalledTimes(4);
    expect(mocks.getStore).toHaveBeenCalledTimes(1);
  });

  it('returns empty values for missing keys and ignores non-string usernames', async () => {
    storeWith([
      key({ id: SCROBBLE_KEY_IDS.lastfmSession, values: { username: 42 } }),
      key({ id: SCROBBLE_KEY_IDS.listenbrainzToken, isActive: false, key: '' })
    ]);

    await expect(readScrobblingConfig()).resolves.toEqual({
      lastfm: {
        apiKey: '',
        apiSecret: '',
        sessionKey: 'dec:encrypted',
        enabled: false,
        username: undefined
      },
      listenbrainz: {
        token: '',
        enabled: false,
        username: undefined
      }
    });
  });

  it('treats missing key lists and stores as empty', async () => {
    mocks.getStore.mockResolvedValue({});
    mocks.sanitize.mockReturnValue({ sanitized: {} });

    await expect(readScrobblingConfig()).resolves.toEqual({
      lastfm: {
        apiKey: '',
        apiSecret: '',
        sessionKey: '',
        enabled: false,
        username: undefined
      },
      listenbrainz: { token: '', enabled: false, username: undefined }
    });
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });
});

describe('readScrobblingStatus', () => {
  it('reports booleans and includes usernames only when present', async () => {
    storeWith([
      key({ id: SCROBBLE_KEY_IDS.lastfmApiKey }),
      key({ id: SCROBBLE_KEY_IDS.lastfmSession, isActive: true, values: { username: 'alice' } }),
      key({
        id: SCROBBLE_KEY_IDS.listenbrainzToken,
        isActive: false,
        values: { username: 'bob' }
      })
    ]);

    await expect(readScrobblingStatus()).resolves.toEqual({
      lastfm: {
        apiKey: true,
        apiSecret: false,
        session: true,
        enabled: true,
        username: 'alice'
      },
      listenbrainz: { token: true, enabled: false, username: 'bob' }
    });
  });

  it('omits usernames when absent', async () => {
    storeWith([]);

    const status = await readScrobblingStatus();

    expect(status.lastfm).toEqual({
      apiKey: false,
      apiSecret: false,
      session: false,
      enabled: false
    });
    expect(status.listenbrainz).toEqual({ token: false, enabled: false });
  });
});
