import { BrowserWindow, dialog, type IpcMainInvokeEvent, type SaveDialogOptions } from 'electron';
import { mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';
import type {
  HistoryExportFormat,
  HistoryExportRequest,
  HistoryExportResult
} from '../../shared/types/tools';
import { loadLibraryScanned } from '../ipc/library/library-store';
import { isProtectedPath } from '../path-policy';
import { isSafeAbsolutePath } from '../utils/validate';
import { logger } from '../../shared/logger';
import { buildHistoryRows, serializeHistory } from './history-format';

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function defaultFileName(format: HistoryExportFormat): string {
  return `onda-history-${new Date().toISOString().slice(0, 10)}.${format}`;
}

function saveDialogOptions(format: HistoryExportFormat): SaveDialogOptions {
  return {
    title: 'Export history',
    defaultPath: defaultFileName(format),
    filters:
      format === 'json'
        ? [{ name: 'JSON', extensions: ['json'] }]
        : [{ name: 'CSV', extensions: ['csv'] }]
  };
}

export async function exportHistory(
  event: IpcMainInvokeEvent,
  request: unknown
): Promise<HistoryExportResult> {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { success: false, error: 'Invalid request' };
  }
  const req = request as Partial<HistoryExportRequest>;
  const format: HistoryExportFormat = req.format === 'json' ? 'json' : 'csv';
  const type = req.type === 'audio' || req.type === 'video' ? req.type : 'all';
  const sort = req.sort === 'playCount' || req.sort === 'title' ? req.sort : 'lastPlayed';
  const onlyPlayed = req.onlyPlayed !== false;

  try {
    const library = await loadLibraryScanned();
    const rows = buildHistoryRows(library?.files ?? [], { onlyPlayed, type, sort });
    const content = serializeHistory(rows, format);

    let outputPath = typeof req.outputPath === 'string' ? req.outputPath.trim() : '';
    if (outputPath) {
      if (!isSafeAbsolutePath(outputPath)) {
        return { success: false, error: 'Invalid output path' };
      }
      if (isProtectedPath(outputPath)) return { success: false, error: 'Protected path' };
    } else {
      const win = BrowserWindow.fromWebContents(event.sender);
      const result = win
        ? await dialog.showSaveDialog(win, saveDialogOptions(format))
        : await dialog.showSaveDialog(saveDialogOptions(format));
      if (result.canceled || !result.filePath) return { success: false, canceled: true };
      outputPath = result.filePath;
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content, 'utf-8');
    return {
      success: true,
      path: outputPath,
      rows: rows.length,
      bytes: Buffer.byteLength(content)
    };
  } catch (error) {
    logger.warn('tools', 'history export failed', error);
    return { success: false, error: errMsg(error) };
  }
}
