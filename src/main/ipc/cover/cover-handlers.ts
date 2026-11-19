import { handleIpc } from '../typed-handle';
import { extractAndCacheCover, extractAndCacheStill } from './cover-cache';
import { isSafeAbsolutePath } from '../../utils/validate';
import { isReadableMediaPath } from '../../media/read-access';
import { logger } from '../../../shared/logger';

export function registerCoverHandlers(): void {
  handleIpc(
    'media:getCover',
    async (
      _event,
      filePath: string
    ): Promise<{ type: 'video' | 'image' | null; data: string | null }> => {
      if (!isSafeAbsolutePath(filePath)) {
        logger.warn('cover', `media:getCover rejected unsafe path: ${filePath}`);
        return { type: null, data: null };
      }
      if (!isReadableMediaPath(filePath)) {
        logger.warn('cover', `media:getCover rejected path outside allowed roots: ${filePath}`);
        return { type: null, data: null };
      }
      const result = await extractAndCacheCover(filePath);
      return result;
    }
  );

  handleIpc(
    'media:getCoverStill',
    async (_event, filePath: string): Promise<{ type: 'image' | null; data: string | null }> => {
      if (!isSafeAbsolutePath(filePath)) {
        logger.warn('cover', `media:getCoverStill rejected unsafe path: ${filePath}`);
        return { type: null, data: null };
      }
      if (!isReadableMediaPath(filePath)) {
        logger.warn(
          'cover',
          `media:getCoverStill rejected path outside allowed roots: ${filePath}`
        );
        return { type: null, data: null };
      }
      return extractAndCacheStill(filePath);
    }
  );
}
