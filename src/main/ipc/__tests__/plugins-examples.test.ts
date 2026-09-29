import { describe, it, expect } from 'vitest';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import vm from 'node:vm';
import { installPluginFromDir, listPluginExamples } from '../plugins-examples';
import { isPluginUiSlot } from '../../../shared/plugin-ui-slots';

async function makeExample(dir: string, id: string): Promise<void> {
  await mkdir(join(dir, id), { recursive: true });
  await writeFile(
    join(dir, id, 'manifest.json'),
    JSON.stringify({
      name: 'Demo Plugin',
      version: '1.0.0',
      description: 'demo',
      entry: 'index.js',
      permissions: { notifications: true, network: { allow: ['https://api.example/*'] } },
      hooks: ['track:play']
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
        description: 'demo',
        permissions: { notifications: true, network: { allow: ['https://api.example/*'] } },
        hooks: ['track:play']
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
      expect(result.installed).toMatchObject({
        id: 'demo',
        name: 'Demo Plugin',
        enabled: false,
        capabilityHash: expect.stringMatching(/^[a-f0-9]{64}$/)
      });
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

  it('every bundled example parses and declares only host-known slots', async () => {
    const examples = await listPluginExamples(
      resolve(__dirname, '../../../../resources/plugins-examples')
    );
    const ids = examples.map((e) => e.id).sort();
    expect(ids).toEqual(expect.arrayContaining(['hello', 'triangle', 'progress-slot']));
    for (const example of examples) {
      for (const slot of example.uiSlots ?? []) {
        expect(isPluginUiSlot(slot)).toBe(true);
        expect(example.permissions.visual).toBe(true);
      }
    }
    expect(examples.find((e) => e.id === 'progress-slot')?.uiSlots).toEqual(['audio-view']);
  });

  it('ships the documented example set, all with a valid entry file', async () => {
    const dir = resolve(__dirname, '../../../../resources/plugins-examples');
    const examples = await listPluginExamples(dir);
    expect(examples.map((e) => e.id).sort()).toEqual([
      'auto-fade',
      'focus-mode',
      'hello',
      'listen-history',
      'metadata-lookup',
      'note-readout',
      'progress-slot',
      'sleep-timer',
      'smart-queue',
      'track-actions',
      'triangle',
      'vu-meter'
    ]);
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const code = await readFile(join(dir, entry.name, 'index.js'), 'utf-8');
      // A syntax error in an example would only surface when a user installs it.
      expect(() => new vm.Script(code, { filename: `${entry.name}/index.js` })).not.toThrow();
      // console.log from a worker never reaches the app — the Logs tab uses api.log.
      expect(code).not.toMatch(/console\s*\.\s*log/);
      expect(code).toContain('api.');
    }
  });

  it('keeps the network allowlist of examples limited to what they document', async () => {
    const dir = resolve(__dirname, '../../../../resources/plugins-examples');
    const examples = await listPluginExamples(dir);
    const withNetwork = examples
      .filter((example) => (example.permissions.network?.allow ?? []).length > 0)
      .map((example) => example.id)
      .sort();
    // Only the two lookup-style examples talk to the network, both over HTTPS.
    expect(withNetwork).toEqual(['hello', 'metadata-lookup']);
    for (const example of examples) {
      for (const pattern of example.permissions.network?.allow ?? []) {
        expect(pattern.startsWith('https://')).toBe(true);
        expect(pattern.endsWith('/*')).toBe(true);
      }
    }
  });
});
