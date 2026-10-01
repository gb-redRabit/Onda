import type { IpcDownloadTask } from '../../shared/types/ipc';
import { snapshotDownloadTask } from './download-snapshot';
import { capPersistedJobs, persistJobs, queueFilePath } from './download-queue-store';
import type { Job } from './download-helpers';

// Stan kolejki pobierania w pamięci + trwałość, wyodrębniony z
// `download-manager.ts` (plan 2.8). Inne moduły pobierania współdzielą ten stan.

export const jobs = new Map<string, Job>();
export const queueOrder: string[] = [];

// Wstrzymanie zaplanowanego startu: dopóki `until` jest w przyszłości, pump() nie
// uruchamia nowych zadań. Już działające pobrania pozostają nienaruszone.
export const hold = { until: 0 };

export const PERSISTABLE_STATUSES = new Set(['pending', 'paused', 'downloading', 'error']);

const knownStatuses = new Map<string, string>();
export const jobAbortControllers = new Map<string, AbortController>();

let emit: ((task: IpcDownloadTask) => void) | null = null;
let queuePersistTimer: ReturnType<typeof setTimeout> | null = null;

export function setDownloadEmit(cb: ((task: IpcDownloadTask) => void) | null): void {
  emit = cb;
}

export function collectPersistableJobs(): IpcDownloadTask[] {
  return capPersistedJobs(
    [...jobs.values()].map(snapshotDownloadTask).filter((j) => PERSISTABLE_STATUSES.has(j.status))
  );
}

export function markQueueDirty(): void {
  if (queuePersistTimer) return;
  queuePersistTimer = setTimeout(() => {
    queuePersistTimer = null;
    void persistJobs(queueFilePath(), collectPersistableJobs());
  }, 400);
}

// Natychmiast zapisuje kolejkę na dysk, anulując ewentualny oczekujący debounce.
// Wywoływane przy zamykaniu aplikacji, aby nie utracić ostatnich ~0,5s zmian statusu.
export function flushQueueNow(): void {
  if (queuePersistTimer) {
    clearTimeout(queuePersistTimer);
    queuePersistTimer = null;
  }
  void persistJobs(queueFilePath(), collectPersistableJobs());
}

/**
 * Publikuje postęp/status zadania do renderera i kolejki na dysku.
 *
 * Obiekt w `jobs` jest modyfikowany W MIEJSCU, a nie zastępowany. Działające
 * pobieranie trzyma własną referencję do zadania (i ustawia na nim `job.child`),
 * więc podmiana wpisu w mapie na świeżą kopię pozostawiała runner piszący do obiektu,
 * którego reszta aplikacji już nie widziała — `cancel`/`pause` nie znajdowały wtedy
 * procesu potomnego, a `finally` w runJob ponownie zapisywał nieaktualną kopię,
 * cofając anulowanie.
 */
export function persist(job: Job): void {
  const copy = snapshotDownloadTask(job);
  const prev = knownStatuses.get(job.id);
  const tracked = jobs.get(job.id);
  if (tracked) {
    // `child` to stan procesu, nie pole IPC, więc snapshot go pomija.
    // Przenieś go jawnie: przypisanie pól wywołującego w przeciwnym razie
    // wyczyściłoby dziecko, o którym wie tylko śledzony obiekt.
    const child = tracked.child ?? job.child;
    Object.assign(tracked, job, copy);
    tracked.child = child;
  } else {
    // Zadanie zostało utworzone poza kolejką (np. bezpośrednie wywołanie runnera);
    // przyjmij je pod jego własnym id, aby późniejsze wyszukiwania widziały ten sam obiekt.
    jobs.set(job.id, Object.assign(job, copy));
  }
  // Zapisuje na dysk tylko przy zmianach statusu (tyknięcia postępu nie zmieniają
  // statusu i nie mogą szarpać magazynu kolejki).
  if (prev !== copy.status) {
    knownStatuses.set(job.id, copy.status);
    markQueueDirty();
  }
  emit?.(copy);
}

/** Usuwa memo statusu zadania, aby następny persist ponownie wyzwolił zapis. */
export function forgetJob(id: string): void {
  knownStatuses.delete(id);
  jobAbortControllers.delete(id);
}

type DownloadCompletedHandler = (channelId: string, videoId: string) => void;
let onDownloadCompleted: DownloadCompletedHandler | null = null;

// Wywoływane, gdy ukończone pobieranie niesie zadanie źródła mediów (sourceId +
// sourceItemId). Warstwa źródeł zapisuje element jako pobrany, aby widok Sources
// mógł go oznaczyć przy następnym pobraniu.
type SourceItemDownloadedHandler = (sourceId: string, itemId: string) => void;
let onSourceItemDownloaded: SourceItemDownloadedHandler | null = null;

// Wywoływane, gdy zadanie kończy się sukcesem i niesie id kanału+wideo.
// Warstwa subskrypcji używa tego do atomowego powiększania downloadedVideoIds (aby
// ukończone pobrania nigdy nie ginęły i były zapisywane nawet, jeśli stan renderera
// był nieaktualny w chwili ukończenia).
export function setDownloadCompletedHandler(cb: DownloadCompletedHandler | null): void {
  onDownloadCompleted = cb;
}

export function setSourceItemDownloadedHandler(cb: SourceItemDownloadedHandler | null): void {
  onSourceItemDownloaded = cb;
}

export function reportCompleted(job: Job): void {
  try {
    if (job.channelId && job.videoId) onDownloadCompleted?.(job.channelId, job.videoId);
  } catch {
    // Niekrytyczne: następne sprawdzenie ponownie zakolejkowałoby wideo.
  }
  try {
    const sourceId = job.source?.sourceId;
    const itemId = job.source?.sourceItemId;
    if (sourceId && itemId) onSourceItemDownloaded?.(sourceId, itemId);
  } catch {
    // Niekrytyczne: późniejsze pobranie i tak odczyta to, co zostało już zapisane.
  }
}
