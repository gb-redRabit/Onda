import { handleIpc } from '../typed-handle';
import { logger } from '../../../shared/logger';
import { applyLoudnessUpdates, flushLibraryScanned, loadLibraryScanned } from './library-store';
import { analyzeLibraryLoudness } from './loudness-analysis';
import { broadcastToAllWindows } from '../../utils/broadcast';

// Analiza głośności jest długa (dekoduje całe pliki), więc ma własny kontroler
// anulowania i jest odseparowana od skanu oraz folderów biblioteki.

let activeLoudnessController: AbortController | null = null;

/** Przerywa analizę głośności przy zamykaniu aplikacji. */
export function cancelLibraryLoudness(): void {
  activeLoudnessController?.abort();
}

export function registerLibraryLoudnessHandlers(): void {
  handleIpc('library:loudnessCancel', (): boolean => {
    activeLoudnessController?.abort();
    return true;
  });

  handleIpc('library:analyzeLoudness', async (event) => {
    const controller = new AbortController();
    const previous = activeLoudnessController;
    activeLoudnessController = controller;
    previous?.abort();
    try {
      const data = await loadLibraryScanned();
      if (!data) {
        return {
          analyzed: 0,
          albums: 0,
          failed: 0,
          aborted: false,
          truncated: false,
          updated: 0
        };
      }
      const { updates, summary } = await analyzeLibraryLoudness(
        data.files,
        controller.signal,
        (progress) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('library:loudness:progress', progress);
          }
        }
      );
      const updated = applyLoudnessUpdates(updates);
      if (updated > 0) {
        await flushLibraryScanned();
        // Analiza głośności zmienia metadane wielu plików; pełne przeładowanie
        // jest tu prostsze i rzadsze niż budowanie patcha per utwór.
        broadcastToAllWindows('library:updated', { reset: true });
      }
      return { ...summary, updated };
    } catch (err) {
      logger.error('library', 'loudness analysis failed', err);
      return {
        analyzed: 0,
        albums: 0,
        failed: 0,
        aborted: controller.signal.aborted,
        truncated: false,
        updated: 0,
        error: err instanceof Error ? err.message : String(err)
      };
    } finally {
      if (activeLoudnessController === controller) activeLoudnessController = null;
    }
  });
}
