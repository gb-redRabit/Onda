import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const state = vi.hoisted(() => ({
  failWrites: false,
  loggerWarn: vi.fn()
}));

vi.mock('electron', () => ({
  app: { getPath: () => userData }
}));

vi.mock('../../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock('../plugins-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../plugins-core')>();
  return {
    ...actual,
    writeStorageFile: (filePath: string, data: Record<string, unknown>) => {
      if (state.failWrites) return Promise.reject(new Error('disk'));
      return actual.writeStorageFile(filePath, data);
    }
  };
});

import {
  getPluginsDir,
  getPluginsDataDir,
  getExamplesDir,
  stateFilePath,
  pluginStorageFile,
  pluginSettingsFile,
  readManifest,
  readManifestById,
  listInstalledPlugins,
  loadEnabledState,
  setEnabled,
  readPluginEntry,
  readEntryDigest,
  approvedManifest,
  mergeInfos,
  storageData,
  settingsData
} from '../plugins-store';
import {
  MAX_ENTRY_BYTES,
  MAX_MANIFEST_BYTES,
  MAX_PLUGINS,
  pluginConsentHash,
  sha256Hex
} from '../plugins-core';

let userData = '';

const ENTRY = 'api.log.info("hello");';

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Demo',
    version: '1.0.0',
    entry: 'index.js',
    permissions: {},
    hooks: [],
    ...overrides
  };
}

async function writePlugin(
  id: string,
  overrides: Record<string, unknown> = {},
  entry: string | null = ENTRY
): Promise<string> {
  const dir = join(userData, 'plugins', id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'manifest.json'), JSON.stringify({ id, ...manifest(overrides) }));
  if (entry !== null) await writeFile(join(dir, 'index.js'), entry);
  return dir;
}

function consentFor(overrides: Record<string, unknown> = {}, entry = ENTRY): string {
  return pluginConsentHash(manifest(overrides) as never, sha256Hex(entry));
}

beforeAll(async () => {
  userData = await mkdtemp(join(tmpdir(), 'onda-plugins-store-'));
});

afterAll(async () => {
  await rm(userData, { recursive: true, force: true });
});

beforeEach(async () => {
  state.failWrites = false;
  state.loggerWarn.mockClear();
  await rm(join(userData, 'plugins'), { recursive: true, force: true });
  await rm(join(userData, 'plugins-data'), { recursive: true, force: true });
  await rm(join(userData, 'plugins-state.json'), { force: true });
});

describe('paths', () => {
  it('derives every plugin path from the Electron userData directory', () => {
    expect(getPluginsDir()).toBe(join(userData, 'plugins'));
    expect(getPluginsDataDir()).toBe(join(userData, 'plugins-data'));
    expect(stateFilePath()).toBe(join(userData, 'plugins-state.json'));
    expect(pluginStorageFile('demo')).toBe(join(userData, 'plugins-data', 'demo', 'storage.json'));
    expect(pluginSettingsFile('demo')).toBe(
      join(userData, 'plugins-data', 'demo', 'settings.json')
    );
    expect(getExamplesDir()).toContain(join('resources', 'plugins-examples'));
  });
});

