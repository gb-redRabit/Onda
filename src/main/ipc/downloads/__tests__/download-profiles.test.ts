import { beforeEach, describe, expect, it, vi } from 'vitest';
import { join, dirname } from 'node:path';

const h = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  getPath: vi.fn(() => 'C:/user'),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  uuid: vi.fn(() => 'new-id')
}));

vi.mock('electron', () => ({
  app: { getPath: h.getPath },
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => {
      h.handlers.set(channel, handler);
    }
  }
}));
vi.mock('fs/promises', () => ({
  readFile: h.readFile,
  writeFile: h.writeFile,
  mkdir: h.mkdir
}));
vi.mock('crypto', () => ({ randomUUID: h.uuid }));
vi.mock('../../../utils/write-queue', () => ({
  createWriteLock: () => (task: () => Promise<unknown>) => task()
}));

import { registerDownloadProfileHandlers } from '../download-profiles';

const FILE = join('C:/user', 'download-profiles.json');

function profile(id: string, name = id) {
  return { id, name, config: { kind: 'audio' } };
}

function call(channel: string, ...args: unknown[]) {
  return h.handlers.get(channel)!({}, ...args);
}

beforeEach(() => {
  h.handlers.clear();
  h.getPath.mockClear();
  h.readFile.mockReset();
  h.readFile.mockRejectedValue(new Error('ENOENT'));
  h.writeFile.mockReset();
  h.writeFile.mockResolvedValue(undefined);
  h.mkdir.mockReset();
  h.mkdir.mockResolvedValue(undefined);
  h.uuid.mockClear();
  registerDownloadProfileHandlers();
});

describe('registration', () => {
  it('registers the profile channels', () => {
    expect([...h.handlers.keys()]).toEqual(['profiles:list', 'profiles:save', 'profiles:delete']);
  });
});

describe('profiles:list', () => {
  it('returns an empty list when the file is missing or malformed', async () => {
    await expect(call('profiles:list')).resolves.toEqual([]);

    h.readFile.mockResolvedValueOnce('not json');
    await expect(call('profiles:list')).resolves.toEqual([]);

    h.readFile.mockResolvedValueOnce(JSON.stringify({ id: 'nope' }));
    await expect(call('profiles:list')).resolves.toEqual([]);
  });

  it('filters invalid entries and keeps valid profiles', async () => {
    h.readFile.mockResolvedValue(
      JSON.stringify([
        profile('p1'),
        null,
        { id: 'p2' },
        { id: 'p3', name: 'P3' },
        { id: 4, name: 'P4', config: {} },
        { id: 'p5', name: 'P5', config: {} }
      ])
    );

    await expect(call('profiles:list')).resolves.toEqual([
      profile('p1'),
      { id: 'p5', name: 'P5', config: {} }
    ]);
  });
});

describe('profiles:save', () => {
  it('rejects invalid input', async () => {
    for (const input of [
      null,
      {},
      { name: '', config: {} },
      { name: 5, config: {} },
      { name: 'x' }
    ]) {
      await expect(call('profiles:save', input)).resolves.toBeNull();
    }
    expect(h.writeFile).not.toHaveBeenCalled();
  });

  it('creates a profile with a generated id', async () => {
    h.readFile.mockResolvedValue('[]');

    const list = await call('profiles:save', {
      name: '  My profile  ',
      config: { kind: 'video' }
    });

    expect(list).toEqual([{ id: 'new-id', name: 'My profile', config: { kind: 'video' } }]);
    expect(h.uuid).toHaveBeenCalled();
    expect(h.mkdir).toHaveBeenCalledWith(dirname(FILE), { recursive: true });
    expect(h.writeFile).toHaveBeenCalledWith(FILE, JSON.stringify(list, null, 2), 'utf-8');
  });

  it('updates an existing profile', async () => {
    h.readFile.mockResolvedValue(JSON.stringify([profile('p1'), profile('p2')]));

    const list = await call('profiles:save', {
      id: 'p2',
      name: ' Renamed ',
      config: { kind: 'audio', quality: 'high' }
    });

    expect(list).toEqual([
      profile('p1'),
      { id: 'p2', name: 'Renamed', config: { kind: 'audio', quality: 'high' } }
    ]);
    expect(h.writeFile).toHaveBeenCalled();
  });

  it('returns the list untouched for an unknown id', async () => {
    h.readFile.mockResolvedValue(JSON.stringify([profile('p1')]));

    const list = await call('profiles:save', {
      id: 'missing',
      name: 'Name',
      config: {}
    });

    expect(list).toEqual([profile('p1')]);
    expect(h.writeFile).not.toHaveBeenCalled();
  });
});

describe('profiles:delete', () => {
  it('removes the profile and persists the rest', async () => {
    h.readFile.mockResolvedValue(JSON.stringify([profile('p1'), profile('p2')]));

    const list = await call('profiles:delete', 'p1');

    expect(list).toEqual([profile('p2')]);
    expect(h.writeFile).toHaveBeenCalledWith(
      FILE,
      JSON.stringify([profile('p2')], null, 2),
      'utf-8'
    );
  });

  it('persists an unchanged list when the id is unknown', async () => {
    h.readFile.mockResolvedValue(JSON.stringify([profile('p1')]));

    await expect(call('profiles:delete', 'nope')).resolves.toEqual([profile('p1')]);
    expect(h.writeFile).toHaveBeenCalled();
  });
});
