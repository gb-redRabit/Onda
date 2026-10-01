import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// `mergeInfos` used to read a plugin's manifest twice: once directly and once
// more inside `readEntryDigest` (which reads the manifest to find `entry`).
// `parseManifest` runs exactly once per manifest read, so it is the observable
// proxy here (Node built-in ESM namespaces cannot be spied on).

const { parsedIds } = vi.hoisted(() => ({ parsedIds: [] as string[] }));

vi.mock('../plugins-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../plugins-core')>();
  return {
    ...actual,
    parseManifest: (raw: unknown, folderId: string) => {
      parsedIds.push(folderId);
      return actual.parseManifest(raw, folderId);
    }
  };
});

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
  permissions: {},
  hooks: [],
  settings: []
};
const ENTRY = 'api.log.info("demo");';
const sha256Hex = (value: string): string =>
  createHash('sha256').update(value, 'utf-8').digest('hex');

async function install(id: string): Promise<string> {
  const dir = join(userData, 'plugins', id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'manifest.json'), JSON.stringify({ id, ...MANIFEST }));
  await writeFile(join(dir, 'index.js'), ENTRY);
  return pluginConsentHash({ ...MANIFEST } as never, sha256Hex(ENTRY));
}

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`channel ${channel} is not registered`);
  return Promise.resolve(handler({}, ...args));
}

beforeAll(async () => {
  userData = await mkdtemp(join(tmpdir(), 'onda-plugin-reads-'));
  registerPluginsHandlers();
});

afterAll(async () => {
  await rm(userData, { recursive: true, force: true });
});

describe('plugin manifest reads', () => {
  it('parses an approved plugin manifest at most twice when listing', async () => {
    const id = 'reads-once';
    const consent = await install(id);
    await writeFile(
      join(userData, 'plugins-state.json'),
      JSON.stringify({ version: 1, [id]: { enabled: true, approvedConsent: consent } })
    );

    parsedIds.length = 0;
    const listed = (await invoke('plugins:list')) as Array<{ id: string }>;
    expect(listed.map((p) => p.id)).toContain(id);

    // One parse while listing the folder + one during the merge (was two).
    expect(parsedIds.filter((parsedId) => parsedId === id)).toHaveLength(2);
  });
});
