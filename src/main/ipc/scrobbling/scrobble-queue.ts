import { app } from 'electron';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { logger } from '../../../shared/logger';
import type {
  ScrobbleTrack,
  ScrobblingService
} from '../../../shared/types/ipc/channels-scrobbling';

export interface ScrobbleQueueEntry {
  service: ScrobblingService;
  track: ScrobbleTrack;
  queuedAt: number;
}

const MAX_QUEUE = 500;

export function scrobbleQueuePath(): string {
  return join(app.getPath('userData'), 'scrobble-queue.json');
}

// Serializuje read-modify-write, żeby równoległe scrobble nie zgubiły wpisów.
let writeChain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeChain.then(fn, fn);
  writeChain = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export async function loadScrobbleQueue(filePath: string): Promise<ScrobbleQueueEntry[]> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is ScrobbleQueueEntry =>
        !!entry &&
        typeof entry === 'object' &&
        (entry as ScrobbleQueueEntry).service !== undefined &&
        typeof (entry as ScrobbleQueueEntry).queuedAt === 'number' &&
        !!(entry as ScrobbleQueueEntry).track
    );
  } catch {
    return [];
  }
}

async function save(filePath: string, entries: ScrobbleQueueEntry[]): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, JSON.stringify(entries), 'utf-8');
  await rename(tmp, filePath);
}

export function enqueueScrobble(
  filePath: string,
  service: ScrobblingService,
  track: ScrobbleTrack
): Promise<void> {
  return serialize(async () => {
    const entries = await loadScrobbleQueue(filePath);
    entries.push({ service, track, queuedAt: Date.now() });
    if (entries.length > MAX_QUEUE) entries.splice(0, entries.length - MAX_QUEUE);
    await save(filePath, entries);
  });
}

/**
 * Próbuje wysłać wszystkie zakolejkowane scrobble. Wpisy, których `send` nie
 * potwierdzi, zostają na następną próbę.
 */
export function drainScrobbleQueue(
  filePath: string,
  send: (service: ScrobblingService, track: ScrobbleTrack) => Promise<boolean>
): Promise<void> {
  return serialize(async () => {
    const entries = await loadScrobbleQueue(filePath);
    if (entries.length === 0) return;
    const failed: ScrobbleQueueEntry[] = [];
    for (const entry of entries) {
      try {
        if (!(await send(entry.service, entry.track))) failed.push(entry);
      } catch {
        failed.push(entry);
      }
    }
    await save(filePath, failed);
    if (failed.length > 0) {
      logger.warn('scrobbling', `queue still has ${failed.length} pending scrobble(s)`);
    }
  });
}
