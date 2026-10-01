import { app } from 'electron';
import { join } from 'path';
import {
  resolveBinary,
  type BinTool,
  type ResolvedBinary
} from './ipc/dependency/dependency-utils';

let cachedDir: string | null = null;

export function getBinDir(): string {
  if (!cachedDir) cachedDir = join(app.getPath('userData'), 'bin');
  return cachedDir;
}

const cache = new Map<BinTool, ResolvedBinary | null>();

// Rozwiązuje binarium (najpierw zarządzane userData/bin, potem PATH), cache per proces.
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

// Musi być wywołane po każdej instalacji / aktualizacji / usunięciu, aby cache pozostał świeży.
export function invalidateBinaries(): void {
  cache.clear();
}