describe('readManifest', () => {
  it('parses a valid manifest and binds it to the folder id', async () => {
    const dir = await writePlugin('demo', { description: 'Demo plugin' });

    const parsed = await readManifest(dir, 'demo');

    expect(parsed).toMatchObject({
      id: 'demo',
      name: 'Demo',
      version: '1.0.0',
      entry: 'index.js',
      description: 'Demo plugin'
    });
  });

  it('rejects missing files, malformed JSON and invalid folder ids', async () => {
    const missing = join(userData, 'plugins', 'missing');
    expect(await readManifest(missing, 'missing')).toBeNull();

    const dir = await writePlugin('broken');
    await writeFile(join(dir, 'manifest.json'), '{not-json');
    expect(await readManifest(dir, 'broken')).toBeNull();

    const valid = await writePlugin('valid');
    expect(await readManifest(valid, 'bad id')).toBeNull();
  });

  it('rejects manifests that exceed the size budget', async () => {
    const dir = await writePlugin('huge', {}, null);
    await writeFile(join(dir, 'manifest.json'), 'x'.repeat(MAX_MANIFEST_BYTES + 1));

    expect(await readManifest(dir, 'huge')).toBeNull();
  });

  it('rejects invalid manifest fields and entries escaping the plugin directory', async () => {
    const noName = await writePlugin('no-name', { name: undefined }, null);
    expect(await readManifest(noName, 'no-name')).toBeNull();

    const noEntry = await writePlugin('no-entry', { entry: undefined }, null);
    expect(await readManifest(noEntry, 'no-entry')).toBeNull();

    const outside = await writePlugin('outside', { entry: '/outside.js' }, null);
    expect(await readManifest(outside, 'outside')).toBeNull();
  });

  it('resolves manifests by id only for valid ids', async () => {
    await writePlugin('by-id');

    expect(await readManifestById('by-id')).toMatchObject({ id: 'by-id' });
    expect(await readManifestById('missing')).toBeNull();
    expect(await readManifestById('../escape')).toBeNull();
  });
});

describe('listInstalledPlugins', () => {
  it('lists only valid plugin folders, sorted by name', async () => {
    await writePlugin('zeta', { name: 'Zeta' });
    await writePlugin('alpha', { name: 'Alpha' });
    await writePlugin('Broken Id', { name: 'Broken' });
    await writeFile(join(userData, 'plugins', 'plain-file.txt'), 'x');
    await mkdir(join(userData, 'plugins', 'no-manifest'), { recursive: true });

    const plugins = await listInstalledPlugins();

    expect(plugins.map((plugin) => plugin.id)).toEqual(['alpha', 'zeta']);
    expect(plugins[0]).toMatchObject({ name: 'Alpha', enabled: false });
    expect(plugins[0].capabilityHash).toBeTruthy();
  });

  it('caps the number of discovered plugins', async () => {
    for (let i = 0; i < MAX_PLUGINS + 1; i++) {
      await writePlugin(`plugin-${String(i).padStart(2, '0')}`);
    }

    const plugins = await listInstalledPlugins();

    expect(plugins).toHaveLength(MAX_PLUGINS);
  });
});

describe('enabled state', () => {
  it('starts empty and records enabled flags', async () => {
    expect(await loadEnabledState()).toEqual({});

    await setEnabled('demo', true);
    expect(await loadEnabledState()).toEqual({ demo: { enabled: true } });
  });

  it('stores approved consent and preserves it when only toggling', async () => {
    const consent = 'a'.repeat(64);

    await setEnabled('demo', true, consent);
    expect((await loadEnabledState()).demo).toEqual({ enabled: true, approvedConsent: consent });

    await setEnabled('demo', false);
    expect((await loadEnabledState()).demo).toEqual({ enabled: false, approvedConsent: consent });
  });

  it('clears consent when it is explicitly null', async () => {
    await setEnabled('demo', true, 'a'.repeat(64));

    await setEnabled('demo', true, null);

    expect((await loadEnabledState()).demo).toEqual({ enabled: true });
  });
});

describe('plugin entry', () => {
  it('reads the entry with the manifest it is given', async () => {
    const dir = await writePlugin('demo');

    expect(await readPluginEntry(dir, 'demo')).toBe(ENTRY);
    expect(
      await readPluginEntry(dir, 'demo', {
        id: 'demo',
        name: 'Demo',
        version: '1.0.0',
        entry: 'index.js',
        apiVersion: '1',
        permissions: {},
        hooks: []
      })
    ).toBe(ENTRY);
  });

  it('returns null for missing manifests, entries and oversized files', async () => {
    const dir = await writePlugin('demo');
    const noManifest = join(userData, 'plugins', 'no-manifest');
    await mkdir(noManifest, { recursive: true });
    expect(await readPluginEntry(noManifest, 'no-manifest')).toBeNull();

    await rm(join(dir, 'index.js'));
    expect(await readPluginEntry(dir, 'demo')).toBeNull();

    const big = await writePlugin('big', {}, 'x'.repeat(MAX_ENTRY_BYTES + 1));
    expect(await readPluginEntry(big, 'big')).toBeNull();
  });
});

