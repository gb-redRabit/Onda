import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getLogDir, getLogPath, readLogTail, clearLogFile, copyLogTo, getEnvironmentInfo } from '../log-file';
import { logger } from '../../shared/logger';

export function registerDiagnosticsHandlers(): void {
  ipcMain.handle('app:getInfo', () => getEnvironmentInfo());

  ipcMain.handle('app:getLicenses', async () => {
    try {
      const appPath = join(app.getAppPath(), 'package.json');
      const pkg = JSON.parse(await readFile(appPath, 'utf-8')) as {
        dependencies?: Record<string, string>;
      };
      const deps = Object.keys(pkg.dependencies ?? {});
      const result: Array<{ name: string; version?: string; license?: string }> = [];
      for (const name of deps) {
        try {
          const p = join(app.getAppPath(), 'node_modules', name, 'package.json');
          const meta = JSON.parse(await readFile(p, 'utf-8')) as {
            version?: string;
            license?: string;
          };
          result.push({
            name,
            version: meta.version,
            license: meta.license
          });
        } catch {
          result.push({ name });
        }
      }
      return result;
    } catch (e) {
      logger.warn('diagnostics', 'app:getLicenses failed', e);
      return [];
    }
  });

  ipcMain.handle('diagnostics:readLogs', (_event, lines?: number) => {
    // Cap how many log lines a renderer can pull in one call.
    const n = Math.floor(Number(lines));
    const clamped = Number.isFinite(n) && n > 0 ? Math.min(n, 2000) : undefined;
    return readLogTail(clamped);
  });

  ipcMain.handle('diagnostics:clearLogs', () => clearLogFile());

  ipcMain.handle(
    'diagnostics:downloadLog',
    async (event): Promise<{ success: boolean; canceled?: boolean; error?: string }> => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return { success: false, error: 'No window' };
        const result = await dialog.showSaveDialog(win, {
          title: 'Export Onda log',
          defaultPath: 'onda-main.log',
          filters: [{ name: 'Log', extensions: ['log'] }]
        });
        if (result.canceled || !result.filePath) return { success: false, canceled: true };
        await copyLogTo(result.filePath);
        return { success: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn('diagnostics', 'diagnostics:downloadLog failed', e);
        return { success: false, error: msg };
      }
    }
  );
}

// re-exported for convenience in other handlers
export { getLogDir, getLogPath };
