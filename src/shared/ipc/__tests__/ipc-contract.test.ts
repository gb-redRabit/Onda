import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { INVOKE_CHANNELS, RECEIVE_CHANNELS, SEND_CHANNELS } from '../contract';
import {
  ALLOWED_INVOKE_CHANNELS,
  ALLOWED_RECEIVE_CHANNELS,
  ALLOWED_SEND_CHANNELS
} from '../../../preload/generated';

// Plan 1.5: the contract and the main-process handlers must match in both
// directions. `ipc:gen:check` guards the generated files against the contract;
// this test guards the contract against `ipcMain.handle` in src/main.
const ROOT = process.cwd();
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'out', 'release']);
const HANDLE_RE = /ipcMain\.handle(?:Once)?\(\s*'([^']+)'/g;

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      await walk(join(dir, entry.name), out);
    } else if (/\.ts$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

async function collectHandledChannels(): Promise<Set<string>> {
  const channels = new Set<string>();
  for (const file of await walk(join(ROOT, 'src/main'))) {
    const source = await readFile(file, 'utf-8');
    for (const match of source.matchAll(HANDLE_RE)) channels.add(match[1]);
  }
  return channels;
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort();
}

describe('IPC contract parity (plan 1.5)', () => {
  it('every ipcMain.handle channel is in the contract invoke list', async () => {
    const handled = await collectHandledChannels();
    const invoke = INVOKE_CHANNELS as readonly string[];
    const missing = sorted(handled).filter((channel) => !invoke.includes(channel));
    expect(missing).toEqual([]);
  });

  it('every contract invoke channel has an ipcMain.handle in main', async () => {
    const handled = await collectHandledChannels();
    const orphaned = INVOKE_CHANNELS.filter((channel) => !handled.has(channel));
    expect(orphaned).toEqual([]);
  });

  it('generated allowlists match the contract lists', () => {
    expect(sorted(ALLOWED_INVOKE_CHANNELS)).toEqual(sorted(INVOKE_CHANNELS));
    expect(sorted(ALLOWED_SEND_CHANNELS)).toEqual(sorted(SEND_CHANNELS));
    expect(sorted(ALLOWED_RECEIVE_CHANNELS)).toEqual(sorted(RECEIVE_CHANNELS));
  });
});
