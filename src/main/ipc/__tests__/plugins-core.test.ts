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
  pluginSettingValueValid,
  pluginCapabilityHash,
  pluginConsentHash,
  pluginApprovalMatches,
  normalizePluginSettings,
  sha256Hex,
  storageSizeBytes,
  loadStateFile,
  saveStateFile,
  readStorageFile,
  writeStorageFile,
  compileNetworkPattern,
  compiledNetworkPatternCacheSize,
  MAX_PATTERN_CACHE_SIZE,
  urlAllowed,
  resolveRedirectUrl,
  MAX_STORAGE_KEYS
} from '../plugins/plugins-core';
import { settingWriteAllowed, storagePermissionGranted } from '../plugins/plugins-guards';

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

  it('keeps only host-known uiSlots, and only with visual permission', () => {
    const { manifest } = parseManifest(
      {
        name: 'Slotty',
        version: '1',
        entry: 'a.js',
        permissions: { visual: true },
        uiSlots: ['audio-view', 'audio-view', 'player-bar', 42]
      },
      'slotty'
    );
    expect(manifest?.uiSlots).toEqual(['audio-view']);

    const { manifest: noVisual } = parseManifest(
      {
        name: 'Slotty',
        version: '1',
        entry: 'a.js',
        permissions: { storage: true },
        uiSlots: ['audio-view']
      },
      'slotty'
    );
    expect(noVisual?.uiSlots).toBeUndefined();
  });
});

describe('plugin setting schema values', () => {
  it('validates setting type, storage bounds, and numeric min/max', () => {
    expect(
      pluginSettingValueValid({ key: 'enabled', label: 'Enabled', type: 'boolean' }, true)
    ).toBe(true);
    expect(
      pluginSettingValueValid({ key: 'count', label: 'Count', type: 'number', min: 1, max: 5 }, 3)
    ).toBe(true);
    expect(
      pluginSettingValueValid({ key: 'count', label: 'Count', type: 'number', min: 1, max: 5 }, 0)
    ).toBe(false);
    expect(
      pluginSettingValueValid({ key: 'enabled', label: 'Enabled', type: 'boolean' }, 'true')
    ).toBe(false);
    expect(
      pluginSettingValueValid({ key: 'text', label: 'Text', type: 'text' }, 'x'.repeat(4097))
    ).toBe(false);
  });
});

describe('plugin capability approval', () => {
  const manifest = {
    permissions: { storage: true, network: { allow: ['https://api.example/*'] } },
    hooks: ['track:play', 'app:start'],
    layoutElements: [{ element: 'cover', variant: 'circle' }]
  };

  it('hashes the same capability set independent of hook and network order', () => {
    expect(pluginCapabilityHash(manifest)).toBe(
      pluginCapabilityHash({
        permissions: { network: { allow: ['https://api.example/*'] }, storage: true },
        hooks: ['app:start', 'track:play'],
        layoutElements: [{ element: 'cover', variant: 'circle' }]
      })
    );
  });

  it('requires a fresh approval when a permission, hook, or visual slot changes', () => {
    const code = sha256Hex('console.log(1)');
    const approved = pluginConsentHash(manifest, code);
    expect(pluginApprovalMatches(manifest, code, approved)).toBe(true);
    expect(
      pluginApprovalMatches(
        { ...manifest, permissions: { ...manifest.permissions, player: true } },
        code,
        approved
      )
    ).toBe(false);
    expect(pluginApprovalMatches({ ...manifest, hooks: ['track:end'] }, code, approved)).toBe(
      false
    );
    expect(
      pluginApprovalMatches(
        { ...manifest, layoutElements: [{ element: 'cover', variant: 'diamond' }] },
        code,
        approved
      )
    ).toBe(false);
    expect(pluginApprovalMatches(manifest, code, undefined)).toBe(false);
    expect(pluginApprovalMatches(manifest, code, 'not-a-hash')).toBe(false);
  });

  it('requires a fresh approval when the plugin code changes', () => {
    const original = sha256Hex('console.log(1)');
    const updated = sha256Hex('console.log(2)');
    const approved = pluginConsentHash(manifest, original);

    expect(pluginApprovalMatches(manifest, original, approved)).toBe(true);
    expect(pluginApprovalMatches(manifest, updated, approved)).toBe(false);
  });

  it('covers declared ui slots in the approval digest', () => {
    const code = sha256Hex('console.log(1)');
    const withSlot = { ...manifest, permissions: { visual: true }, uiSlots: ['audio-view'] };
    const approved = pluginConsentHash(withSlot, code);

    expect(pluginApprovalMatches(withSlot, code, approved)).toBe(true);
    // Dodanie powierzchni hosta po zatwierdzeniu unieważnia je.
    expect(
      pluginApprovalMatches({ ...withSlot, uiSlots: ['audio-view', 'player-bar'] }, code, approved)
    ).toBe(false);
    // Usunięcie slotu to też zmiana, więc stare zatwierdzenie nie jest ponownie używane.
    expect(pluginApprovalMatches(manifest, code, approved)).toBe(false);
  });
});

