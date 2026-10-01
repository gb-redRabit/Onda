import { randomUUID } from 'crypto';
import { logger } from '../../shared/logger';
import type { IpcDownloadJobInput, IpcDownloadTask } from '../../shared/types/ipc';
import { type Job } from './download-helpers';
import { snapshotDownloadTask } from './download-snapshot';
import { normalizeCoverSpec } from './cover-spec';
import { buildJobSource } from './download-source';
import { resolveProvider } from '../../shared/provider';
import { isSafeAbsolutePath } from '../utils/validate';
import { loadPersistedJobs, queueFilePath } from './download-queue-store';
import {
  jobs,
  queueOrder,
  jobAbortControllers,
  collectPersistableJobs,
  forgetJob,
  markQueueDirty,
  persist
} from './download-state';
import { pump } from './download-runner';
import { killDownloadProcess } from './kill-download-process';

// Mutacje kolejki (add/cancel/pause/resume/move/list/import/export/clear) i
// przywracanie kolejki, wyodrębnione z `download-manager.ts` (plan 2.8).

/**
 * Usuwa id zadania z kolejki oczekujących.
 *
 * `indexOf` zwraca -1, gdy id nie jest w kolejce, a `splice(-1, 1)` usuwa
 * OSTATNI element — więc cancel/pause zadania spoza kolejki po cichu usuwał
 * niezwiązane pobieranie z kolejki.
 */
