import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { join, extname } from 'path';
import { writeFile, readFile } from 'fs/promises';
import {
  loadSources,
  saveSource,
  deleteSource,
  saveAllSources,
  sanitizeSource,
  sanitizeEndpoint
} from './sources-store';
import { getStore } from './cover-cache';
import { fetchSourceItems, testSourceConnection, fetchTableRows, resolveSourceHeaders } from './generic-fetch';
import { scrapePlayerUrl } from './player-scraper';
import { addDownloadJobs } from '../downloads/download-manager';
import type { IpcDownloadJobInput } from '../../shared/types/ipc';
import type { MediaSource, SourceEndpoint, SourceItem } from '../../renderer/src/types/sources';
import { logger } from '../../shared/logger';

function mimeFromExtension(ext: string): string | null {
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml'
  };
  return map[ext.toLowerCase()] || null;
}

export function getSourcesFile(): string {
  return join(app.getPath('userData'), 'sources.json');
}

export function registerSourcesHandlers(): void {
  ipcMain.handle('sources:list', async (): Promise<MediaSource[]> => loadSources(getSourcesFile()));

  /** Eksport źródeł do pliku JSON (natywny dialog zapisu). */
  ipcMain.handle(
    'sources:export',
    async (event): Promise<{ success: boolean; canceled?: boolean; error?: string }> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Eksportuj źródła',
      defaultPath: 'onda-sources.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    };
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    try {
      const list = loadSources(getSourcesFile());
      await writeFile(result.filePath, JSON.stringify({ version: 1, sources: list }, null, 2), 'utf-8');
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  /** Import źródeł z pliku JSON (natywny dialog otwarcia); każdy wpis sanityzowany. */
  ipcMain.handle(
    'sources:import',
    async (
      event
    ): Promise<{ success: boolean; canceled?: boolean; count?: number; error?: string }> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Importuj źródła',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile' as const]
    };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true };
    try {
      const raw = await readFile(result.filePaths[0], 'utf-8');
      const parsed = JSON.parse(raw) as { version?: number; sources?: unknown } | unknown[];
      const arr = Array.isArray(parsed)
        ? parsed
        : (parsed as { sources?: unknown[] }).sources;
      if (!Array.isArray(arr)) return { success: false, error: 'Invalid file' };
      const existing = await loadSources(getSourcesFile());
      const seen = new Set(existing.map((s) => s.id));
      let count = 0;
      for (const v of arr) {
        const clean = sanitizeSource(v);
        if (!clean) continue;
        clean.id = seen.has(clean.id) ? `import-${Date.now().toString(36)}-${count}` : clean.id;
        seen.add(clean.id);
        existing.push(clean);
        count++;
      }
      await saveAllSources(getSourcesFile(), existing);
      return { success: true, count };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  /** Domyślny katalog pobierania źródeł: ustawienie sourcesDir, inaczej
   *  <ścieżka z ustawień Pobranych>/api, inaczej systemowe Pobrane/api. */
  ipcMain.handle('sources:downloadDir', async (): Promise<string> => {
    let dir = '';
    try {
      const store = await getStore();
      const dl = store.get('download') as
        | { defaultPath?: string; sourcesDir?: string }
        | undefined;
      dir = dl?.sourcesDir?.trim() || (dl?.defaultPath?.trim() ? `${dl.defaultPath.trim()}/api` : '');
    } catch {
      dir = '';
    }
    const resolved = (dir || join(app.getPath('downloads'), 'api')).replace(/[\\/]+$/, '');
    return resolved;
  });

  /** Wybór ikony źródła z komputera; zwraca data URL (limit 2 MB) lub URL. */
  ipcMain.handle(
    'sources:pickIcon',
    async (
      event
    ): Promise<{ success: boolean; canceled?: boolean; dataUrl?: string; error?: string }> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const options = {
        title: 'Wybierz ikonę źródła',
        filters: [{ name: 'Obrazy', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'ico', 'svg'] }],
        properties: ['openFile' as const]
      };
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || !result.filePaths?.[0]) return { success: false, canceled: true };
      try {
        const filePath = result.filePaths[0];
        const buf = await readFile(filePath);
        if (buf.byteLength > 2 * 1024 * 1024)
          return { success: false, error: 'File too large (max 2 MB)' };
        const mime = mimeFromExtension(extname(filePath)) || 'image/png';
        const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
        return { success: true, dataUrl };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
  );

  ipcMain.handle(
    'sources:save',
    async (
      _event,
      raw: unknown
    ): Promise<{ list: MediaSource[]; saved: MediaSource | null; error?: string }> =>
      saveSource(getSourcesFile(), raw)
  );

  ipcMain.handle('sources:delete', async (_event, id: string): Promise<MediaSource[]> =>
    deleteSource(getSourcesFile(), typeof id === 'string' ? id : '')
  );

  ipcMain.handle('sources:test', async (_event, sourceRaw: unknown, endpointRaw: unknown) => {
    const source = sanitizeSource(sourceRaw);
    const endpoint = source ? sanitizeEndpoint(endpointRaw ?? source.endpoints[0], 0) : null;
    if (!source || !endpoint) return { success: false, error: 'Invalid source' };
    const res = await testSourceConnection(source, endpoint);
    return { success: res.success, error: res.error, sample: res.sample ?? null };
  });

  ipcMain.handle(
    'sources:fetch',
    async (
      _event,
      sourceRaw: unknown,
      endpointRaw: unknown,
      opts?: { query?: Record<string, string>; pageToken?: string; page?: number; context?: unknown }
    ) => {
      const source = sanitizeSource(sourceRaw);
      const endpoint: SourceEndpoint | null = source
        ? sanitizeEndpoint(endpointRaw ?? source.endpoints[0], 0)
        : null;
      if (!source || !endpoint) return { items: [], hasMore: false, error: 'Invalid source' };
      return fetchSourceItems(source, endpoint, opts);
    }
  );

  ipcMain.handle(
    'sources:tableRows',
    async (
      _event,
      sourceRaw: unknown,
      endpointRaw: unknown,
      opts?: { context?: unknown }
    ): Promise<SourceItem[]> => {
      const source = sanitizeSource(sourceRaw);
      const endpoint: SourceEndpoint | null = source
        ? sanitizeEndpoint(endpointRaw ?? source.endpoints[0], 0)
        : null;
      if (!source || !endpoint) return [];
      return fetchTableRows(source, endpoint, opts);
    }
  );

  ipcMain.handle(
    'sources:enqueue',
    async (_event, inputs: IpcDownloadJobInput[]): Promise<unknown[]> => {
      const list = Array.isArray(inputs)
        ? inputs.filter((i) => i && typeof i.url === 'string' && typeof i.title === 'string')
        : [];
      if (!list.length) return [];
      try {
        // Fallback dla serwisów nieznanych yt-dlp (embed bez extractora):
        // wyciągamy bezpośredni m3u8/mp4 ze strony playera. HLS dalej idzie
        // przez yt-dlp z nagłówkiem Referer; bezpośredni plik — trybem http.
        for (const input of list) {
          if (input.source?.mode !== 'ytdlp' || !/^https:\/\//i.test(input.url)) continue;
          const authHeaders = await resolveSourceHeaders(
            input.source.apiKeyId,
            input.source.headerName
          );
          const scraped = await scrapePlayerUrl(input.url, authHeaders);
          if (!scraped) continue;
          input.url = scraped.url;
          if (scraped.kind === 'hls') {
            input.source = {
              ...input.source,
              mode: 'ytdlp',
              headers: {
                ...(input.source.headers || {}),
                Referer: scraped.referer,
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
              }
            };
          } else {
            input.source = { ...input.source, mode: 'http' };
          }
        }
        return await addDownloadJobs(list);
      } catch (e) {
        logger.warn('sources', 'sources:enqueue failed', e);
        return [];
      }
    }
  );
}