describe('normalizePluginSettings', () => {
  const manifest = {
    settings: [
      { key: 'shape', label: 'Shape', type: 'text' as const, default: 'circle' },
      { key: 'volume', label: 'Volume', type: 'number' as const, min: 0, max: 100 }
    ]
  };

  it('drops undeclared keys and invalid values, reporting that a rewrite is needed', () => {
    const result = normalizePluginSettings(manifest, {
      shape: 42,
      volume: 150,
      removed: 'stale'
    });
    expect(result.value).toEqual({ shape: 'circle' });
    expect(result.changed).toBe(true);
  });

  it('keeps compatible values and reports no rewrite', () => {
    const result = normalizePluginSettings(manifest, { shape: 'hexagon', volume: 80 });
    expect(result.value).toEqual({ shape: 'hexagon', volume: 80 });
    expect(result.changed).toBe(false);
  });

  it('leaves stored values untouched when the manifest declares no settings', () => {
    const result = normalizePluginSettings({ settings: undefined }, { anything: 1 });
    expect(result.value).toEqual({ anything: 1 });
    expect(result.changed).toBe(false);
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
    const approval = 'a'.repeat(64);
    await saveStateFile(file, { 'a.b': { enabled: true, approvedConsent: approval } });
    expect(await loadStateFile(file)).toEqual({
      'a.b': { enabled: true, approvedConsent: approval }
    });
    await expect(loadStateFile(join(dir, 'missing.json'))).resolves.toEqual({});
  });

  it('ignores a legacy capability-only approval so updated code is re-reviewed', async () => {
    const file = join(dir, 'state-legacy.json');
    await writeFile(
      file,
      JSON.stringify({ 'a.b': { enabled: true, approvedCapabilities: 'a'.repeat(64) } })
    );
    expect(await loadStateFile(file)).toEqual({ 'a.b': { enabled: true } });
  });
});

