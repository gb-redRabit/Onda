import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const { paths, protocolState } = vi.hoisted(() => ({
  paths: {} as Record<string, string>,
  protocolState: { handler: null as ((req: Request) => Promise<Response>) | null }
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
vi.mock('../media/media-server', () => ({ isPathWithinAllowedRoots: () => false }));
vi.mock('../utils/origin-guard', () => ({ allowedAppOrigin: () => null }));
vi.mock('../utils/sharp', () => ({
  SharpService: { getThumbnail: vi.fn(), resize: vi.fn() }
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

beforeEach(async () => {
  vi.resetModules();
  for (const key of ['documents', 'music', 'pictures', 'videos', 'downloads', 'desktop', 'temp']) {
    // Handler porównuje `realpath` żądania z prefiksami; na macOS `/var` jest
    // symlinkiem do `/private/var`, a na Windows runner używa nazw 8.3.
    paths[key] = realpathSync(allowed);
  }
  const mod = await import('../protocol');
  mod.registerOndaProtocolHandler();
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function request(path: string): Promise<Response> {
  const handler = protocolState.handler;
  if (!handler) throw new Error('onda protocol handler not registered');
  return handler(new Request(`onda://local/?path=${encodeURIComponent(path)}`));
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
});
