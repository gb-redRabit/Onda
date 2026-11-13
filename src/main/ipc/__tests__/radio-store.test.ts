import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { IpcRadioStation } from '../../../shared/types/ipc';

// Persisted stations are sanitized on the way in and out, and their hosts feed the
// stream-proxy allowlist so a user-added station is playable right away.

const h = vi.hoisted(() => ({
  userData: '',
  handlers: new Map<string, (...args: never[]) => unknown>(),
  warn: vi.fn()
}));

vi.mock('electron', () => ({
  app: { getPath: () => h.userData },
  ipcMain: {
    handle: (channel: string, handler: (...args: never[]) => unknown) =>
      h.handlers.set(channel, handler)
  }
}));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: h.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import {
  loadRadioData,
  persistRadio,
  isAllowedRadioHost,
  registerRadioHandlers
} from '../radio-store';

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'onda-radio-test-'));
  file = join(dir, 'radios.json');
  h.userData = dir;
  h.handlers.clear();
  h.warn.mockClear();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const stations: IpcRadioStation[] = [
  { id: 'r1', name: 'Test FM', url: 'http://radio.example:8000/stream', addedAt: 1 },
  { id: 'r2', name: 'Rock FM', url: 'https://rock.example/stream.mp3', addedAt: 2 }
];

function setupHandlers() {
  registerRadioHandlers();
  const load = h.handlers.get('radio:load') as () => Promise<{
    stations: IpcRadioStation[];
  }>;
  const save = h.handlers.get('radio:save') as (
    event: unknown,
    input: IpcRadioStation[]
  ) => Promise<boolean>;
  return { load, save };
}

describe('radio store', () => {
  it('returns empty list for a missing file', async () => {
    await expect(loadRadioData(file)).resolves.toEqual([]);
  });

  it('round-trips persisted stations', async () => {
    await persistRadio(file, stations);
    await expect(loadRadioData(file)).resolves.toEqual(stations);
  });

  it('registers station hosts for the stream proxy allowlist', async () => {
    await persistRadio(file, stations);
    await loadRadioData(file);
    expect(isAllowedRadioHost('radio.example')).toBe(true);
    expect(isAllowedRadioHost('ROCK.EXAMPLE')).toBe(true);
    expect(isAllowedRadioHost('evil.example')).toBe(false);
  });

  it('drops malformed stations and caps the list', async () => {
    const broken = {
      version: 1,
      stations: [
        { id: 'a', name: 'No URL' },
        { id: 'b', name: 'Bad scheme', url: 'file:///etc/passwd' },
        { id: 'c', name: 'Ok', url: 'http://c.example:8000/live' },
        null,
        'junk',
        ...Array.from({ length: 250 }, (_, i) => ({
          id: `bulk${i}`,
          name: `Bulk ${i}`,
          url: `http://bulk${i}.example/stream`
        }))
      ]
    };
    await writeFile(file, JSON.stringify(broken), 'utf-8');
    const loaded = await loadRadioData(file);
    expect(loaded.length).toBeLessThanOrEqual(200);
    expect(loaded.map((s) => s.id)).toContain('c');
    expect(loaded.map((s) => s.id)).not.toContain('a');
    expect(loaded.map((s) => s.id)).not.toContain('b');
  });

  it('dedupes stations by url', async () => {
    const dupes = [...stations, { ...stations[0]!, id: 'r3' }];
    await persistRadio(file, dupes);
    const loaded = await loadRadioData(file);
    expect(loaded).toHaveLength(2);
  });

  it('rejects credentials and loopback literals but keeps LAN and hostnames', async () => {
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        stations: [
          { id: 'creds', name: 'Creds', url: 'http://user:pass@radio.example/stream' },
          { id: 'loop', name: 'Loopback', url: 'http://127.0.0.1:8000/stream' },
          { id: 'loop6', name: 'Loopback v6', url: 'http://[::1]:8000/stream' },
          { id: 'blank', name: '   ', url: 'http://blank.example/stream' },
          { id: 'badurl', name: 'Bad URL', url: 'http://exa mple.com/stream' },
          { id: 'lan', name: 'LAN', url: 'http://192.168.1.10:8000/stream' },
          { id: 'host', name: 'Hostname', url: 'http://localhost:8000/stream' }
        ]
      }),
      'utf-8'
    );

    const ids = (await loadRadioData(file)).map((s) => s.id);
    expect(ids).toEqual(['lan', 'host']);
  });

  it('truncates oversized fields and defaults the added timestamp', async () => {
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        stations: [
          {
            id: 'x'.repeat(200),
            name: 'n'.repeat(300),
            url: `http://limits.example/${'p'.repeat(2100)}`
          }
        ]
      }),
      'utf-8'
    );

    const [station] = await loadRadioData(file);
    expect(station!.id).toHaveLength(128);
    expect(station!.name).toHaveLength(200);
    expect(station!.url).toHaveLength(2048);
    expect(typeof station!.addedAt).toBe('number');
  });

  it('ignores a file written by another schema version', async () => {
    await writeFile(file, JSON.stringify({ version: 99, stations }), 'utf-8');
    await expect(loadRadioData(file)).resolves.toEqual([]);
  });

  it('logs instead of throwing when persisting fails', async () => {
    await expect(persistRadio(dir, stations)).resolves.toBeUndefined();
    expect(h.warn).toHaveBeenCalledWith(
      'radio',
      'failed to persist radio stations',
      expect.anything()
    );
  });
});

describe('registerRadioHandlers', () => {
  it('registers the load and save channels', () => {
    setupHandlers();

    expect([...h.handlers.keys()]).toEqual(['radio:load', 'radio:save']);
  });

  it('serves persisted stations on first load and caches them', async () => {
    await persistRadio(file, stations);
    const { load } = setupHandlers();

    await expect(load()).resolves.toEqual({ stations });
    await rm(file, { force: true });
    await expect(load()).resolves.toEqual({ stations });
  });

  it('sanitizes and persists stations on save', async () => {
    const { save, load } = setupHandlers();
    const input: IpcRadioStation[] = [
      ...stations,
      { id: 'dup', name: 'Duplicate', url: stations[0]!.url, addedAt: 3 },
      { id: 'bad', name: 'Bad', url: 'file:///etc/passwd', addedAt: 4 }
    ];

    await expect(save(null, input)).resolves.toBe(true);

    const written = JSON.parse(await readFile(file, 'utf-8'));
    expect(written.version).toBe(1);
    expect(written.stations.map((s: IpcRadioStation) => s.id)).toEqual(['r1', 'r2']);
    await expect(load()).resolves.toEqual({ stations });
    expect(isAllowedRadioHost('radio.example')).toBe(true);
  });

  it('replaces the proxy allowlist with the saved hosts', async () => {
    const { save } = setupHandlers();

    await save(null, stations);
    expect(isAllowedRadioHost('radio.example')).toBe(true);

    await save(null, [{ id: 'n', name: 'New', url: 'http://new.example/live', addedAt: 1 }]);
    expect(isAllowedRadioHost('radio.example')).toBe(false);
    expect(isAllowedRadioHost('new.example')).toBe(true);
  });

  it('treats a non-array save as an empty list', async () => {
    const { save, load } = setupHandlers();
    await save(null, stations);

    await expect(save(null, undefined as never)).resolves.toBe(true);
    await expect(load()).resolves.toEqual({ stations: [] });
  });
});
