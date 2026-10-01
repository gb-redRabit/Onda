import type { AppCacheClearResult } from '../../shared/types/ipc';
import { logger } from '../../shared/logger';
import { clearCoverCache } from './cover/cover-cache';
import { clearThumbnailCache } from './media/media-thumbnails';
import { clearStreamCache } from './youtube/youtube-stream-cache';
import { clearRemoteImageCache } from './remote-image';

/**
 * Czyści każdy cache widoczny dla użytkownika: wyodrębnione okładki (pamięć + trwały
 * katalog + mapa), miniatury, rozwiązane adresy strumieni YouTube/SoundCloud oraz
 * proxowane zdalne obrazy. Best-effort — każdy cache odbudowuje się przy następnym użyciu.
 */
export async function clearAppCaches(): Promise<AppCacheClearResult> {
  try {
    const covers = await clearCoverCache();
    const thumbnails = await clearThumbnailCache();
    const streams = clearStreamCache();
    const remoteImages = clearRemoteImageCache();
    const filesRemoved = covers.removed + thumbnails.removed + streams.removed;
    const bytesFreed = covers.bytesFreed + thumbnails.bytesFreed + streams.bytesFreed;
    logger.info(
      'cache',
      `app caches cleared files=${filesRemoved} bytes=${bytesFreed} ` +
        `streamEntries=${streams.entries} remoteImages=${remoteImages}`
    );
    return { success: true, filesRemoved, bytesFreed };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn('cache', 'clearAppCaches failed', e);
    return { success: false, filesRemoved: 0, bytesFreed: 0, error: msg };
  }
}
