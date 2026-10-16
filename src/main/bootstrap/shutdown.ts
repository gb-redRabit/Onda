import { app, globalShortcut } from 'electron';
import { logger } from '../../shared/logger';
import { getStore } from '../ipc/cover/cover-cache';
import { getExtraRoots } from '../media/media-server';
import { closeLoginWindow } from '../youtube/youtube-auth';
import { closeProviderLoginWindow } from '../ipc/providers/provider-login';
import { stopSubscriptionChecker } from '../ipc/subscriptions/subscription-checker';
import { stopLinkSubsChecker } from '../ipc/providers/remote-subs-checker';
import { flushLogWrites } from '../log-file';
import { flushLibraryScanned, flushStats } from '../ipc/library/library-store';
import { flushPlaybackPositions } from '../ipc/playback-handlers';
import { flushQueueNow } from '../downloads/download-manager';
import { flushProviderCache } from '../ipc/providers/provider-cache';
import { jobs, jobAbortControllers } from '../downloads/download-state';
import { killDownloadProcess } from '../downloads/kill-download-process';

// Górny limit opróżniania persystencji przy wyjściu. Bez niego zawieszony flush
// (np. niedostępny dysk sieciowy) blokowałby `app.quit()` na zawsze, zostawiając
// proces-widmo w tle.
const SHUTDOWN_FLUSH_TIMEOUT_MS = 5000;

export interface ShutdownDeps {
  /** Zamknięcie serwera mediów; `null`, gdy nie został utworzony. */
  getMediaServer: () => { close: () => void } | null;
}

/**
 * Łagodne wyłączanie. `will-quit` jest synchroniczne: pętla zdarzeń Node jest
 * rozbierana, gdy tylko listener zwróci, więc asynchroniczne opróżnienia
 * rozpoczęte tam nigdy się nie kończą — ostatnie debounce'owane zapisy przepadają,
 * pliki .tmp mogą zostać, a pliki biblioteki/statystyk mogą pozostać w połowie
 * zapisane. Opóźnij wyjście raz na `before-quit`, zaczekaj na każde opróżnienie,
 * potem wyjdź naprawdę.
 */
export function installGracefulShutdown(deps: ShutdownDeps): void {
  let quitting = false;
  app.on('before-quit', (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    void (async () => {
      try {
        globalShortcut.unregisterAll();
        // Zatrzymaj harmonogramy w tle, aby żadne przeglądanie yt-dlp/sieci nie zaczęło się podczas wyjścia.
        stopSubscriptionChecker();
        stopLinkSubsChecker();
        deps.getMediaServer()?.close();
        closeLoginWindow();
        closeProviderLoginWindow();
        // Najpierw zatrzymaj pracę: procesy potomne yt-dlp/ffmpeg i strumienie HTTP
        // inaczej piszą do plików w trakcie opróżniania persystencji (i przeżywają
        // zamknięcie aplikacji).
        for (const job of jobs.values()) {
          if (job.status !== 'downloading') continue;
          if (job.child) {
            try {
              killDownloadProcess(job.child);
            } catch {
              /* już nie istnieje */
            }
          } else {
            jobAbortControllers.get(job.id)?.abort();
          }
        }
        // Opróżnij debounce'owaną persystencję, aby ostatnie zmiany nie przepadły.
        // Limit czasu gwarantuje, że zamknięcie zawsze się kończy.
        const flushes = Promise.allSettled([
          // Linie zapisane podczas zamykania są tymi, które warto mieć, gdy
          // doprowadziła nas tu awaria.
          flushLogWrites(),
          flushLibraryScanned(),
          // Statystyki odtwarzania są debounce'owane (400 ms); opróżnij je, inaczej ostatnie odtworzenia przepadną.
          flushStats(),
          // Pozycje odtwarzania są debounce'owane (15 s) — bez tego ostatnie ~15 s przepada.
          flushPlaybackPositions(),
          // Kolejka pobierania jest debounce'owana (400 ms) — bez awaitowania
          // ostatni zapis mógł przepaść.
          flushQueueNow(),
          // Cache providerów (foldery) jest debounce'owany — opróżnij przy wyjściu.
          flushProviderCache(),
          getStore().then((s) => s.set('mediaRoots', getExtraRoots().slice(0, 50)))
        ]);
        const shutdownTimeout = new Promise<'timeout'>((r) =>
          setTimeout(() => r('timeout'), SHUTDOWN_FLUSH_TIMEOUT_MS)
        );
        if ((await Promise.race([flushes, shutdownTimeout])) === 'timeout') {
          logger.warn(
            'main',
            `graceful shutdown flush exceeded ${SHUTDOWN_FLUSH_TIMEOUT_MS}ms — quitting anyway`
          );
        }
      } catch (e) {
        logger.error('main', 'graceful shutdown failed', e);
      } finally {
        app.quit();
      }
    })();
  });
}
