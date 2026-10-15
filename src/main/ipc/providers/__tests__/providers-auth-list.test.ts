import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regresja dla `providers:auth:list`: scala providerów WYMAGAJĄCYCH cookie
// (auth !== 'none') z OPCJONALNYMI (logowanie dostępne, np. Google Drive)
// i dokłada flagę `required`. Electron + zależności zamockowane.

const h = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (event: unknown, ...args: unknown[]) => unknown) => {
      h.handlers.set(ch, fn);
    }
  },
  app: { getPath: () => 'C:\\tmp\\onda' }
}));

vi.mock('../registry', () => ({
  detectProvider: vi.fn(() => null),
  getProvider: vi.fn((id: string) =>
    id === 'gdrive' ? { id: 'gdrive', label: 'Google Drive', icon: 'gdrive' } : undefined
  ),
  listProviderFolder: vi.fn(async () => []),
  listProvidersRequiringAuth: vi.fn(() => [
    { id: '115', label: '115', icon: '115' },
    { id: 'quark', label: 'Quark', icon: 'quark' }
  ]),
  resolveProviderFileUrl: vi.fn(async () => ({ url: 'http://x' }))
}));

vi.mock('../provider-login', () => ({
  startProviderLogin: vi.fn(async () => ({ success: true })),
  listLoginProviderIds: vi.fn(() => ['115', 'quark', 'gdrive'])
}));

vi.mock('../provider-credentials', () => ({
  hasProviderCookie: vi.fn(async (id: string) => id === 'gdrive'),
  getProviderCookie: vi.fn(async () => ''),
  setProviderCookie: vi.fn(async () => true),
  clearProviderCookie: vi.fn(async () => true)
}));

vi.mock('../../../downloads/download-manager', () => ({
  setProviderItemDownloadedHandler: vi.fn()
}));
vi.mock('../../cover/cover-cache', () => ({
  getStore: vi.fn(async () => ({ get: () => undefined }))
}));
vi.mock('../remote-subs-checker', () => ({
  checkRemoteSubscriptions: vi.fn(async () => {}),
  startLinkSubsChecker: vi.fn(),
  stopLinkSubsChecker: vi.fn()
}));

import { openHttpStream, registerProvidersHandlers } from '../providers-handlers';

registerProvidersHandlers();

const call = (channel: string, ...args: unknown[]): unknown => {
  const fn = h.handlers.get(channel);
  if (!fn) throw new Error(`handler not registered: ${channel}`);
  return fn({}, ...args);
};

beforeEach(() => vi.clearAllMocks());

describe('openHttpStream security', () => {
  it('rejects loopback and private network URLs before fetching (SSRF protection)', async () => {
    await expect(openHttpStream('http://127.0.0.1:8080/secret.mp4', {})).rejects.toThrow(
      /Private network|Loopback|not allowed/i
    );
    await expect(
      openHttpStream('http://169.254.169.254/latest/meta-data/a.mp4', {})
    ).rejects.toThrow(/Private network|not allowed/i);
  });
});

describe('providers:auth:list', () => {
  it('merges required providers with optional login providers and flags `required`', async () => {
    const rows = (await call('providers:auth:list')) as Array<{
      id: string;
      required: boolean;
      hasCookie: boolean;
    }>;

    expect(rows).toHaveLength(3);

    const required = rows.find((r) => r.id === '115');
    expect(required).toMatchObject({ required: true, hasCookie: false });

    const optional = rows.find((r) => r.id === 'gdrive');
    expect(optional).toMatchObject({ required: false, hasCookie: true });

    // Gdy provider jest jednocześnie wymagany i wspiera logowanie — nie duplikujemy go.
    expect(rows.filter((r) => r.id === 'quark')).toHaveLength(1);
    expect(rows.find((r) => r.id === 'quark')?.required).toBe(true);
  });
});
