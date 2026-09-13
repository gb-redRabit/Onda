// Facade over the decomposed download modules (plan 2.8). Kept so existing
// importers of `download-manager` keep working unchanged:
//   - download-state.ts      — in-memory queue state + persistence
//   - download-settings.ts   — settings readers (concurrency, retry, night window)
//   - download-attempt.ts    — a single HTTP/yt-dlp attempt
//   - download-post-process.ts — metadata/cover/library/subtitle pipeline
//   - download-runner.ts     — pump() + runJob()
//   - download-schedule.ts   — scheduled start
//   - download-actions.ts    — queue mutations + restore/add

export { setDownloadEmit, setDownloadCompletedHandler, flushQueueNow } from './download-state';

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
