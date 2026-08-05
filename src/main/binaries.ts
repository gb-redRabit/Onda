import { app } from 'electron';
import { join } from 'path';
import { resolveBinary, type BinTool, type ResolvedBinary } from './ipc/dependency-utils';

let cachedDir: string | null = null;

export function getBinDir(): string {
  if (!cachedDir) cachedDir = join(app.getPath('userData'), 'bin');
  return cachedDir;
}

const cache = new Map<BinTool, ResolvedBinary | null>();

// Resolve a binary (managed userData/bin first, then PATH), cached per process.
export async function resolveBin(tool: BinTool): Promise<string | null> {
  if (cache.has(tool)) {
    return cache.get(tool)?.path ?? null;
  }
  const res = await resolveBinary(getBinDir(), tool);
  cache.set(tool, res);
  return res?.path ?? null;
}

export async function resolveBinInfo(tool: BinTool): Promise<ResolvedBinary | null> {
  if (cache.has(tool)) {
    return cache.get(tool) ?? null;
  }
  const res = await resolveBinary(getBinDir(), tool);
  cache.set(tool, res);
  return res;
}

// Must be called after any install / update / remove so the cache stays fresh.
export function invalidateBinaries(): void {
  cache.clear();
}
