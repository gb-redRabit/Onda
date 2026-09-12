import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  validatePluginId,
  isWithin,
  parseManifest,
  sanitizePermissions,
  validStorageKey,
  sanitizeStoredObject,
  storageSizeBytes,
  loadStateFile,
  saveStateFile,
  readStorageFile,
  writeStorageFile,
  compileNetworkPattern,
  urlAllowed,
  resolveRedirectUrl,
  MAX_STORAGE_KEYS
} from '../plugins-core';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'onda-plugins-test-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('validatePluginId', () => {
  it('accepts valid ids', () => {
    expect(validatePluginId('hello')).toBe(true);
    expect(validatePluginId('my-plugin.v2_x')).toBe(true);
  });
  it('rejects invalid ids', () => {
    expect(validatePluginId('')).toBe(false);
    expect(validatePluginId('has space')).toBe(false);
    expect(validatePluginId('a/b')).toBe(false);
    expect(validatePluginId('..')).toBe(false);
    expect(validatePluginId('.')).toBe(false);
    expect(validatePluginId('x'.repeat(81))).toBe(false);
    expect(validatePluginId(42)).toBe(false);
    expect(validatePluginId(undefined)).toBe(false);
  });
});

describe('isWithin', () => {
  it('accepts files inside the base dir', () => {
    expect(isWithin(dir, join(dir, 'sub', 'main.js'))).toBe(true);
    expect(isWithin(dir, join(dir, 'main.js'))).toBe(true);
  });
  it('rejects files outside the base dir', () => {
    expect(isWithin(dir, join(dir, '..', 'other', 'main.js'))).toBe(false);
    expect(isWithin(join(dir, 'base'), join(dir, 'base-other', 'main.js'))).toBe(false);
    expect(isWithin(dir, 'C:\\windows\\system32\\x.js')).toBe(false);
  });
});

