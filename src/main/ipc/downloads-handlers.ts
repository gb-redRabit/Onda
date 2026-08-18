import { ipcMain, BrowserWindow, dialog } from 'electron';
import { writeFile, readFile } from 'fs/promises';
import {
  addDownloadJobs,
  cancelDownloadJob,
  pauseDownloadJob,
  resumeDownloadJob,
  clearFinishedDownloads,
  listDownloadJobs,
  setDownloadEmit,
  restoreDownloadQueue,
  pauseAllDownloads,
  resumeAllDownloads,
  moveDownloadToFront,
  moveDownload,
  exportQueue,
  importQueue,
  scheduleDownloadStart,
  getScheduledStart
} from '../downloads/download-manager';
import { applyMetadataOverride } from '../downloads/cover-processing';
import { isSafeAbsolutePath } from '../utils/validate';
import type { IpcDownloadTask, IpcDownloadJobInput, IpcMetaOverride } from '../../shared/types/ipc';

// Throttle broadcast emissions to avoid flooding all BrowserWindows with
// per-chunk progress updates (hundreds of times/sec on fast links).
// Coalesces by job id and only sends the most recent snapshot per tick.
const BROADCAST_INTERVAL_MS = 200;
const pendingBroadcasts = new Map<string, IpcDownloadTask>();
let broadcastTimer: ReturnType<typeof setTimeout> | null = null;

function flushBroadcasts(): void {
  broadcastTimer = null;
  const batch = [...pendingBroadcasts.values()];
  pendingBroadcasts.clear();
  for (const task of batch) {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('yt:downloadProgress', task);
    }
  }
}

function broadcast(task: IpcDownloadTask): void {
  pendingBroadcasts.set(task.id, task);
  if (!broadcastTimer) {
    broadcastTimer = setTimeout(flushBroadcasts, BROADCAST_INTERVAL_MS);
  }
}

export function registerDownloadHandlers(): void {
  setDownloadEmit(broadcast);
  // Restore the persisted queue (interrupted downloads become paused) before the
  // renderer asks for the list, so no queued work is lost across restarts.
  void restoreDownloadQueue();
  ipcMain.handle(
    'yt:download:add',
    async (_event, jobs: IpcDownloadJobInput[]): Promise<IpcDownloadTask[]> => addDownloadJobs(jobs)
  );
  ipcMain.handle('yt:download:cancel', async (_event, id: string): Promise<boolean> =>
    cancelDownloadJob(id)
  );
  ipcMain.handle('yt:download:pause', async (_event, id: string): Promise<boolean> =>
    pauseDownloadJob(id)
  );
  ipcMain.handle('yt:download:resume', async (_event, id: string): Promise<boolean> =>
    resumeDownloadJob(id)
  );
  ipcMain.handle('yt:download:list', async (): Promise<IpcDownloadTask[]> => listDownloadJobs());
  ipcMain.handle('yt:download:clearFinished', async (): Promise<boolean> =>
    clearFinishedDownloads()
  );
  ipcMain.handle('yt:download:pauseAll', async (): Promise<boolean> => pauseAllDownloads());
  ipcMain.handle('yt:download:resumeAll', async (): Promise<boolean> => resumeAllDownloads());
  ipcMain.handle('yt:download:moveToFront', async (_event, id: string): Promise<boolean> =>
    moveDownloadToFront(id)
  );
  ipcMain.handle(
    'yt:download:move',
    async (_event, id: string, direction: -1 | 1): Promise<boolean> =>
      moveDownload(id, direction)
  );
  ipcMain.handle('yt:download:export', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Eksportuj kolejkę',
      defaultPath: 'onda-queue.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    };
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    try {
      await writeFile(
        result.filePath,
        JSON.stringify({ version: 1, jobs: exportQueue() }, null, 2),
        'utf-8'
      );
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
  ipcMain.handle('yt:download:import', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Importuj kolejkę',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile' as const]
    };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true };
    try {
      const raw = await readFile(result.filePaths[0], 'utf-8');
      const parsed = JSON.parse(raw) as { version?: number; jobs?: unknown } | unknown[];
      const jobs = Array.isArray(parsed) ? parsed : (parsed as { jobs?: unknown[] }).jobs;
      const count = await importQueue(Array.isArray(jobs) ? (jobs as IpcDownloadTask[]) : []);
      return { success: true, count };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
  ipcMain.handle('yt:download:schedule', async (_event, timestamp: number | null): Promise<boolean> =>
    scheduleDownloadStart(typeof timestamp === 'number' ? timestamp : null)
  );
  ipcMain.handle('yt:download:schedule:get', async (): Promise<number | null> =>
    getScheduledStart()
  );
  // Re-applies metadata (artist/album/year) to an already-downloaded file without
  // re-downloading it.
  ipcMain.handle(
    'yt:download:updateMetadata',
    async (_event, filePath: string, meta: IpcMetaOverride) => {
      if (typeof filePath !== 'string' || !(await isSafeAbsolutePath(filePath))) {
        return { success: false, error: 'Invalid path' };
      }
      try {
        await applyMetadataOverride(filePath, meta);
        return { success: true };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
  );
}
