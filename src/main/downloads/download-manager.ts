// Fasada nad rozłożonymi modułami pobierania (plan 2.8). Zachowana, aby istniejący
// importerzy `download-manager` działali bez zmian:
//   - download-state.ts      — stan kolejki w pamięci + trwałość
//   - download-settings.ts   — readery ustawień (współbieżność, ponowienia, okno nocne)
//   - download-attempt.ts    — pojedyncza próba HTTP/yt-dlp
//   - download-post-process.ts — pipeline metadanych/covera/biblioteki/napisów
//   - download-runner.ts     — pump() + runJob()
//   - download-schedule.ts   — zaplanowany start
//   - download-actions.ts    — mutacje kolejki + restore/add

export {
  setDownloadEmit,
  setDownloadCompletedHandler,
  setSourceItemDownloadedHandler,
  flushQueueNow
} from './download-state';

export {
  addDownloadJobs,
  cancelDownloadJob,
  pauseDownloadJob,
  resumeDownloadJob,
  pauseAllDownloads,
  resumeAllDownloads,
  moveDownloadToFront,
  moveDownload,
  listDownloadJobs,
  exportQueue,
  importQueue,
  clearFinishedDownloads,
  restoreDownloadQueue
} from './download-actions';

export { scheduleDownloadStart, getScheduledStart } from './download-schedule';
