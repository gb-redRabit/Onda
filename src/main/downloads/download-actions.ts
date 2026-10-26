import { randomUUID } from 'crypto';
import { logger } from '../../shared/logger';
import type { IpcDownloadJobInput, IpcDownloadTask } from '../../shared/types/ipc';
import { type Job } from './download-helpers';
import { snapshotDownloadTask } from './download-snapshot';
import { normalizeCoverSpec } from './cover-spec';
import { buildJobSource } from './download-source';
import { resolveProvider } from '../../shared/provider';
import { isSafeAbsolutePath } from '../utils/validate';
import { isProtectedPath } from '../path-policy';
import { privateNetworkAllowedForTarget } from '../ipc/network-target';
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
import { runCoverStep } from './download-post-process';
import { killDownloadProcess } from './kill-download-process';
import { trustedPrivateNetworkOrigins, restoreDownloadQueue } from './download-queue-restore';

// Mutacje kolejki (add/cancel/pause/resume/move/list/import/export/clear),
// wyodrębnione z `download-manager.ts` (plan 2.8). Przywracanie kolejki i
// zaufanie do sieci prywatnej żyją w `download-queue-restore.ts`.
export { restoreDownloadQueue };

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

export async function addDownloadJobs(inputs: IpcDownloadJobInput[]): Promise<IpcDownloadTask[]> {
  const created: IpcDownloadTask[] = [];
  let replaced = 0;
  const trustedPrivateNetwork = await trustedPrivateNetworkOrigins();
  // Deduplikacja: po `videoId` (YouTube/SoundCloud) LUB po tożsamości providera
  // (`providerId:shareId:itemId`) — bez tego podwójne kliknięcie „Pobierz"/„Pobierz
  // wszystko" kolejkowało ten sam plik providera dwa razy. Zadania zakończone
  // błędem/anulowane NIE blokują nowej próby — są zastępowane poniżej.
  const dedupKeyOf = (input: IpcDownloadJobInput): string | null => {
    if (input.videoId) return `v:${input.videoId}`;
    const src = input.source;
    if (src?.mode === 'provider' && src.providerRef && src.providerItemId) {
      return `p:${src.providerRef.provider}:${src.providerRef.shareId}:${src.providerItemId}`;
    }
    return null;
  };
  const knownKeys = new Set<string>();
  for (const j of jobs.values()) {
    if (j.status === 'error' || j.status === 'cancelled') continue;
    const key = dedupKeyOf({ videoId: j.videoId, source: j.source } as IpcDownloadJobInput);
    if (key) knownKeys.add(key);
  }
  for (const input of inputs) {
    if (!input || !input.url) continue;
    const isHttpSource =
      input.source?.mode === 'http' ||
      input.source?.mode === 'soundcloud' ||
      input.source?.mode === 'provider';
    // Źródła generyczne (mega/cda/vk/drive) jawnie żądają yt-dlp — pomijamy
    // gate providera przeznaczony dla klasycznej ścieżki YouTube.
    const isExplicitYtdlp = input.source?.mode === 'ytdlp';
    if (!isHttpSource && !isExplicitYtdlp && !resolveProvider(input.url)) continue;
    const dedupKey = dedupKeyOf(input);
    if (dedupKey && knownKeys.has(dedupKey)) continue;
    if (dedupKey) {
      // Ponowne zakolejkowanie to retry poprzedniej próby: usuń każde zakończone błędem
      // lub anulowane zadanie o tym samym kluczu, aby kolejka trzymała jedno na element.
      for (const [id, j] of [...jobs.entries()]) {
        const jKey = dedupKeyOf({ videoId: j.videoId, source: j.source } as IpcDownloadJobInput);
        if (jKey !== dedupKey) continue;
        if (j.status !== 'error' && j.status !== 'cancelled') continue;
        removeFromQueue(id);
        forgetJob(id);
        jobs.delete(id);
        replaced++;
      }
      knownKeys.add(dedupKey);
    }
    // Pola wspólne dla każdego trybu źródła. Kiedyś były gubione, gdy obiekt source
    // był odbudowywany pole po polu: bez `sourceId`/`sourceItemId` ukończone pobieranie
    // ze źródła nigdy nie mogło zostać zapisane jako "downloaded", a bez
    // `allowPrivateNetwork` zaufanie do sieci prywatnej przyznane przez warstwę źródeł
    // było tracone przed uruchomieniem próby.
    const source = buildJobSource(input.source);
    if (source) {
      // Zaufanie do sieci prywatnej wyłącznie gdy zapisane źródło o tym samym id
      // ma włączony dostęp, jego origin zgadza się z originem URL zadania, a
      // zapisany rekord jest jawną zgodą użytkownika (userApproved=true).
      const trustedOrigin =
        typeof source.sourceId === 'string'
          ? trustedPrivateNetwork.get(source.sourceId)
          : undefined;
      let allowPrivateNetwork = false;
      if (trustedOrigin) {
        try {
          allowPrivateNetwork = privateNetworkAllowedForTarget(input.url, trustedOrigin, true);
        } catch {
          // nieprawidłowy URL zadania — brak zaufania
        }
      }
      source.allowPrivateNetwork = allowPrivateNetwork;
    }
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
        typeof input.outputDir === 'string' &&
        isSafeAbsolutePath(input.outputDir) &&
        !isProtectedPath(input.outputDir)
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

// Ponownie uruchamia krok okładki dla już ukończonego zadania, bez ponownego
// pobierania pliku. Obsługuje okładki custom/frame/clip (miniaturę osadza yt-dlp
// w trakcie pobierania, więc nie da się jej ponowić osobno).
export async function retryCoverProcessing(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const job = jobs.get(id);
  if (!job) return { success: false, error: 'task not found' };
  if (job.status !== 'completed' || !job.outputPath) {
    return { success: false, error: 'task not completed' };
  }
  const cover = job.cover;
  if (!cover || cover.type === 'none' || cover.type === 'thumbnail') {
    return { success: false, error: 'cover cannot be retried' };
  }
  // Stan `fetching` jest emitowany przez `runCoverStep` → `persist`, więc UI
  // pokazuje spinner bez osobnego broadcastu.
  job.coverError = undefined;
  await runCoverStep(job);
  return job.coverStatus === 'error'
    ? { success: false, error: job.coverError }
    : { success: true };
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
      if (job.child) {
        killDownloadProcess(job.child);
      } else {
        // Zadania HTTP/direct-URL nie mają procesu potomnego — bez abortu strumień
        // leciał dalej i „wznów wszystkie" startowało drugi zapis do tego samego .part.
        jobAbortControllers.get(job.id)?.abort();
      }
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
    const isHttpSource =
      t.source?.mode === 'http' || t.source?.mode === 'soundcloud' || t.source?.mode === 'provider';
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