describe('entry digest', () => {
  it('returns the SHA-256 of the entry and reuses the cached value', async () => {
    const dir = await writePlugin('demo');

    const digest = await readEntryDigest(dir, 'demo');

    expect(digest).toBe(sha256Hex(ENTRY));
    expect(await readEntryDigest(dir, 'demo')).toBe(digest);
  });

  it('invalidates the cache when the entry file changes', async () => {
    const dir = await writePlugin('demo');
    const before = await readEntryDigest(dir, 'demo');

    await writeFile(join(dir, 'index.js'), `${ENTRY}\n// changed`);

    expect(await readEntryDigest(dir, 'demo')).not.toBe(before);
  });

  it('returns null without a manifest, outside the plugin dir or without a file', async () => {
    const dir = await writePlugin('demo');
    const noManifest = join(userData, 'plugins', 'no-manifest');
    await mkdir(noManifest, { recursive: true });

    expect(await readEntryDigest(noManifest, 'no-manifest')).toBeNull();
    expect(
      await readEntryDigest(dir, 'demo', {
        id: 'demo',
        name: 'Demo',
        version: '1.0.0',
        entry: '/outside.js',
        apiVersion: '1',
        permissions: {},
        hooks: []
      })
    ).toBeNull();

    await rm(join(dir, 'index.js'));
    expect(await readEntryDigest(dir, 'demo')).toBeNull();
  });

  it('returns null for oversized entry files', async () => {
    const dir = await writePlugin('big', {}, 'x'.repeat(MAX_ENTRY_BYTES + 1));

    expect(await readEntryDigest(dir, 'big')).toBeNull();
  });

  it('evicts the oldest digest when the cache grows too large', async () => {
    for (let i = 0; i < 130; i++) {
      const id = `digest-${String(i).padStart(3, '0')}`;
      const dir = await writePlugin(id, {}, `${ENTRY}// ${i}`);
      await readEntryDigest(dir, id);
    }

    const digest = await readEntryDigest(join(userData, 'plugins', 'digest-129'), 'digest-129');

    expect(digest).toBe(sha256Hex(`${ENTRY}// 129`));
  });
});

describe('approvedManifest', () => {
  it('requires a valid id, enabled flag and saved consent', async () => {
    await writePlugin('demo');

    expect(await approvedManifest('../escape')).toBeNull();
    expect(await approvedManifest('demo')).toBeNull();

    await setEnabled('demo', true);
    expect(await approvedManifest('demo')).toBeNull();

    await writeFile(
      join(userData, 'plugins-state.json'),
      JSON.stringify({ demo: { enabled: false, approvedConsent: consentFor() } })
    );
    expect(await approvedManifest('demo')).toBeNull();
  });

  it('returns the manifest when consent matches the current entry', async () => {
    await writePlugin('demo');
    await setEnabled('demo', true, consentFor());

    expect(await approvedManifest('demo')).toMatchObject({ id: 'demo', name: 'Demo' });
  });

  it('rejects stale consent and missing entry files', async () => {
    await writePlugin('demo');
    await setEnabled('demo', true, consentFor({ hooks: ['onLoad'] }));
    expect(await approvedManifest('demo')).toBeNull();

    await setEnabled('demo', true, consentFor());
    await rm(join(userData, 'plugins', 'demo', 'index.js'));
    expect(await approvedManifest('demo')).toBeNull();
  });

  it('rejects consent when the manifest is gone', async () => {
    await writePlugin('demo');
    const consent = consentFor();
    await rm(join(userData, 'plugins', 'demo', 'manifest.json'));
    await setEnabled('demo', true, consent);

    expect(await approvedManifest('demo')).toBeNull();
  });
});