describe('parseManifest', () => {
  it('parses a valid manifest', () => {
    const raw = {
      name: 'Scrobble',
      version: '1.0.0',
      description: 'Scrobbles plays',
      author: 'Me',
      entry: 'src/index.js',
      apiVersion: '1',
      permissions: {
        storage: true,
        notifications: true,
        network: { allow: ['https://api.site/*'] }
      },
      hooks: ['track:play', 'app:start']
    };
    const { manifest, error } = parseManifest(raw, 'scrobble');
    expect(error).toBeUndefined();
    expect(manifest).toMatchObject({
      id: 'scrobble',
      name: 'Scrobble',
      version: '1.0.0',
      entry: 'src/index.js',
      apiVersion: '1'
    });
    expect(manifest?.permissions.storage).toBe(true);
    expect(manifest?.permissions.network?.allow).toEqual(['https://api.site/*']);
  });
  it('rejects missing name', () => {
    expect(parseManifest({ version: '1.0.0', entry: 'a.js' }, 'x').error).toBe(
      'manifest:missing-name'
    );
  });
  it('rejects missing version', () => {
    expect(parseManifest({ name: 'X', entry: 'a.js' }, 'x').error).toBe('manifest:missing-version');
  });
  it('rejects bad entry', () => {
    expect(parseManifest({ name: 'X', version: '1', entry: '../evil.js' }, 'x').error).toBe(
      'manifest:bad-entry'
    );
    expect(parseManifest({ name: 'X', version: '1', entry: 'evil.py' }, 'x').error).toBe(
      'manifest:bad-entry'
    );
    expect(parseManifest({ name: 'X', version: '1', entry: '' }, 'x').error).toBe(
      'manifest:bad-entry'
    );
  });
  it('rejects non-object', () => {
    expect(parseManifest(null, 'x').error).toBe('manifest:not-object');
    expect(parseManifest('foo', 'x').error).toBe('manifest:not-object');
  });
  it('trims long fields', () => {
    const { manifest } = parseManifest(
      { name: 'Y', version: '1', entry: 'a.js', description: 'z'.repeat(400) },
      'y'
    );
    expect(manifest?.name).toBe('Y');
  });
  it('parses settings schema', () => {
    const { manifest } = parseManifest(
      {
        name: 'Cfg',
        version: '1',
        entry: 'a.js',
        settings: [
          { key: 'shape', label: 'Shape', type: 'text', default: 'triangle' },
          { key: 'volume', label: 'Volume', type: 'number', default: 50, min: 0, max: 100 },
          { key: 'on', label: 'On', type: 'boolean', default: true }
        ]
      },
      'cfg'
    );
    expect(manifest?.settings).toHaveLength(3);
    expect(manifest?.settings?.[0]).toMatchObject({
      key: 'shape',
      type: 'text',
      default: 'triangle'
    });
    expect(manifest?.settings?.[1].min).toBe(0);
    expect(manifest?.settings?.[2].type).toBe('boolean');
  });
  it('drops invalid settings fields and caps the list', () => {
    const { manifest } = parseManifest(
      {
        name: 'Cfg',
        version: '1',
        entry: 'a.js',
        settings: [
          { key: 'bad key', label: 'X', type: 'text' },
          { key: 'dup', label: 'A', type: 'text' },
          { key: 'dup', label: 'B', type: 'text' },
          { key: 'nope', label: 'N', type: 'color' },
          { key: 'ok', label: 'O', type: 'text' }
        ]
      },
      'cfg'
    );
    expect(manifest?.settings?.map((f) => f.key)).toEqual(['dup', 'ok']);
    const many = parseManifest(
      {
        name: 'Cfg',
        version: '1',
        entry: 'a.js',
        settings: Array.from({ length: 40 }, (_, i) => ({ key: 'k' + i, label: 'L', type: 'text' }))
      },
      'cfg'
    );
    expect(many.manifest?.settings).toBeUndefined();
  });
  it('sanitizes layoutElements only when visual permission is granted', () => {
    const withPerm = {
      name: 'Viz',
      version: '1',
      entry: 'a.js',
      permissions: { visual: true },
      layoutElements: [
        { element: 'cover', variant: 'flip-x', label: 'Flip' },
        { element: 'progress', variant: 'neon2' }
      ]
    };
    const { manifest } = parseManifest(withPerm, 'viz');
    expect(manifest?.layoutElements).toEqual([
      { element: 'cover', variant: 'flip-x', label: 'Flip' },
      { element: 'progress', variant: 'neon2' }
    ]);
  });
  it('ignores layoutElements without visual permission', () => {
    const { manifest } = parseManifest(
      {
        name: 'Viz',
        version: '1',
        entry: 'a.js',
        permissions: { storage: true },
        layoutElements: [{ element: 'cover', variant: 'flip-x' }]
      },
      'viz'
    );
    expect(manifest?.layoutElements).toBeUndefined();
  });
  it('drops invalid layoutElements and de-duplicates', () => {
    const { manifest } = parseManifest(
      {
        name: 'Viz',
        version: '1',
        entry: 'a.js',
        permissions: { visual: true },
        layoutElements: [
          { element: 'cover', variant: 'flip-x' },
          { element: 'cover', variant: 'flip-x' },
          { element: 'cover', variant: 'Bad Variant' },
          { element: 'cover' },
          { variant: 'x' },
          { element: 'progress', variant: 'ok-v2' }
        ]
      },
      'viz'
    );
    expect(manifest?.layoutElements).toEqual([
      { element: 'cover', variant: 'flip-x' },
      { element: 'progress', variant: 'ok-v2' }
    ]);
  });
});

describe('sanitizePermissions', () => {
  it('keeps only true booleans and valid network allow', () => {
    expect(sanitizePermissions(undefined)).toEqual({});
    expect(sanitizePermissions({ storage: 1, notifications: 'yes' })).toEqual({});
    expect(
      sanitizePermissions({ storage: true, player: true, network: { allow: ['https://a/*', 42] } })
    ).toEqual({
      storage: true,
      player: true,
      network: { allow: ['https://a/*'] }
    });
    expect(sanitizePermissions({ network: { allow: [] } })).toEqual({});
  });
});

