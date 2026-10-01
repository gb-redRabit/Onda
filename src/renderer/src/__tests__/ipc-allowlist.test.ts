import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

// Chroni przed dryfem IPC, jeszcze nie ruszając samego kontraktu: każdy kanał,
// który renderer wywołuje dosłownie, musi być obecny na allowliście invoke preloadu,
// inaczej wywołanie jest blokowane w czasie działania zaledwie ostrzeżeniem w konsoli.
// Allowlista jest generowana z kontraktu (`npm run ipc:gen`).
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
    for (let start = 0; start < rendererFiles.length; start += 32) {
      const sources = await Promise.all(
        rendererFiles.slice(start, start + 32).map(async (file) => ({
          file,
          source: await readFile(file, 'utf-8')
        }))
      );
      for (const { file, source } of sources) {
        for (const channel of extractInvokedChannels(source)) {
          if (!allowlist.has(channel)) {
            offenders.push(`${file.replace(/\\/g, '/')} → ${channel}`);
          }
        }
      }
    }

    expect(offenders.sort()).toEqual([]);
  }, 15_000);
});
