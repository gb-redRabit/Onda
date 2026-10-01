import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { logger } from '../../../shared/logger';

// Trwały zapis elementów źródeł (po ich `id` API), których pobieranie zakończyło się
// sukcesem. Trzymany poza szyfrowanym store ustawień i poza
// `sources.json` (ten plik to konfiguracja; to jest stan runtime). Kluczowany per
// źródło, bo ten sam id API może wystąpić w więcej niż jednym źródle.

export interface DownloadedSourceItems {
  version: 1;
  bySource: Record<string, string[]>;
}

// Serializuje dostęp read-modify-write, aby dwa pobrania kończące się w tym samym
// czasie nie zgubiły nawzajem swoich id.
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
    // Brakujący lub uszkodzony plik — traktowany jako "nic jeszcze nie pobrano".
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

// Dopisuje jedno ukończone id elementu do listy pobranych źródła. Idempotentne.
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
