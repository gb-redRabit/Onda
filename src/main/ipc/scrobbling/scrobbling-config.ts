import { getStore } from '../cover/cover-cache';
import { sanitizeSettings } from '../settings/settings-schema';
import { decryptSecret } from '../settings/settings-crypto';
import type { ScrobblingStatus } from '../../../shared/types/ipc/channels-scrobbling';

export const SCROBBLE_KEY_IDS = {
  lastfmApiKey: 'scrobble:lastfm-api-key',
  lastfmApiSecret: 'scrobble:lastfm-api-secret',
  lastfmSession: 'scrobble:lastfm-session',
  listenbrainzToken: 'scrobble:listenbrainz-token'
} as const;

interface StoredKey {
  id: string;
  service: string;
  key: string;
  isActive?: boolean;
  values?: Record<string, string | number | boolean>;
}

export interface ScrobblingConfig {
  lastfm: {
    apiKey: string;
    apiSecret: string;
    sessionKey: string;
    enabled: boolean;
    username?: string;
  };
  listenbrainz: {
    token: string;
    enabled: boolean;
    username?: string;
  };
}

async function readKeys(): Promise<Map<string, StoredKey>> {
  const store = await getStore();
  const { sanitized } = sanitizeSettings(store.store || {});
  const entries = (sanitized.apiKeys?.keys || []) as StoredKey[];
  const map = new Map<string, StoredKey>();
  for (const entry of entries) {
    map.set(entry.id, { ...entry, key: entry.key ? decryptSecret(entry.key) : '' });
  }
  return map;
}

function usernameOf(entry: StoredKey | undefined): string | undefined {
  const value = entry?.values?.username;
  return typeof value === 'string' && value ? value : undefined;
}

export async function readScrobblingConfig(): Promise<ScrobblingConfig> {
  const keys = await readKeys();
  const lastfmKey = keys.get(SCROBBLE_KEY_IDS.lastfmApiKey);
  const lastfmSecret = keys.get(SCROBBLE_KEY_IDS.lastfmApiSecret);
  const lastfmSession = keys.get(SCROBBLE_KEY_IDS.lastfmSession);
  const listenbrainz = keys.get(SCROBBLE_KEY_IDS.listenbrainzToken);
  return {
    lastfm: {
      apiKey: lastfmKey?.key || '',
      apiSecret: lastfmSecret?.key || '',
      sessionKey: lastfmSession?.key || '',
      enabled: lastfmSession?.isActive === true,
      username: usernameOf(lastfmSession)
    },
    listenbrainz: {
      token: listenbrainz?.key || '',
      enabled: listenbrainz?.isActive === true,
      username: usernameOf(listenbrainz)
    }
  };
}

export async function readScrobblingStatus(): Promise<ScrobblingStatus> {
  const config = await readScrobblingConfig();
  return {
    lastfm: {
      apiKey: !!config.lastfm.apiKey,
      apiSecret: !!config.lastfm.apiSecret,
      session: !!config.lastfm.sessionKey,
      enabled: config.lastfm.enabled,
      ...(config.lastfm.username ? { username: config.lastfm.username } : {})
    },
    listenbrainz: {
      token: !!config.listenbrainz.token,
      enabled: config.listenbrainz.enabled,
      ...(config.listenbrainz.username ? { username: config.listenbrainz.username } : {})
    }
  };
}