function removeFromQueue(id: string): void {
  const idx = queueOrder.indexOf(id);
  if (idx >= 0) queueOrder.splice(idx, 1);
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

export async function addDownloadJobs(inputs: IpcDownloadJobInput[]): Promise<IpcDownloadTask[]> {
  const created: IpcDownloadTask[] = [];
  let replaced = 0;
  // Deduplikacja po ID wideo względem już zakolejkowanych/ukończonych zadań, aby to samo
  // wideo nie trafiło do kolejki dwa razy w jednej sesji. Zadania zakończone błędem/anulowane
  // NIE blokują nowej próby — są zastępowane poniżej, więc ponowienie daje jedno świeże
  // zadanie zamiast piętrzyć duplikaty (co też powodowało, że późniejsze ponowienia po cichu
  // były pomijane, gdy duplikat był aktywny).
  const knownVideoIds = new Set<string>();
  for (const j of jobs.values()) {
    if (j.videoId && j.status !== 'error' && j.status !== 'cancelled') {
      knownVideoIds.add(j.videoId);
    }
  }
  for (const input of inputs) {
    if (!input || !input.url) continue;
    const isHttpSource = input.source?.mode === 'http' || input.source?.mode === 'soundcloud';
    // Źródła generyczne (mega/cda/vk/drive) jawnie żądają yt-dlp — pomijamy
    // gate providera przeznaczony dla klasycznej ścieżki YouTube.
    const isExplicitYtdlp = input.source?.mode === 'ytdlp';
    if (!isHttpSource && !isExplicitYtdlp && !resolveProvider(input.url)) continue;
    if (input.videoId && knownVideoIds.has(input.videoId)) continue;
    if (input.videoId) {
      // Ponowne zakolejkowanie to retry poprzedniej próby: usuń każde zakończone błędem
      // lub anulowane zadanie dla tego samego wideo, aby kolejka trzymała jedno zadanie na wideo.
      for (const [id, j] of [...jobs.entries()]) {
        if (j.videoId !== input.videoId) continue;
        if (j.status !== 'error' && j.status !== 'cancelled') continue;
        removeFromQueue(id);
        forgetJob(id);
        jobs.delete(id);
        replaced++;
      }
      knownVideoIds.add(input.videoId);
    }
    // Pola wspólne dla każdego trybu źródła. Kiedyś były gubione, gdy obiekt source
    // był odbudowywany pole po polu: bez `sourceId`/`sourceItemId` ukończone pobieranie
    // ze źródła nigdy nie mogło zostać zapisane jako "downloaded", a bez
    // `allowPrivateNetwork` zaufanie do sieci prywatnej przyznane przez warstwę źródeł
    // było tracone przed uruchomieniem próby.
    const source = buildJobSource(input.source);
    const cover = normalizeCoverSpec(input.cover);
    // Pobierania z bezpośredniego URL nie mają kroku miniatury yt-dlp — odrzuć covery typu thumbnail.
    const finalCover = source && cover?.type === 'thumbnail' ? undefined : cover;
    const now = Date.now();
    const job: Job = {
      id: randomUUID(),
      url: input.url,
      title: input.title || input.url,
      thumbnail: input.thumbnail,
      kind: input.kind === 'video' ? 'video' : 'audio',
      format: input.format || 'mp3',
      quality: input.quality || 'best',
      outputDir:
        typeof input.outputDir === 'string' && isSafeAbsolutePath(input.outputDir)
          ? input.outputDir
          : '',
      filenameTemplate: input.filenameTemplate || '{title} - {artist}',
      progress: 0,
      speed: '',
      eta: '',
      status: 'pending',
      startedAt: now,
      videoId: input.videoId,
      channelId: input.channelId,
      channelTitle: input.channelTitle,
      playlistTitle: input.playlistTitle,
      cover: finalCover,
      coverStatus: 'none',
      metaOverride: input.metaOverride,
      subsLangs: input.subsLangs,
      subsFormat:
        input.subsFormat === 'vtt' || input.subsFormat === 'ass' ? input.subsFormat : 'srt',
      subsMode: input.subsMode === 'manual' || input.subsMode === 'auto' ? input.subsMode : 'best',
      subsFolder: !!input.subsFolder,
      subtitleStatus: 'none',
      audioQuality: input.audioQuality,
      audioLanguage: typeof input.audioLanguage === 'string' ? input.audioLanguage : undefined,
      videoContainer:
        input.videoContainer === 'mkv' || input.videoContainer === 'webm'
          ? input.videoContainer
          : 'mp4',
      sponsorBlock:
        input.sponsorBlock === 'mark' || input.sponsorBlock === 'remove'
          ? input.sponsorBlock
          : 'off',
      trimStart:
        typeof input.trimStart === 'number' && input.trimStart >= 0 ? input.trimStart : undefined,
      trimEnd: typeof input.trimEnd === 'number' && input.trimEnd > 0 ? input.trimEnd : undefined,
      addToLibrary: !!input.addToLibrary,
      source
    };
    jobs.set(job.id, job);
    if (job.status === 'pending') queueOrder.push(job.id);
    created.push(snapshotDownloadTask(job));
  }
  if (created.length || replaced) markQueueDirty();
  void pump();
  return created;
}

export function cancelDownloadJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job) return false;
  if (job.status === 'pending') {
    removeFromQueue(id);
    job.status = 'cancelled';
    persist(job);
    return true;
  }
  if (job.status === 'paused') {
    job.status = 'cancelled';
    persist(job);
    return true;
  }
  if (job.status === 'downloading' && job.child) {
    job.status = 'cancelled';
    persist(job);
    killDownloadProcess(job.child);
    return true;
  }
  // Zadania w trybie HTTP nie mają procesu potomnego — anuluj przez AbortController.
  if (job.status === 'downloading' && !job.child) {
    const ac = jobAbortControllers.get(id);
    if (ac) {
      job.status = 'cancelled';
      persist(job);
      ac.abort();
      return true;
    }
  }
  return false;
}

export function pauseDownloadJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job) return false;
  if (job.status === 'pending') {
    removeFromQueue(id);
    job.status = 'paused';
    persist(job);
    return true;
  }
  if (job.status === 'downloading' && job.child) {
    job.status = 'paused';
    persist(job);
    try {
      killDownloadProcess(job.child);
    } catch {
      /* już nie istnieje */
    }
    return true;
  }
  // Zadania w trybie HTTP — anuluj strumień przez AbortController.
  if (job.status === 'downloading' && !job.child) {
    const ac = jobAbortControllers.get(id);
    if (ac) {
      job.status = 'paused';
      persist(job);
      ac.abort();
      return true;
    }
  }
  return false;
}

export function resumeDownloadJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job || job.status !== 'paused') return false;
  job.status = 'pending';
  job.error = undefined;
  persist(job);
  queueOrder.push(id);
  void pump();
  return true;
}

// Wstrzymuje całą kolejkę: zadania oczekujące opuszczają kolejkę, aktywne pobrania są
// zabijane (ich pliki `.part` są później wznawiane przez `--continue`).
export function pauseAllDownloads(): boolean {
  let changed = false;
  queueOrder.length = 0;
  for (const job of jobs.values()) {
    if (job.status === 'pending') {
      job.status = 'paused';
      persist(job);
      changed = true;
    } else if (job.status === 'downloading') {
      job.status = 'paused';
      persist(job);
      killDownloadProcess(job.child);
      changed = true;
    }
  }
  return changed;
}

