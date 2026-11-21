import { handleIpc } from '../typed-handle';
import type { MediaFile } from '../../../shared/types/media';
import { logger } from '../../../shared/logger';
import { e2eFixturesEnabled } from '../../e2e-fixtures';
import { loadLibraryScanned, patchLibraryScanned, updateLibraryStats } from './library-store';
import { sanitizeScannedPatch } from './library-scanned-payload';

// Odczyt porcjami, punktowe zapisy i statystyki — osobno od skanu/folderów.

export function registerLibraryScannedHandlers(): void {
  handleIpc(
    'library:loadScannedChunk',
    async (
      _event,
      offset: unknown,
      limit: unknown
    ): Promise<{
      files: MediaFile[];
      total: number;
      folderTypes: Record<string, 'audio' | 'video' | 'image' | 'mixed'>;
    } | null> => {
      // Test-only: pozwala sprawdzić realny banner błędu biblioteki w E2E
      // bez uszkadzania plików użytkownika. Poza try/catch, żeby IPC odrzuciło.
      if (e2eFixturesEnabled() && process.env.ONDA_E2E_LIBRARY_FAIL === '1') {
        throw new Error('E2E library load failure');
      }
      try {
        const data = await loadLibraryScanned();
        if (!data) return null;
        const start = Math.max(0, Math.floor(Number(offset) || 0));
        const size = Math.min(5000, Math.max(1, Math.floor(Number(limit) || 1000)));
        return {
          files: data.files.slice(start, start + size),
          total: data.files.length,
          folderTypes: data.folderTypes
        };
      } catch (err) {
        logger.error('library', 'loadScannedChunk failed', err);
        return null;
      }
    }
  );

  handleIpc('library:saveScanned', async (_event, data: unknown): Promise<void> => {
    try {
      const patch = sanitizeScannedPatch(data);
      if (!patch) {
        logger.warn('library', 'saveScanned rejected invalid payload');
        return;
      }
      await patchLibraryScanned(patch);
    } catch (err) {
      logger.error('library', 'saveScanned failed', err);
    }
  });

  handleIpc(
    'library:updateStats',
    async (
      _event,
      stats: Array<{ path: string; playCount: number; lastPlayed: number }>
    ): Promise<void> => {
      if (!Array.isArray(stats) || stats.length === 0) return;
      const clean = stats.filter(
        (s) => s && typeof s.path === 'string' && s.path && typeof s.playCount === 'number'
      );
      if (clean.length === 0) return;
      try {
        const data = await loadLibraryScanned();
        if (!data || !Array.isArray(data.files)) return;
        // Zapisuje tylko zmienione wpisy do library-stats.json. Zaplanowanie pełnego
        // zapisu biblioteki tutaj oznaczałoby serializację każdego pliku w wątku main
        // przy każdym zakończeniu utworu.
        updateLibraryStats(clean);
      } catch (err) {
        logger.error('library', 'updateStats failed', err);
      }
    }
  );
}
