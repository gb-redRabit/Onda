import type { IpcDownloadTask } from '../../shared/types/ipc';

// Płytka kopia zadania pobierania z wybranymi polami, wyodrębniona z
// `download-manager.ts` (plan 2.8). Używana przed zapisem/emisją, aby wyciekały
// tylko serializowalne pola IPC (bez wewnętrznych danych specyficznych dla Job).
export function snapshotDownloadTask(task: IpcDownloadTask): IpcDownloadTask {
  return {
    id: task.id,
    url: task.url,
    title: task.title,
    thumbnail: task.thumbnail,
    kind: task.kind,
    format: task.format,
    quality: task.quality,
    outputDir: task.outputDir,
    filenameTemplate: task.filenameTemplate,
    progress: task.progress,
    speed: task.speed,
    eta: task.eta,
    status: task.status,
    error: task.error,
    errorCode: task.errorCode,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    outputPath: task.outputPath,
    videoId: task.videoId,
    channelId: task.channelId,
    channelTitle: task.channelTitle,
    playlistTitle: task.playlistTitle,
    cover: task.cover,
    coverStatus: task.coverStatus,
    metaOverride: task.metaOverride,
    inLibrary: task.inLibrary,
    fileHash: task.fileHash,
    subsLangs: task.subsLangs,
    subsFormat: task.subsFormat,
    subsMode: task.subsMode,
    subsFolder: task.subsFolder,
    subtitleStatus: task.subtitleStatus,
    audioQuality: task.audioQuality,
    audioLanguage: task.audioLanguage,
    videoContainer: task.videoContainer,
    sponsorBlock: task.sponsorBlock,
    trimStart: task.trimStart,
    trimEnd: task.trimEnd,
    addToLibrary: task.addToLibrary,
    source: task.source
  };
}
