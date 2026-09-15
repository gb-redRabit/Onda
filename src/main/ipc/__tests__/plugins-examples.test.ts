import { describe, it, expect } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { installPluginFromDir, listPluginExamples } from '../plugins-examples';

async function makeExample(dir: string, id: string): Promise<void> {
  await mkdir(join(dir, id), { recursive: true });
  await writeFile(
    join(dir, id, 'manifest.json'),
    JSON.stringify({
      name: 'Demo Plugin',
      version: '1.0.0',
      description: 'demo',
      entry: 'index.js',
      permissions: { notifications: true }
    })
  );
  await writeFile(join(dir, id, 'index.js'), 'api.log.info("demo");');
}

describe('plugins-examples', () => {
  it('lists the bundled examples', async () => {
    const examples = await mkdtemp(join(tmpdir(), 'onda-examples-'));
    try {
      await makeExample(examples, 'demo');
      await mkdir(join(examples, 'not-a-plugin'));
      const list = await listPluginExamples(examples);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        id: 'demo',
        name: 'Demo Plugin',
        version: '1.0.0',
        description: 'demo'
      });
    } finally {
      await rm(examples, { recursive: true, force: true });
    }
  });

  it('is a no-op listing a missing directory', async () => {
    await expect(listPluginExamples(join(tmpdir(), 'onda-no-such-examples'))).resolves.toEqual([]);
  });

  it('installs an example into the plugins directory', async () => {
    const examples = await mkdtemp(join(tmpdir(), 'onda-examples-'));
    const dest = await mkdtemp(join(tmpdir(), 'onda-plugins-'));
    try {
      await makeExample(examples, 'demo');
      const result = await installPluginFromDir(join(examples, 'demo'), dest, 'demo');

      expect(result.success).toBe(true);
      expect(result.installed).toMatchObject({ id: 'demo', name: 'Demo Plugin', enabled: false });
      await expect(readFile(join(dest, 'demo', 'index.js'), 'utf-8')).resolves.toContain('demo');
    } finally {
      await rm(examples, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
    }
  });

  it('rejects an invalid or missing example', async () => {
    const dest = await mkdtemp(join(tmpdir(), 'onda-plugins-'));
    try {
      await expect(installPluginFromDir(join(dest, 'nope'), dest, 'nope')).resolves.toMatchObject({
        success: false
      });
      await expect(installPluginFromDir(dest, dest, 'Bad Id')).resolves.toMatchObject({
        success: false,
        error: 'Invalid plugin id'
      });
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });
});
