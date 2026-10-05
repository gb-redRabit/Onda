import { app } from 'electron';
import { join } from 'path';
import { logger } from '../../shared/logger';
import { type Job } from './download-helpers';
import { loadSources } from '../ipc/sources/sources-store';
import { loadPersistedJobs, queueFilePath } from './download-queue-store';
import { jobs, queueOrder } from './download-state';
import { pump } from './download-runner';

// Przywracanie kolejki po restarcie i rozwiązywanie zaufania do sieci prywatnej,
// wyodrębnione z `download-actions.ts`.

/**
 * Źródła, którym użytkownik jawnie przyznał dostęp do sieci prywatnej, w postaci
 * mapy `id → origin` (z zapisanego `baseUrl`). `yt:download:add` przyjmuje
 * `source` wprost z renderera, więc flaga `allowPrivateNetwork` MUSI wynikać z
 * ZAPISANEGO rekordu (jak w `sources:enqueue`) i pasować do jego originu — sam
 * `sourceId` pozwalał sparować zaufane źródło z dowolnym adresem loopback/LAN.
 * Origin bierzemy ze źródła, nie z żądania, więc przejęty renderer nie sięgnie
 * innych prywatnych celów (loopback, 169.254.169.254).
 */
export async function trustedPrivateNetworkOrigins(): Promise<Map<string, string>> {
  const trusted = new Map<string, string>();
  try {
    const list = await loadSources(join(app.getPath('userData'), 'sources.json'));
    for (const s of list) {
      if (s.allowPrivateNetwork !== true || !s.baseUrl) continue;
      try {
        trusted.set(s.id, new URL(s.baseUrl).origin);
      } catch {
        // nieprawidłowy baseUrl nie przyznaje niczego
      }
    }
  } catch (e) {
    logger.warn('downloads', 'could not read sources for private-network trust', e);
  }
  return trusted;
}

// Przywraca kolejkę z dysku po restarcie. Przerwane pobrania stają się
// wstrzymane (nigdy ukończone), aby użytkownik mógł je wznowić przez `--continue`;
// zadania oczekujące są ponownie kolejkowane i pompowane.
export async function restoreDownloadQueue(): Promise<void> {
  const persisted = await loadPersistedJobs(queueFilePath());
  for (const task of persisted) {
    let status = task.status;
    if (status === 'completed' || status === 'cancelled') continue;
    if (status === 'downloading') status = 'paused';
    const job: Job = {
      ...task,
      status,
      progress: 0,
      speed: '',
      eta: '',
      completedAt: undefined,
      error: status === 'paused' ? undefined : task.error
    };
    jobs.set(job.id, job);
    if (job.status === 'pending') queueOrder.push(job.id);
  }
  if (persisted.length) logger.info('downloads', `restored ${persisted.length} queued jobs`);
  void pump();
}
