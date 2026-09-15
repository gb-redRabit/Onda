import { describe, it, expect } from 'vitest';
import { access, mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { RESET_STATE_FILES, removeProfileState } from '../profile-state';

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
      // Kept on purpose — tooling, key and the (cleared) store file.
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
});