describe('storage keys and limits', () => {
  it('validStorageKey', () => {
    expect(validStorageKey('foo.bar_baz-1')).toBe(true);
    expect(validStorageKey('')).toBe(false);
    expect(validStorageKey('x'.repeat(65))).toBe(false);
    expect(validStorageKey('has space')).toBe(false);
    expect(validStorageKey('a/b')).toBe(false);
  });
  it('sanitizeStoredObject drops invalid keys and oversized values', () => {
    const out = sanitizeStoredObject({
      ok: 'value',
      'bad key': 1,
      big: 'x'.repeat(5000)
    });
    expect(out).toEqual({ ok: 'value' });
  });
  it('storageSizeBytes', () => {
    expect(storageSizeBytes({ a: 1 })).toBe(Buffer.byteLength('{"a":1}'));
  });
});

describe('storage file round-trip', () => {
  it('readStorageFile/writeStorageFile', async () => {
    const file = join(dir, 'storage.json');
    await writeStorageFile(file, { a: 1, b: 'two' });
    expect(await readStorageFile(file)).toEqual({ a: 1, b: 'two' });
    const nearLimit: Record<string, unknown> = {};
    for (let i = 0; i < MAX_STORAGE_KEYS; i++) nearLimit[`k${i}`] = 'x'.repeat(4000);
    await expect(writeStorageFile(file, nearLimit)).rejects.toThrow('storage:too-large');
  });
  it('writeStorageFile enforces key count', async () => {
    const file = join(dir, 'storage.json');
    const data: Record<string, unknown> = {};
    for (let i = 0; i < MAX_STORAGE_KEYS + 10; i++) data[`k${i}`] = i;
    await expect(writeStorageFile(file, data)).rejects.toThrow('storage:too-many-keys');
  });
});

describe('state file round-trip', () => {
  it('loadStateFile ignores corrupt files', async () => {
    const file = join(dir, 'state.json');
    await writeFile(file, 'not json');
    expect(await loadStateFile(file)).toEqual({});
  });
  it('loadStateFile/saveStateFile', async () => {
    const file = join(dir, 'state.json');
    await saveStateFile(file, { 'a.b': { enabled: true } });
    expect(await loadStateFile(file)).toEqual({ 'a.b': { enabled: true } });
    await expect(loadStateFile(join(dir, 'missing.json'))).resolves.toEqual({});
  });
});

describe('network allowlist', () => {
  it('compileNetworkPattern', () => {
    expect(compileNetworkPattern('https://api.example.com/*')).not.toBeNull();
    expect(compileNetworkPattern('ftp://x/*')).toBeNull();
    expect(compileNetworkPattern('not a url')).toBeNull();
    expect(compileNetworkPattern('')).toBeNull();
  });
  it('urlAllowed', () => {
    const patterns = ['https://api.example.com/*', 'https://cdn.example.net/img/*.png'];
    expect(urlAllowed('https://api.example.com/v2/track', patterns)).toBe(true);
    expect(urlAllowed('https://api.example.com/v2/track?x=1', patterns)).toBe(true);
    expect(urlAllowed('https://cdn.example.net/img/cover.png', patterns)).toBe(true);
    expect(urlAllowed('https://cdn.example.net/img/cover.jpg', patterns)).toBe(false);
    expect(urlAllowed('https://evil.com/api', patterns)).toBe(false);
    expect(urlAllowed('http://api.example.com/x', patterns)).toBe(false);
    expect(urlAllowed('file:///etc/passwd', patterns)).toBe(false);
    expect(urlAllowed('not a url', patterns)).toBe(false);
  });
  it('urlAllowed rejects when patterns empty', () => {
    expect(urlAllowed('https://api.example.com/x', [])).toBe(false);
  });
  it('resolveRedirectUrl', () => {
    expect(resolveRedirectUrl('https://a.com/x', '/y')).toBe('https://a.com/y');
    expect(resolveRedirectUrl('https://a.com/x', 'https://b.com/z')).toBe('https://b.com/z');
    expect(resolveRedirectUrl('https://a.com/x', 'file:///etc/passwd')).toBeNull();
    expect(resolveRedirectUrl('https://a.com/x', 'javascript:alert(1)')).toBeNull();
  });
});
