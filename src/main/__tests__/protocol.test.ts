import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MAX_RESIZE_WIDTH, MAX_THUMB_SIZE } from '../../shared/constants';

const { paths, protocolState, state } = vi.hoisted(() => ({
  paths: {} as Record<string, string>,
  protocolState: { handler: null as ((req: Request) => Promise<Response>) | null },
  state: {
    roots: false,
    origin: null as string | null,
    sensitive: false,
    temp: false,
    getThumbnail: vi.fn(),
    resize: vi.fn(),
    warn: vi.fn()
  }
}));

vi.mock('electron', () => ({
  app: { getPath: (name: string) => paths[name] ?? paths['temp'] },
  protocol: {
    registerSchemesAsPrivileged: vi.fn(),
    handle: (_scheme: string, handler: (req: Request) => Promise<Response>) => {
      protocolState.handler = handler;
    }
  }
}));
vi.mock('../media/media-server', () => ({ isPathWithinAllowedRoots: () => state.roots }));
vi.mock('../utils/origin-guard', () => ({ allowedAppOrigin: () => state.origin }));
vi.mock('../path-policy', () => ({
  isSensitivePath: () => state.sensitive,
  isSystemTempPath: () => state.temp
}));
vi.mock('../../shared/logger', () => ({
  logger: { warn: state.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));
vi.mock('../utils/sharp', () => ({
  SharpService: { getThumbnail: state.getThumbnail, resize: state.resize }
}));

const dir = mkdtempSync(join(tmpdir(), 'onda-protocol-'));
const allowed = join(dir, 'allowed');
const outside = join(dir, 'outside');
const { mkdirSync } = await import('node:fs');
mkdirSync(allowed, { recursive: true });
mkdirSync(outside, { recursive: true });
const allowedFile = join(allowed, 'photo.jpg');
const outsideFile = join(outside, 'secret.jpg');
writeFileSync(allowedFile, 'x');
writeFileSync(outsideFile, 'x');

const PLATFORM = process.platform;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value, configurable: true });
}

beforeEach(async () => {
  vi.resetModules();
  state.roots = false;
  state.origin = null;
  state.sensitive = false;
  state.temp = false;
  state.getThumbnail.mockReset().mockResolvedValue(null);
  state.resize.mockReset().mockResolvedValue(null);
  state.warn.mockClear();
  for (const key of ['documents', 'music', 'pictures', 'videos', 'downloads', 'desktop', 'temp']) {
    // Handler porównuje `realpath` żądania z prefiksami; na macOS `/var` jest
    // symlinkiem do `/private/var`, a na Windows runner używa nazw 8.3.
    paths[key] = realpathSync(allowed);
  }
  const mod = await import('../protocol');
  mod.registerOndaProtocolHandler();
});

afterAll(() => {
  setPlatform(PLATFORM);
  rmSync(dir, { recursive: true, force: true });
});

function request(
  path: string,
  params: Record<string, string> = {},
  headers: Record<string, string> = {}
): Promise<Response> {
  const handler = protocolState.handler;
  if (!handler) throw new Error('onda protocol handler not registered');
  const query = new URLSearchParams({ path, ...params }).toString();
  return handler(new Request(`onda://local/?${query}`, { headers }));
}

describe('onda protocol path policy', () => {
  it('rejects a missing or relative path without leaking filesystem details', async () => {
    expect((await request('')).status).toBe(400);
    expect((await request('relative/photo.jpg')).status).toBe(400);
  });

  it('rejects a path outside the allowed user folders', async () => {
    expect((await request(outsideFile)).status).toBe(403);
  });

  it('allows an existing path inside an allowed folder', async () => {
    // Bez parametrów w/t handler kończy na 404 (nie ma czego renderować), ale
    // przechodzi przez allowlistę, a nie przez 403.
    expect((await request(allowedFile)).status).toBe(404);
  });

  it('caches the allowed prefix list between requests', async () => {
    expect((await request(allowedFile)).status).toBe(404);
    expect((await request(allowedFile)).status).toBe(404);
  });
});

describe('onda protocol thumbnails and resizing', () => {
  it('serves a cached thumbnail with CORS headers for the app origin', async () => {
    state.getThumbnail.mockResolvedValue(Buffer.from('jpeg'));
    state.origin = 'https://app.example';

    const res = await request(allowedFile, { t: '200' }, { origin: 'https://app.example' });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toBe('private, max-age=86400');
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example');
    expect(state.getThumbnail).toHaveBeenCalledWith(realpathSync(allowedFile), 200);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('jpeg');
  });

  it('returns 404 when a thumbnail cannot be generated', async () => {
    const res = await request(allowedFile, { t: '64' });

    expect(res.status).toBe(404);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('clamps the requested thumbnail size', async () => {
    state.getThumbnail.mockResolvedValue(Buffer.from('x'));

    await request(allowedFile, { t: '999999' });

    expect(state.getThumbnail).toHaveBeenCalledWith(realpathSync(allowedFile), MAX_THUMB_SIZE);
  });

  it('resizes wide images and clamps the width', async () => {
    state.resize.mockResolvedValue(Buffer.from('resized'));

    const res = await request(allowedFile, { w: '999999' });

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, max-age=3600');
    expect(state.resize).toHaveBeenCalledWith(realpathSync(allowedFile), MAX_RESIZE_WIDTH);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('resized');
  });

  it('returns 404 when resizing fails or produces no buffer', async () => {
    expect((await request(allowedFile, { w: '800' })).status).toBe(404);
  });
});

describe('onda protocol sensitive paths', () => {
  it('rejects sensitive paths outside the allowed roots', async () => {
    state.sensitive = true;

    const res = await request(allowedFile);

    expect(res.status).toBe(403);
    expect(await res.text()).toBe('path not allowed');
  });

  it('allows sensitive paths from the system temp folder', async () => {
    state.sensitive = true;
    state.temp = true;

    expect((await request(allowedFile)).status).toBe(404);
  });

  it('allows sensitive paths inside the media roots', async () => {
    state.sensitive = true;
    state.roots = true;

    expect((await request(allowedFile)).status).toBe(404);
  });
});

describe('onda protocol platform and failure handling', () => {
  it('builds plain prefixes when not running on Windows', async () => {
    setPlatform('linux');
    try {
      expect((await request(allowedFile)).status).toBe(404);
    } finally {
      setPlatform(PLATFORM);
    }
  });

  it('returns 500 and logs when the request cannot be processed', async () => {
    const handler = protocolState.handler!;
    const broken = {
      url: `onda://local/?path=${encodeURIComponent(allowedFile)}`,
      headers: {
        get: () => {
          throw new Error('headers unavailable');
        }
      }
    } as unknown as Request;

    const res = await handler(broken);

    expect(res.status).toBe(500);
    expect(state.warn).toHaveBeenCalledWith(
      'protocol',
      expect.stringContaining('onda:// request failed'),
      expect.any(Error)
    );
  });
});
