import { app, ipcMain } from 'electron';
import { join } from 'path';
import {
  loadSources,
  saveSource,
  deleteSource,
  sanitizeSource,
  sanitizeEndpoint
} from './sources-store';
import { fetchSourceItems, testSourceConnection } from './generic-fetch';
import { addDownloadJobs } from '../downloads/download-manager';
import type { IpcDownloadJobInput } from '../../shared/types/ipc';
import type { MediaSource, SourceEndpoint } from '../../renderer/src/types/sources';
import { logger } from '../../shared/logger';

export function getSourcesFile(): string {
  return join(app.getPath('userData'), 'sources.json');
}

export function registerSourcesHandlers(): void {
  ipcMain.handle('sources:list', async (): Promise<MediaSource[]> => loadSources(getSourcesFile()));

  ipcMain.handle(
    'sources:save',
    async (_event, raw: unknown): Promise<{ list: MediaSource[]; saved: MediaSource | null; error?: string }> =>
      saveSource(getSourcesFile(), raw)
  );

  ipcMain.handle('sources:delete', async (_event, id: string): Promise<MediaSource[]> =>
    deleteSource(getSourcesFile(), typeof id === 'string' ? id : '')
  );

  ipcMain.handle(
    'sources:test',
    async (_event, sourceRaw: unknown, endpointRaw: unknown) => {
      const source = sanitizeSource(sourceRaw);
      const endpoint = source ? sanitizeEndpoint(endpointRaw ?? source.endpoints[0], 0) : null;
      if (!source || !endpoint) return { success: false, error: 'Invalid source' };
      return testSourceConnection(source, endpoint);
    }
  );

  ipcMain.handle(
    'sources:fetch',
    async (
      _event,
      sourceRaw: unknown,
      endpointRaw: unknown,
      opts?: { query?: Record<string, string>; pageToken?: string }
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
    'sources:enqueue',
    async (_event, inputs: IpcDownloadJobInput[]): Promise<unknown[]> => {
      const list = Array.isArray(inputs)
        ? inputs.filter((i) => i && typeof i.url === 'string' && typeof i.title === 'string')
        : [];
      if (!list.length) return [];
      try {
        return await addDownloadJobs(list);
      } catch (e) {
        logger.warn('sources', 'sources:enqueue failed', e);
        return [];
      }
    }
  );
}