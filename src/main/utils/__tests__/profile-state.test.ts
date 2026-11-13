import { describe, it, expect, vi, beforeEach } from 'vitest';
import { access, mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const appState = vi.hoisted(() => ({ path: '', throws: false }));
const rmMock = vi.hoisted(() => ({
  fn: vi.fn(),
  real: null as unknown as (...args: unknown[]) => Promise<void>
}));
vi.mock('electron', () => ({
  app: {
    getPath: () => {
      if (appState.throws) throw new Error('not ready');
      return appState.path;
    }
  }
}));
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  rmMock.real = actual.rm as unknown as (...args: unknown[]) => Promise<void>;
  return { ...actual, rm: (...args: unknown[]) => rmMock.fn(...args) };
});

import {
  RESET_STATE_DIRS,
  RESET_STATE_FILES,
  removeProfileState,
  safeUserDataPath
} from '../profile-state';

beforeEach(() => {
  appState.path = '';
  appState.throws = false;
  rmMock.fn.mockReset().mockImplementation((...args: unknown[]) => rmMock.real(...args));
});

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false
  );
}

describe('removeProfileState', () => {
  it('removes profile state but keeps bin/, the store key and config.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'onda-reset-'));
    try {
      for (const file of RESET_STATE_FILES) {
        await writeFile(join(dir, file), '{}');
      }
      await writeFile(join(dir, 'config.json'), '{}');
      await writeFile(join(dir, 'config.json.bak.1'), '{}');
      await writeFile(join(dir, 'config.json.bak.2'), '{}');
      await writeFile(join(dir, 'onda-store-key'), 'a'.repeat(64));
      await mkdir(join(dir, 'bin'));
      await writeFile(join(dir, 'bin', 'ffmpeg.exe'), 'bin');
      await mkdir(join(dir, 'plugins'));
      await writeFile(join(dir, 'plugins', 'demo.js'), 'plugin');
      await mkdir(join(dir, 'plugins-data'));

      const failed = await removeProfileState(dir, ['config.json.bak.1', 'config.json.bak.2']);

      expect(failed).toEqual([]);
      for (const file of RESET_STATE_FILES) {
        expect(await exists(join(dir, file))).toBe(false);
      }
      expect(await exists(join(dir, 'plugins'))).toBe(false);
      expect(await exists(join(dir, 'plugins-data'))).toBe(false);
      expect(await exists(join(dir, 'config.json.bak.1'))).toBe(false);
      expect(await exists(join(dir, 'config.json.bak.2'))).toBe(false);
      // Zachowane celowo — narzędzia, klucz i (wyczyszczony) plik store'a.
      expect(await exists(join(dir, 'bin', 'ffmpeg.exe'))).toBe(true);
      expect(await exists(join(dir, 'onda-store-key'))).toBe(true);
      expect(await exists(join(dir, 'config.json'))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('is a no-op when the entries do not exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'onda-reset-'));
    try {
      await expect(removeProfileState(dir, ['config.json.bak.1'])).resolves.toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports entries that could not be removed', async () => {
    rmMock.fn.mockRejectedValue(new Error('locked'));

    const failed = await removeProfileState(join(tmpdir(), 'whatever'));

    expect(failed).toHaveLength(RESET_STATE_FILES.length + RESET_STATE_DIRS.length);
  });
});

describe('safeUserDataPath', () => {
  it('returns an absolute userData path', () => {
    appState.path = join(tmpdir(), 'onda-userdata');
    expect(safeUserDataPath()).toBe(appState.path);
  });

  it('rejects empty or relative paths', () => {
    appState.path = '';
    expect(safeUserDataPath()).toBeNull();
    appState.path = 'relative/path';
    expect(safeUserDataPath()).toBeNull();
  });

  it('returns null when electron throws before ready', () => {
    appState.throws = true;
    expect(safeUserDataPath()).toBeNull();
  });
});
