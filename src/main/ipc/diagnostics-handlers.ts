import { dialog, BrowserWindow, app } from 'electron';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { readLogTail, clearLogFile, copyLogTo, getEnvironmentInfo } from '../log-file';
import { getRecentWarnings } from '../warnings';
import { getPerfSnapshot } from '../boot-timeline';
import { logger } from '../../shared/logger';
import { errMsg } from '../../shared/helpers';
import { handleIpc } from './typed-handle';

export function registerDiagnosticsHandlers(): void {
  handleIpc('app:getInfo', () => getEnvironmentInfo());

  handleIpc('app:getLicenses', async () => {
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

  handleIpc('diagnostics:readLogs', (_event, lines?: number) => {
    // Ogranicza liczbę linii logu, jakie renderer może pobrać w jednym wywołaniu.
    const n = Math.floor(Number(lines));
    const clamped = Number.isFinite(n) && n > 0 ? Math.min(n, 2000) : undefined;
    return readLogTail(clamped);
  });

  handleIpc('diagnostics:clearLogs', () => clearLogFile());

  handleIpc('diagnostics:getWarnings', () => getRecentWarnings());

  handleIpc('diagnostics:getPerf', () => getPerfSnapshot());

  handleIpc(
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
        logger.warn('diagnostics', 'diagnostics:downloadLog failed', e);
        return { success: false, error: errMsg(e) };
      }
    }
  );
}
