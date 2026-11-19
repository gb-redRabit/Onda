import { handleIpc } from '../typed-handle';
import type { LyricsResult } from '../../../shared/types/lyrics';
import { logger } from '../../../shared/logger';
import { isSafeAbsolutePath } from '../../utils/validate';
import { readLyricsForFile } from './lyrics-reader';

export function registerLyricsHandlers(): void {
  handleIpc('lyrics:get', async (_event, filePath: unknown): Promise<LyricsResult> => {
    if (!isSafeAbsolutePath(filePath)) return { kind: 'none', lines: [] };
    try {
      return await readLyricsForFile(filePath);
    } catch (error) {
      logger.warn('lyrics', `read failed for ${filePath}`, error);
      return { kind: 'none', lines: [] };
    }
  });
}
