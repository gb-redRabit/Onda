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

// Post-download pipeline (Faza 5/6): metadata override, cover processing and
// library refresh. Extracted from `download-manager.ts` (plan 2.8). Failures are
// non-fatal — the file itself is already done.
export async function postProcess(job: Job): Promise<void> {
  const outputPath = job.outputPath || '';
  // SoundCloud MP3s are raw progressive streams — embed title/artist/artwork
  // here instead of the yt-dlp metadata/cover pipeline.
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
    // The thumbnail is already embedded in the tags — drop the leftover image
    // yt-dlp wrote next to the audio file.
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
    // SHA-256 checksum is opt-in (Settings → Pobieranie → hashFiles). It runs
    // after the file is final so the hash reflects the completed media.
    if (await readHashFilesEnabled()) {
      try {
        job.fileHash = await sha256File(outputPath);
        persist(job);
      } catch (e) {
        logger.warn('downloads', `hash failed for ${job.id}`, e);
      }
    }
    // Surface subtitle outcome instead of silently swallowing it via
    // `--ignore-errors`. Video subtitles are muxed into the container; audio
    // subtitles are sidecar files, optionally moved into a Subtitles/ folder.
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
