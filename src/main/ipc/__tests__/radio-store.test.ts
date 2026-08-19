import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { IpcRadioStation } from '../../../shared/types/ipc';
import { loadRadioData, persistRadio, isAllowedRadioHost } from '../radio-store';

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'onda-radio-test-'));
  file = join(dir, 'radios.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const stations: IpcRadioStation[] = [
  { id: 'r1', name: 'Test FM', url: 'http://radio.example:8000/stream', addedAt: 1 },
  { id: 'r2', name: 'Rock FM', url: 'https://rock.example/stream.mp3', addedAt: 2 }
];

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
    expect(isAllowedRadioHost('rock.example')).toBe(true);
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
});