describe('network allowlist', () => {
  it('compileNetworkPattern', () => {
    expect(compileNetworkPattern('https://api.example.com/*')).not.toBeNull();
    expect(compileNetworkPattern('ftp://x/*')).toBeNull();
    expect(compileNetworkPattern('not a url')).toBeNull();
    expect(compileNetworkPattern('')).toBeNull();
  });
  it('bounds the compiled-pattern cache so plugin allowlists cannot grow it without limit', () => {
    // Wzorce pochodzą z manifestów pluginów, a liczba pozycji `network.allow` nie jest
    // limitowana — cache musi mieć twardy górny rozmiar, inaczej autor pluginu może
    // wymusić kompilację setek tysięcy RegExpów i wyczerpać pamięć procesu głównego.
    for (let i = 0; i < MAX_PATTERN_CACHE_SIZE + 100; i++) {
      compileNetworkPattern(`https://h${i}.example.com/*`);
    }
    expect(compiledNetworkPatternCacheSize()).toBeLessThanOrEqual(MAX_PATTERN_CACHE_SIZE);
    // Wyparcie najstarszych wpisów nie psuje poprawności — wzorzec kompiluje się ponownie.
    expect(compileNetworkPattern('https://h0.example.com/*')).not.toBeNull();
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
  it('urlAllowed requires a host boundary (no look-alike hosts)', () => {
    // Regresja: `https://api.example.com` pasowało kiedyś do `api.example.com.evil`.
    const bare = ['https://api.example.com'];
    expect(urlAllowed('https://api.example.com.evil/steal', bare)).toBe(false);
    expect(urlAllowed('https://api.example.com', bare)).toBe(true);
    expect(urlAllowed('https://api.example.com/v1/track', bare)).toBe(true);
    expect(urlAllowed('https://api.example.com?x=1', bare)).toBe(true);
    expect(urlAllowed('https://api.example.com#frag', bare)).toBe(true);
    // Port na hoście z allowlisty jest w porządku (ten sam host, np. źródła self-hosted).
    expect(urlAllowed('https://api.example.com:8443/v1', bare)).toBe(true);
    expect(urlAllowed('https://api.example.com.evil:8443/v1', bare)).toBe(false);
    expect(urlAllowed('https://api.example.comm/v1', bare)).toBe(false);

    // Wildcardy nadal działają, także z jawnym sufiksem hosta.
    expect(urlAllowed('https://a.cdn.example.net/x', ['https://*.example.net/*'])).toBe(true);
    expect(urlAllowed('https://evil.com/x', ['https://*.example.net/*'])).toBe(false);
    expect(urlAllowed('https://evil.com/.example.net/x', ['https://*.example.net/*'])).toBe(false);
    expect(urlAllowed('https://evil.com/?q=.example.net', ['https://*.example.net/*'])).toBe(false);
  });
  it('urlAllowed matches the normalized URL (backslash and userinfo bypasses)', () => {
    // Regresja P0: dopasowanie szło po surowym stringu, więc `\` (który parser
    // WHATWG zamienia na `/`) i userinfo `@` pozwalały uderzyć w inny host niż
    // widziała allowlista.
    expect(urlAllowed('https://evil.com\\.example.net/x', ['https://*.example.net/*'])).toBe(false);
    expect(urlAllowed('https://evil.com\\.example.com/x', ['https://*.example.com/*'])).toBe(false);
    expect(urlAllowed('https://api.example.com@evil.com/', ['https://api.example.com/*'])).toBe(
      false
    );
    expect(urlAllowed('https://api.example.com@evil.com/', ['https://api.example.com*'])).toBe(
      false
    );
    // Wielkie litery normalizują się (proto/host) — poprawny cel nadal przechodzi.
    expect(urlAllowed('HTTPS://API.EXAMPLE.COM/X', ['https://api.example.com/*'])).toBe(true);
    expect(urlAllowed('https://api.example.com.evil/x', ['https://api.example.com'])).toBe(false);
  });
  it('resolveRedirectUrl', () => {
    expect(resolveRedirectUrl('https://a.com/x', '/y')).toBe('https://a.com/y');
    expect(resolveRedirectUrl('https://a.com/x', 'https://b.com/z')).toBe('https://b.com/z');
    expect(resolveRedirectUrl('https://a.com/x', 'file:///etc/passwd')).toBeNull();
    expect(resolveRedirectUrl('https://a.com/x', 'javascript:alert(1)')).toBeNull();
  });
});

describe('plugin permission guards (plan 7.1)', () => {
  it('storagePermissionGranted only allows an explicit storage:true', () => {
    expect(storagePermissionGranted({})).toBe(false);
    expect(storagePermissionGranted({ network: { allow: ['https://x/'] } })).toBe(false);
    expect(storagePermissionGranted({ storage: true })).toBe(true);
  });

  it('settingWriteAllowed lets storage plugins write anything', () => {
    expect(settingWriteAllowed({ storage: true }, [], 'anything')).toBe(true);
  });

  it('settingWriteAllowed limits storage-less plugins to declared settings', () => {
    expect(settingWriteAllowed({}, ['shape'], 'shape')).toBe(true);
    expect(settingWriteAllowed({}, ['shape'], 'sneaky')).toBe(false);
    expect(settingWriteAllowed({}, undefined, 'shape')).toBe(false);
  });
});
