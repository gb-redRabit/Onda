import { app, ipcMain } from 'electron';
import { mkdir, writeFile } from 'fs/promises';
import { basename, dirname, extname, join } from 'path';
import { httpRequest } from './http-request';
import { getStore } from './cover/cover-cache';
import { decryptApiKeys } from './settings/settings-crypto';
import { isSafeAbsolutePath } from '../utils/validate';
import { logRequestOutcome } from '../utils/request-outcome';
import { logger } from '../../shared/logger';
import type {
  OpenSubtitlesDownloadParams,
  OpenSubtitlesDownloadResult,
  OpenSubtitlesResult,
  OpenSubtitlesSearchParams,
  OpenSubtitlesSearchResult
} from '../../shared/types/opensubtitles';

// Klient OpenSubtitles (REST API v1). Klucz API jest odczytywany z
// `settings.apiKeys` (wpis o `service === 'opensubtitles'`), odszyfrowywany tylko tutaj —
// nigdy nie trafia do renderera. Wyszukiwanie idzie po tytule/odcinku; pobranie najpierw
// wymienia `file_id` na tymczasowy link, a potem zapisuje plik obok wideo.

const OS_API = 'https://api.opensubtitles.com/api/v1';
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_SUB_BYTES = 8 * 1024 * 1024;
const KNOWN_FORMATS = new Set(['srt', 'ass', 'ssa', 'vtt', 'sub']);

let appVersion = '0.8.0';
try {
  appVersion = app.getVersion();
} catch (e) {
  logger.warn('opensubtitles', 'app.getVersion failed', e);
}
const USER_AGENT = `Onda v${appVersion}`;

async function resolveKey(): Promise<string | undefined> {
  try {
    const store = await getStore();
    const decrypted = decryptApiKeys(store.get('apiKeys') as Parameters<typeof decryptApiKeys>[0]);
    const entry = decrypted?.keys?.find(
      (k) => k.service === 'opensubtitles' && k.isActive && k.key
    );
    return entry?.key || undefined;
  } catch (e) {
    logger.warn('opensubtitles', 'resolveKey failed', e);
    return undefined;
  }
}

/** Normalizuje odpowiedź `/subtitles` do płaskiej listy (odporne na brakujące pola). */
export function normalizeOsResults(payload: unknown): OpenSubtitlesResult[] {
  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const out: OpenSubtitlesResult[] = [];
  for (const raw of data) {
    const attrs = (raw as { attributes?: Record<string, unknown> })?.attributes;
    if (!attrs || typeof attrs !== 'object') continue;
    const files = Array.isArray(attrs.files) ? attrs.files : [];
    const file = files[0] as { file_id?: number; file_name?: string } | undefined;
    if (!file || !Number.isInteger(file.file_id)) continue;
    const fileName = typeof file.file_name === 'string' ? file.file_name : '';
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    out.push({
      fileId: file.file_id as number,
      language: typeof attrs.language === 'string' ? attrs.language : '',
      release: typeof attrs.release === 'string' && attrs.release ? attrs.release : fileName || '—',
      downloads: typeof attrs.download_count === 'number' ? attrs.download_count : 0,
      rating: typeof attrs.ratings === 'number' ? attrs.ratings : 0,
      format: KNOWN_FORMATS.has(ext) ? ext : 'srt',
      fileName
    });
  }
  return out;
}

/** Ścieżka pliku obok wideo: `<base>.<lang>.<ext>` (język i rozszerzenie sanityzowane). */
export function subtitleSidecarPath(videoPath: string, language: string, format: string): string {
  const base = basename(videoPath, extname(videoPath));
  const lang = (language || 'und').toLowerCase().replace(/[^a-z0-9-]/g, '') || 'und';
  const ext = KNOWN_FORMATS.has(format) ? format : 'srt';
  return join(dirname(videoPath), `${base}.${lang}.${ext}`);
}

function errorMessage(e: unknown): string {
  const msg = (e as Error)?.message ?? String(e);
  if (/HTTP 429|HTTP 406/.test(msg)) return 'rate-limit';
  if (/HTTP 401|HTTP 403/.test(msg)) return 'missing-api-key';
  return msg;
}

export function registerOpenSubtitlesHandlers(): void {
  ipcMain.handle(
    'opensubtitles:search',
    async (_event, params: OpenSubtitlesSearchParams): Promise<OpenSubtitlesSearchResult> => {
      try {
        const key = await resolveKey();
        if (!key) return { success: false, results: [], error: 'missing-api-key' };
        const query = typeof params?.query === 'string' ? params.query.trim().slice(0, 200) : '';
        if (!query) return { success: false, results: [], error: 'missing-query' };

        const qs = new URLSearchParams({
          query,
          order_by: 'download_count',
          order_direction: 'desc'
        });
        if (params.languages) qs.set('languages', String(params.languages).slice(0, 100));
        if (Number.isInteger(params.season)) qs.set('season_number', String(params.season));
        if (Number.isInteger(params.episode)) qs.set('episode_number', String(params.episode));
        if (Number.isInteger(params.year)) qs.set('year', String(params.year));

        const res = await httpRequest(`${OS_API}/subtitles?${qs.toString()}`, {
          headers: { 'Api-Key': key, 'User-Agent': USER_AGENT, Accept: 'application/json' },
          timeoutMs: 10000,
          maxBytes: MAX_JSON_BYTES
        });
        return { success: true, results: normalizeOsResults(JSON.parse(res.text)) };
      } catch (e) {
        logRequestOutcome('opensubtitles', 'search', e);
        return { success: false, results: [], error: errorMessage(e) };
      }
    }
  );

  ipcMain.handle(
    'opensubtitles:download',
    async (_event, params: OpenSubtitlesDownloadParams): Promise<OpenSubtitlesDownloadResult> => {
      try {
        const key = await resolveKey();
        if (!key) return { success: false, error: 'missing-api-key' };
        const fileId = params?.fileId;
        if (!Number.isInteger(fileId) || fileId <= 0) {
          return { success: false, error: 'invalid-file-id' };
        }

        const info = JSON.parse(
          (
            await httpRequest(`${OS_API}/download`, {
              method: 'POST',
              headers: {
                'Api-Key': key,
                'User-Agent': USER_AGENT,
                'Content-Type': 'application/json',
                Accept: 'application/json'
              },
              body: JSON.stringify({ file_id: fileId }),
              maxBytes: MAX_JSON_BYTES
            })
          ).text
        ) as { link?: string; file_name?: string };
        if (!info.link) return { success: false, error: 'no-download-link' };

        const file = await httpRequest(info.link, {
          headers: { 'User-Agent': USER_AGENT },
          maxBytes: MAX_SUB_BYTES
        });
        const fileName = info.file_name || 'subtitle.srt';
        const format = (fileName.split('.').pop() || 'srt').toLowerCase();

        const videoPath = typeof params.videoPath === 'string' ? params.videoPath : '';
        if (videoPath && isSafeAbsolutePath(videoPath)) {
          const outPath = subtitleSidecarPath(videoPath, params.language || '', format);
          await mkdir(dirname(outPath), { recursive: true });
          await writeFile(outPath, file.text, 'utf-8');
          return { success: true, path: outPath, format };
        }
        return { success: true, content: file.text, format };
      } catch (e) {
        logRequestOutcome('opensubtitles', 'download', e);
        return { success: false, error: errorMessage(e) };
      }
    }
  );
}