describe('mergeInfos', () => {
  const info = (id: string) => ({
    id,
    name: id,
    version: '1.0.0',
    enabled: false,
    permissions: {},
    hooks: [],
    capabilityHash: 'x'
  });

  it('marks plugins without state as disabled and not needing review', async () => {
    await writePlugin('demo');

    const merged = await mergeInfos([info('demo') as never], {});

    expect(merged[0]).toMatchObject({ enabled: false, permissionReviewRequired: false });
  });

  it('enables plugins whose consent still matches', async () => {
    await writePlugin('demo');

    const merged = await mergeInfos([info('demo') as never], {
      demo: { enabled: true, approvedConsent: consentFor() }
    });

    expect(merged[0]).toMatchObject({ enabled: true, permissionReviewRequired: false });
  });

  it('forces review after capabilities or code change', async () => {
    await writePlugin('demo');

    const mismatched = await mergeInfos([info('demo') as never], {
      demo: { enabled: true, approvedConsent: consentFor({ hooks: ['onLoad'] }) }
    });
    expect(mismatched[0]).toMatchObject({ enabled: false, permissionReviewRequired: true });

    await writeFile(join(userData, 'plugins', 'demo', 'index.js'), 'changed');
    const codeChanged = await mergeInfos([info('demo') as never], {
      demo: { enabled: true, approvedConsent: consentFor() }
    });
    expect(codeChanged[0]).toMatchObject({ enabled: false, permissionReviewRequired: true });
  });

  it('forces review when the manifest cannot be read', async () => {
    await writePlugin('demo');
    const consent = consentFor();
    await rm(join(userData, 'plugins', 'demo', 'manifest.json'));

    const merged = await mergeInfos([info('demo') as never], {
      demo: { enabled: true, approvedConsent: consent }
    });

    expect(merged[0]).toMatchObject({ enabled: false, permissionReviewRequired: true });
  });
});

describe('plugin data', () => {
  it('creates the data directory and reads storage', async () => {
    expect(await storageData('demo')).toEqual({});
    expect(await storageData('demo')).toEqual({});
  });

  it('returns stored settings unchanged without a manifest schema', async () => {
    const dir = join(getPluginsDataDir(), 'demo');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'settings.json'), JSON.stringify({ theme: 'dark', size: 'large' }));

    expect(await settingsData('demo')).toEqual({ theme: 'dark', size: 'large' });
    expect(await settingsData('demo', null)).toEqual({ theme: 'dark', size: 'large' });
  });

  it('migrates stored settings to the manifest schema', async () => {
    const dir = join(getPluginsDataDir(), 'demo');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'settings.json'),
      JSON.stringify({ theme: 'dark', legacy: true, size: 99 })
    );
    const withSettings = {
      id: 'demo',
      name: 'Demo',
      version: '1.0.0',
      entry: 'index.js',
      apiVersion: '1',
      permissions: {},
      hooks: [],
      settings: [
        { key: 'theme', label: 'Theme', type: 'text', default: 'light' },
        { key: 'size', label: 'Size', type: 'number', min: 1, max: 5, default: 2 }
      ]
    } as never;

    const value = await settingsData('demo', withSettings);

    expect(value).toEqual({ theme: 'dark', size: 2 });
    expect(JSON.parse(await readText(join(dir, 'settings.json')))).toEqual(value);
  });

  it('keeps the migrated value when the rewrite fails', async () => {
    const dir = join(getPluginsDataDir(), 'demo');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'settings.json'), JSON.stringify({ theme: 99 }));
    const withSettings = {
      id: 'demo',
      name: 'Demo',
      version: '1.0.0',
      entry: 'index.js',
      apiVersion: '1',
      permissions: {},
      hooks: [],
      settings: [{ key: 'theme', label: 'Theme', type: 'text', default: 'light' }]
    } as never;
    state.failWrites = true;

    await expect(settingsData('demo', withSettings)).resolves.toEqual({ theme: 'light' });
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'plugins',
      'settings migration write failed',
      expect.any(Error)
    );
  });
});

async function readText(filePath: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  return readFile(filePath, 'utf-8');
}
