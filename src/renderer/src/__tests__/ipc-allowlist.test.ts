import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

// Guards IPC drift without touching the contract itself yet: every channel the
// renderer invokes literally must be present in the preload invoke allowlist,
// otherwise the call is blocked at runtime with only a console warning.
// The allowlist is generated from the contract (`npm run ipc:gen`).
const ROOT = process.cwd();

const IGNORED_DIRS = new Set(['node_modules', 'dist', 'out', 'release']);

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      await walk(join(dir, entry.name), out);
    } else if (/\.(ts|vue)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

function extractInvokeAllowlist(preloadSource: string): Set<string> {
  const start = preloadSource.indexOf('const ALLOWED_INVOKE_CHANNELS');
  if (start < 0) throw new Error('ALLOWED_INVOKE_CHANNELS not found in preload');
  const open = preloadSource.indexOf('[', start);
  const close = preloadSource.indexOf(']);', open);
  const body = preloadSource.slice(open, close < 0 ? undefined : close);
  const channels = new Set<string>();
  for (const match of body.matchAll(/'([^']+)'/g)) channels.add(match[1]);
  return channels;
}

function extractInvokedChannels(source: string): string[] {
  const channels: string[] = [];
  for (const match of source.matchAll(/\binvoke\(\s*'([^']+)'/g)) channels.push(match[1]);
  for (const match of source.matchAll(/\binvoke\(\s*"([^"]+)"/g)) channels.push(match[1]);
  return channels;
}

describe('IPC invoke allowlist parity', () => {
  it('every literally-invoked renderer channel is allowlisted in the preload', async () => {
    const preloadSource = await readFile(join(ROOT, 'src/preload/generated.ts'), 'utf-8');
    const allowlist = extractInvokeAllowlist(preloadSource);

    const rendererFiles = await walk(join(ROOT, 'src/renderer'));
    const offenders: string[] = [];
    for (const file of rendererFiles) {
      const source = await readFile(file, 'utf-8');
      for (const channel of extractInvokedChannels(source)) {
        if (!allowlist.has(channel)) {
          offenders.push(`${file.replace(/\\/g, '/')} → ${channel}`);
        }
      }
    }

    expect(offenders.sort()).toEqual([]);
  });
});
