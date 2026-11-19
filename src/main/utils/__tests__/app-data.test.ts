import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const state = vi.hoisted(() => ({ root: '', mode: 'ok' as 'ok' | 'throw' | 'empty' }));

vi.mock('electron', () => ({
  app: {
    getPath: () => {
      if (state.mode === 'throw') throw new Error('no electron');
      if (state.mode === 'empty') return '';
      return state.root;
    }
  }
}));

import { isProtectedAppDataPath, userDataRoot } from '../app-data';

const root = join(tmpdir(), 'onda-app-data-policy');

describe('isProtectedAppDataPath', () => {
  it('protects the userData root and everything below it', () => {
    state.root = root;
    state.mode = 'ok';

    expect(userDataRoot()).toBe(root);
    expect(isProtectedAppDataPath(root)).toBe(true);
    expect(isProtectedAppDataPath(join(root, 'bin', 'ffmpeg.exe'))).toBe(true);
    expect(isProtectedAppDataPath(join(root, 'plugins', 'demo', 'index.js'))).toBe(true);
    expect(isProtectedAppDataPath(join(root, 'config.json'))).toBe(true);
  });

  it('does not protect sibling directories with a shared prefix', () => {
    state.root = root;

    expect(isProtectedAppDataPath(`${root}2/bin`)).toBe(false);
    expect(isProtectedAppDataPath(join(tmpdir(), 'elsewhere', 'file.mp3'))).toBe(false);
    expect(isProtectedAppDataPath('relative/path')).toBe(false);
    expect(isProtectedAppDataPath(null)).toBe(false);
  });

  it('fails open when the path is unavailable', () => {
    state.mode = 'throw';
    expect(userDataRoot()).toBeNull();
    expect(isProtectedAppDataPath(join(root, 'bin'))).toBe(false);

    state.mode = 'empty';
    expect(userDataRoot()).toBeNull();
    expect(isProtectedAppDataPath(join(root, 'bin'))).toBe(false);
  });
});

afterEach(() => {
  state.mode = 'ok';
  state.root = '';
});