// Wznawia każde wstrzymane zadanie i ponownie pompuje kolejkę.
export function resumeAllDownloads(): boolean {
  let changed = false;
  for (const job of jobs.values()) {
    if (job.status === 'paused') {
      job.status = 'pending';
      job.error = undefined;
      persist(job);
      queueOrder.push(job.id);
      changed = true;
    }
  }
  if (changed) void pump();
  return changed;
}

// Przenosi oczekujące zadanie na początek kolejki ("download now").
export function moveDownloadToFront(id: string): boolean {
  const job = jobs.get(id);
  if (!job || job.status !== 'pending') return false;
  const idx = queueOrder.indexOf(id);
  if (idx >= 0) queueOrder.splice(idx, 1);
  queueOrder.unshift(id);
  markQueueDirty();
  void pump();
  return true;
}

// Zamienia oczekujące zadanie z sąsiadem w kolejce (direction -1 = w górę, 1 = w dół).
export function moveDownload(id: string, direction: -1 | 1): boolean {
  const job = jobs.get(id);
  if (!job || job.status !== 'pending') return false;
  const idx = queueOrder.indexOf(id);
  if (idx < 0) return false;
  const target = idx + direction;
  if (target < 0 || target >= queueOrder.length) return false;
  [queueOrder[idx], queueOrder[target]] = [queueOrder[target], queueOrder[idx]];
  markQueueDirty();
  return true;
}

export function listDownloadJobs(): IpcDownloadTask[] {
  return [...jobs.values()].map(snapshotDownloadTask);
}

// Tworzy snapshoty zadań nadających się do zapisu (pending/paused/downloading/error) na potrzeby eksportu.
export function exportQueue(): IpcDownloadTask[] {
  return collectPersistableJobs();
}

// Ponownie kolejkuje listę wcześniej zapisanych zadań (import). Zadania w stanie
// końcowym są odrzucane; aktywne są dodawane ponownie jako praca oczekująca.
export async function importQueue(tasks: IpcDownloadTask[]): Promise<number> {
  const inputs: IpcDownloadJobInput[] = [];
  for (const t of tasks) {
    if (!t || typeof t.url !== 'string') continue;
    const isHttpSource = t.source?.mode === 'http' || t.source?.mode === 'soundcloud';
    const isExplicitYtdlp = t.source?.mode === 'ytdlp';
    if (!isHttpSource && !isExplicitYtdlp && !resolveProvider(t.url)) continue;
    if (t.status === 'completed' || t.status === 'cancelled') continue;
    inputs.push({
      url: t.url,
      title: t.title,
      thumbnail: t.thumbnail,
      kind: t.kind,
      format: t.format,
      quality: t.quality,
      outputDir: t.outputDir,
      filenameTemplate: t.filenameTemplate,
      videoId: t.videoId,
      channelId: t.channelId,
      channelTitle: t.channelTitle,
      playlistTitle: t.playlistTitle,
      cover: t.cover,
      metaOverride: t.metaOverride,
      subsLangs: t.subsLangs,
      subsFormat: t.subsFormat,
      subsMode: t.subsMode,
      subsFolder: t.subsFolder,
      audioQuality: t.audioQuality,
      audioLanguage: t.audioLanguage,
      videoContainer: t.videoContainer,
      sponsorBlock: t.sponsorBlock,
      trimStart: t.trimStart,
      trimEnd: t.trimEnd,
      source: t.source
    });
  }
  const created = await addDownloadJobs(inputs);
  return created.length;
}

export function clearFinishedDownloads(): boolean {
  let removed = false;
  for (const [id, job] of [...jobs.entries()]) {
    if (job.status === 'completed' || job.status === 'error' || job.status === 'cancelled') {
      // Usuwa też memo statusu i ewentualny abort controller, inaczej obie
      // mapy rosną przez cały czas trwania sesji.
      forgetJob(id);
      removeFromQueue(id);
      jobs.delete(id);
      removed = true;
    }
  }
  if (removed) {
    logger.info('downloads', 'cleared finished jobs');
    markQueueDirty();
  }
  return removed;
}
