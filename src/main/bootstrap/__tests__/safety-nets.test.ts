import { describe, expect, it, vi } from 'vitest';
import type { Session } from 'electron';

vi.mock('electron', () => ({
  app: { getAppPath: () => process.cwd() },
  dialog: { showErrorBox: vi.fn() },
  session: {
    defaultSession: {},
    fromPartition: () => ({
      setPermissionCheckHandler: vi.fn(),
      setPermissionRequestHandler: vi.fn()
    })
  }
}));
vi.mock('../../ipc/providers/provider-login', () => ({ providerLoginPartitions: () => [] }));
vi.mock('../../youtube/youtube-auth-session', () => ({ AUTH_PARTITION: 'persist:auth' }));
vi.mock('../../preview/preview-session', () => ({ PREVIEW_PARTITION: 'persist:preview' }));

const { hardenSessionPermissions } = await import('../safety-nets');

function makeSession() {
  let check: ((wc: unknown, permission: string, origin: string) => boolean) | null = null;
  let request:
    | ((
        wc: unknown,
        permission: string,
        callback: (ok: boolean) => void,
        details: { requestingUrl: string }
      ) => void)
    | null = null;
  const session = {
    setPermissionCheckHandler: (handler: typeof check) => {
      check = handler;
    },
    setPermissionRequestHandler: (handler: typeof request) => {
      request = handler;
    }
  } as unknown as Session;
  return { session, check: () => check!, request: () => request! };
}

describe('session permission hardening', () => {
  it('allows only the declared permissions for a trusted origin', () => {
    const { session, check } = makeSession();
    hardenSessionPermissions(session, (origin) => origin === 'file://app');
    expect(check()(null, 'fullscreen', 'file://app')).toBe(true);
    expect(check()(null, 'clipboard-sanitized-write', 'file://app')).toBe(true);
    expect(check()(null, 'geolocation', 'file://app')).toBe(false);
    expect(check()(null, 'media', 'file://app')).toBe(false);
  });

  it('denies declared permissions for an untrusted origin', () => {
    const { session, check } = makeSession();
    hardenSessionPermissions(session, () => false);
    expect(check()(null, 'fullscreen', 'https://remote')).toBe(false);
  });

  it('mirrors the check policy in the request handler', () => {
    const { session, request } = makeSession();
    hardenSessionPermissions(session, (origin) => origin === 'file://app');
    const callback = vi.fn();
    request()(null, 'fullscreen', callback, { requestingUrl: 'file://app' });
    expect(callback).toHaveBeenLastCalledWith(true);
    request()(null, 'geolocation', callback, { requestingUrl: 'file://app' });
    expect(callback).toHaveBeenLastCalledWith(false);
  });
});
