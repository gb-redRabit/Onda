import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { logger } from '../../../shared/logger';

// Persistent record of source items (by their API `id`) whose download finished
// successfully. Kept out of the encrypted settings store and out of
// `sources.json` (that file is configuration; this is runtime state). Keyed per
// source because the same API id can appear in more than one source.

export interface DownloadedSourceItems {
  version: 1;
  bySource: Record<string, string[]>;
}

// Serializes read-modify-write access so two downloads that finish at the same
// time cannot lose each other's id.
let writeChain: Promise<void> = Promise.resolve();
function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeChain.then(fn);
  writeChain = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function read(filePath: string): Promise<DownloadedSourceItems> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed) && isRecord(parsed.bySource)) {
      const bySource: Record<string, string[]> = {};
      for (const [sourceId, ids] of Object.entries(parsed.bySource)) {
        if (Array.isArray(ids)) {
          bySource[sourceId] = ids.filter((id): id is string => typeof id === 'string' && !!id);
        }
      }
      return { version: 1, bySource };
    }
  } catch {
    // Missing or corrupt file — treated as "nothing downloaded yet".
  }
  return { version: 1, bySource: {} };
}

async function write(filePath: string, data: DownloadedSourceItems): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function getDownloadedForSource(
  filePath: string,
  sourceId: string
): Promise<string[]> {
  if (!sourceId) return [];
  const data = await read(filePath);
  return data.bySource[sourceId] || [];
}

// Appends one completed item id to a source's downloaded list. Idempotent.
export function appendDownloadedItem(
  filePath: string,
  sourceId: string,
  itemId: string
): Promise<void> {
  return withWriteLock(async () => {
    if (!sourceId || !itemId) return;
    const data = await read(filePath);
    const known = new Set(data.bySource[sourceId] || []);
    if (known.has(itemId)) return;
    known.add(itemId);
    data.bySource[sourceId] = [...known];
    await write(filePath, data);
    logger.info('sources', `marked downloaded sourceId=${sourceId} itemId=${itemId}`);
  });
}
