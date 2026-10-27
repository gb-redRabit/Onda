import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { logger } from '../../shared/logger';

export type WindowMode = 'main' | 'compact';

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CompactState {
  mode: WindowMode;
  bounds?: WindowBounds;
  alwaysOnTop?: boolean;
  /** Jednorazowo przywróć sesję przy starcie po automatycznym restarcie trybu. */
  restoreSessionOnce?: boolean;
}

const DEFAULT_STATE: CompactState = { mode: 'main' };
let state: CompactState | null = null;
let writeLock: Promise<void> | null = null;

function stateFile(): string {
  return join(app.getPath('userData'), 'compact-window-state.json');
}

function isMode(value: unknown): value is WindowMode {
  return value === 'main' || value === 'compact';
}

function validBounds(value: unknown): WindowBounds | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const b = value as Record<string, unknown>;
  const x = Number(b.x);
  const y = Number(b.y);
  const width = Number(b.width);
  const height = Number(b.height);
  if (![x, y, width, height].every(Number.isFinite)) return undefined;
  if (width < 360 || height < 520) return undefined;
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height)
  };
}

export async function loadCompactState(): Promise<CompactState> {
  if (state) return state;
  try {
    const parsed = JSON.parse(await readFile(stateFile(), 'utf-8')) as Record<string, unknown>;
    state = {
      mode: isMode(parsed.mode) ? parsed.mode : 'main',
      ...(validBounds(parsed.bounds) ? { bounds: validBounds(parsed.bounds) } : {}),
      ...(typeof parsed.alwaysOnTop === 'boolean' ? { alwaysOnTop: parsed.alwaysOnTop } : {}),
      ...(parsed.restoreSessionOnce === true ? { restoreSessionOnce: true } : {})
    };
  } catch {
    state = { ...DEFAULT_STATE };
  }
  return state;
}

export function compactStateSync(): CompactState {
  return state ?? { ...DEFAULT_STATE };
}

export async function saveCompactState(patch: Partial<CompactState>): Promise<void> {
  const current = await loadCompactState();
  const next: CompactState = {
    ...current,
    ...patch,
    ...(patch.bounds !== undefined ? { bounds: validBounds(patch.bounds) } : {})
  };
  while (writeLock) await writeLock;
  let release: () => void;
  writeLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await mkdir(dirname(stateFile()), { recursive: true });
    await writeFile(stateFile(), JSON.stringify(next), 'utf-8');
    state = next;
  } catch (error) {
    logger.warn('compact', 'saving compact state failed', error);
  } finally {
    writeLock = null;
    release!();
  }
}
