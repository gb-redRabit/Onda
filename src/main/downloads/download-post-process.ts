import { logger } from '../../shared/logger';
import type { Job } from './download-helpers';
import { persist } from './download-state';
import { readHashFilesEnabled } from './download-settings';
import { embedScMp3Tags } from './sc-tags';
import { applyMetadataOverride, processCover, removeThumbnailFiles } from './cover-processing';
import { syncDownloadToLibrary } from './library-sync';
import { addToChannelPlaylist } from './channel-playlist';
import { sha256File } from './hash-file';
import { findSiblingSubtitleFiles, moveSubtitlesToFolder } from './subtitle-files';

// Pipeline po pobraniu (Faza 5/6): nadpisanie metadanych, przetwarzanie covera
// i odświeżenie biblioteki. Wyodrębniony z `download-manager.ts` (plan 2.8).
// Niepowodzenia są niekrytyczne — sam plik jest już gotowy.
export async function postProcess(job: Job): Promise<void> {
  const outputPath = job.outputPath || '';
  // MP3 z SoundCloud to surowe strumienie progresywne — osadź tutaj
  // title/artist/artwork zamiast pipeline'u metadanych/covera yt-dlp.
  if (job.source?.mode === 'soundcloud' && outputPath && job.kind === 'audio') {
    job.coverStatus = 'fetching';
    persist(job);
    const ok = await embedScMp3Tags(outputPath, {
      title: job.title,
      artist: job.metaOverride?.artist || job.channelTitle || '',
      album: job.metaOverride?.album,
      year: job.metaOverride?.year,
      thumbnailUrl: job.thumbnail && /^https:\/\//i.test(job.thumbnail) ? job.thumbnail : undefined
    });
    job.coverStatus = ok ? 'embedded' : 'none';
    persist(job);
  }
  if (outputPath && job.metaOverride && job.source?.mode !== 'soundcloud') {
    try {
      await applyMetadataOverride(outputPath, job.metaOverride);
    } catch (e) {
      logger.warn('downloads', `metadata override failed for ${job.id}`, e);
    }
  }
  if (
    outputPath &&
    job.kind === 'audio' &&
    job.cover &&
    job.cover.type !== 'thumbnail' &&
    job.cover.type !== 'none'
  ) {
    job.coverStatus = 'fetching';
    persist(job);
    const res = await processCover({
      taskId: job.id,
      url: job.url,
      cover: job.cover,
      outputPath
    });
    job.coverStatus = res.status;
    persist(job);
  } else if (job.cover?.type === 'thumbnail') {
    job.coverStatus = 'embedded';
    // Miniatura jest już osadzona w tagach — usuń pozostały obraz, który
    // yt-dlp zapisał obok pliku audio.
    if (outputPath) await removeThumbnailFiles(outputPath);
  }
  if (outputPath) {
    const sync = await syncDownloadToLibrary(outputPath, { forceAdd: !!job.addToLibrary });
    if (sync.inLibrary) {
      job.inLibrary = true;
      persist(job);
      if (job.channelTitle && sync.file) {
        await addToChannelPlaylist(job.channelTitle, sync.file);
      }
    }
    // Suma kontrolna SHA-256 jest opcjonalna (Ustawienia → Pobieranie → hashFiles).
    // Uruchamiana po sfinalizowaniu pliku, aby hash odzwierciedlał gotowe media.
    if (await readHashFilesEnabled()) {
      try {
        job.fileHash = await sha256File(outputPath);
        persist(job);
      } catch (e) {
        logger.warn('downloads', `hash failed for ${job.id}`, e);
      }
    }
    // Ujawnia wynik napisów zamiast po cichu go połykać przez
    // `--ignore-errors`. Napisy wideo są muxowane do kontenera; napisy audio
    // to pliki sidecar, opcjonalnie przenoszone do folderu Subtitles/.
    if (job.subsLangs) {
      if (job.kind === 'video') {
        job.subtitleStatus = 'embedded';
      } else {
        const files = await findSiblingSubtitleFiles(outputPath);
        if (files.length) {
          if (job.subsFolder) await moveSubtitlesToFolder(outputPath);
          job.subtitleStatus = 'saved';
        } else {
          job.subtitleStatus = 'missing';
        }
      }
      persist(job);
    }
  }
}
