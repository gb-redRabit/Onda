import { app } from 'electron';
import { join, dirname } from 'path';
import { readFile, writeFile, rename, mkdir } from 'fs/promises';
import type { IpcDownloadTask } from '../../shared/types/ipc';
import { logger } from '../../shared/logger';

const SCHEMA_VERSION = 1;
// Upper bound on persisted jobs so the store cannot grow without limit. Pending
// and paused work is kept before error history is trimmed.
const MAX_JOBS = 500;

interface PersistedQueue {
  version: number;
  jobs: IpcDownloadTask[];
}

export function queueFilePath(): string {
  return join(app.getPath('userData'), 'downloads-queue.json');
}

export async function loadPersistedJobs(filePath: string): Promise<IpcDownloadTask[]> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PersistedQueue>;
    if (!parsed || parsed.version !== SCHEMA_VERSION || !Array.isArray(parsed.jobs)) return [];
    return parsed.jobs.filter(
      (j): j is IpcDownloadTask => !!j && typeof j.id === 'string' && typeof j.url === 'string'
    );
  } catch {
    return [];
  }
}

let writeChain: Promise<void> = Promise.resolve();

// Serializes writes and swaps the file in atomically (temp file + rename) so a
// crash mid-write never leaves a half-written queue.
export function persistJobs(filePath: string, jobs: IpcDownloadTask[]): Promise<void> {
  const data: PersistedQueue = { version: SCHEMA_VERSION, jobs };
  writeChain = writeChain.then(async () => {
    await mkdir(dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    await writeFile(tmp, JSON.stringify(data), 'utf-8');
    await rename(tmp, filePath);
  });
  writeChain = writeChain.catch((e) => {
    logger.warn('downloads', 'failed to persist download queue', e);
  });
  return writeChain;
}

export function capPersistedJobs(jobs: IpcDownloadTask[]): IpcDownloadTask[] {
  if (jobs.length <= MAX_JOBS) return jobs;
  const active = jobs.filter((j) => j.status !== 'error');
  const errors = jobs.filter((j) => j.status === 'error');
  const activeSlots = Math.min(active.length, MAX_JOBS);
  const keptActive = active.slice(0, activeSlots);
  const keptErrors = errors.slice(0, Math.max(0, MAX_JOBS - keptActive.length));
  return [...keptActive, ...keptErrors];
}
