import { createHash } from 'crypto';
import { ipcMain } from 'electron';
import { mkdir, open, writeFile } from 'fs/promises';
import { basename, dirname, extname, join } from 'path';
import { httpRequest } from './http-request';
import { isSafeAbsolutePath } from '../utils/validate';
import { logRequestOutcome, isRateLimited } from '../utils/request-outcome';
import { logger } from '../../shared/logger';
import type {
  NapiProjektCheckResult,
  NapiProjektDownloadParams,
  NapiProjektDownloadResult
} from '../../shared/types/napiprojekt';

// NapiProjekt dopasowuje napisy po ZAWARTOŚCI pliku, nie po tytule: identyfikatorem jest
// MD5 pierwszych 10 MB. `dl.php` z `v=dreambox` zwraca gotowy tekst `[startMs][endMs]treść`
// (`|` = złamanie wiersza) w Windows-1250 — bez archiwum i bez hasła, więc nie potrzebujemy
// 7-Zipa. Zweryfikowane na żywo: brak napisów = 4-bajtowe `NPc0`.

const NAPI_URL = 'https://napiprojekt.pl/unit_napisy/dl.php';
/** NapiProjekt haszuje pierwsze 10 MB (10485760 bajtów) albo cały plik, jeśli mniejszy. */
const NAPI_CHUNK = 10 * 1024 * 1024;
const MAX_SUB_BYTES = 8 * 1024 * 1024;
const USER_AGENT = 'Mozilla/5.0 (compatible; Onda)';

/** MD5 pierwszych 10 MB pliku (NapiProjekt `f`). */
export async function napiprojektHash(filePath: string): Promise<string> {
  const handle = await open(filePath, 'r');
  try {
    const buf = Buffer.alloc(NAPI_CHUNK);
    const { bytesRead } = await handle.read(buf, 0, NAPI_CHUNK, 0);
    return createHash('md5').update(buf.subarray(0, bytesRead)).digest('hex');
  } finally {
    await handle.close();
  }
}

/**
 * Drugi hash NapiProjekt (`t`), wyprowadzony z pierwszego. Czysta funkcja — wektor
 * testowy: `36ac9192a26b87524021c9bab9fa2085` → `2ebcc`.
 */
export function napiprojektSubhash(hash: string): string {
  const idx = [0xe, 0x3, 0x6, 0x8, 0x2];
  const mul = [2, 2, 5, 4, 3];
  const add = [0, 0xd, 0x10, 0xb, 0x5];
  let out = '';
  for (let i = 0; i < idx.length; i++) {
    const t = add[i] + parseInt(hash[idx[i]], 16);
    const v = parseInt(hash.slice(t, t + 2), 16);
    out += (v * mul[i]).toString(16).slice(-1);
  }
  return out;
}

function srtTimestamp(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const milli = total % 1000;
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(milli, 3)}`;
}

/** Konwertuje format NapiProjekt (`[start][end]treść`, `|` = nowy wiersz) na SRT. */
export function parseNapiSubtitles(text: string): string {
  const cues: string[] = [];
  for (const rawLine of text.replace(/\r/g, '').split('\n')) {
    const match = rawLine.match(/^\[(\d+)\]\[(\d+)\](.*)$/);
    if (!match) continue;
    const body = match[3].replace(/\|/g, '\n').trim();
    if (!body) continue;
    cues.push(
      `${cues.length + 1}\n${srtTimestamp(Number(match[1]))} --> ${srtTimestamp(Number(match[2]))}\n${body}\n`
    );
  }
  return cues.join('\n');
}

/** Dekoduje bajty odpowiedzi (Windows-1250) z transportu odczytanego jako latin1. */
function decodeNapiText(latin1Text: string): string {
  try {
    return new TextDecoder('windows-1250').decode(Buffer.from(latin1Text, 'latin1'));
  } catch (e) {
    logger.warn('napiprojekt', 'windows-1250 decoder unavailable', e);
    return latin1Text;
  }
}

/** Pobiera i konwertuje napisy (bez zapisu). Wspólne dla `check` i `download`. */async function loadNapiSrt(videoPath: string): Promise<{ srt: string } | { error: string }> {
  if (!videoPath || !isSafeAbsolutePath(videoPath)) return { error: 'missing-file' };

  let hash: string;
  try {
    hash = await napiprojektHash(videoPath);
  } catch (e) {
    logRequestOutcome('napiprojekt', `hash ${basename(videoPath)}`, e);
    return { error: 'missing-file' };
  }

  try {
    const query = new URLSearchParams({
      l: 'PL',
      f: hash,
      t: napiprojektSubhash(hash),
      v: 'dreambox',
      kolejka: 'false',
      nick: '',
      pass: '',
      napios: 'Linux'
    });
    const res = await httpRequest(`${NAPI_URL}?${query.toString()}`, {
      headers: { 'User-Agent': USER_AGENT },
      encoding: 'latin1',
      maxBytes: MAX_SUB_BYTES
    });
    if (res.text.startsWith('NPc0')) return { error: 'not-found' };
    const srt = parseNapiSubtitles(decodeNapiText(res.text));
    if (!srt) return { error: 'not-found' };
    return { srt };
  } catch (e) {
    const msg = logRequestOutcome('napiprojekt', 'fetch', e);
    if (isRateLimited(e)) return { error: 'rate-limit' };
    return { error: /^HTTP \d{3}$/.test(msg) ? 'network' : msg };
  }
}

// Sprawdzenie jest odpytywane przy KAŻDYM wyszukiwaniu, więc krótki cache chroni przed
// powtarzalnym 429 z NapiProjektu. Cache'ujemy tylko trwałe wyniki (znaleziono / brak),
// nigdy błędów przejściowych (limit/sieć), żeby nie blokować użytkownika na 10 minut.
const CHECK_TTL_MS = 10 * 60 * 1000;
const CHECK_CACHE_MAX = 200;
const checkCache = new Map<string, { found: boolean; error?: string; at: number }>();

async function cachedNapiCheck(videoPath: string): Promise<NapiProjektCheckResult> {
  const hit = checkCache.get(videoPath);
  if (hit && Date.now() - hit.at < CHECK_TTL_MS) {
    return hit.found ? { found: true } : { found: false, error: hit.error };
  }
  const result = await loadNapiSrt(videoPath);
  if ('srt' in result) {
    checkCache.set(videoPath, { found: true, at: Date.now() });
    if (checkCache.size > CHECK_CACHE_MAX) {
      const oldest = checkCache.keys().next();
      if (!oldest.done) checkCache.delete(oldest.value);
    }
    return { found: true };
  }
  if (result.error === 'not-found') checkCache.set(videoPath, { found: false, at: Date.now() });
  return { found: false, error: result.error };
}

export function registerNapiProjektHandlers(): void {
  // Wyszukiwarka odpytuje to równolegle z OpenSubtitles — tylko sprawdzenie, bez zapisu.
  ipcMain.handle(
    'napiprojekt:check',
    async (_event, params: NapiProjektDownloadParams): Promise<NapiProjektCheckResult> => {
      return cachedNapiCheck(typeof params?.videoPath === 'string' ? params.videoPath : '');
    }
  );

  ipcMain.handle(
    'napiprojekt:download',
    async (_event, params: NapiProjektDownloadParams): Promise<NapiProjektDownloadResult> => {
      const videoPath = typeof params?.videoPath === 'string' ? params.videoPath : '';
      const result = await loadNapiSrt(videoPath);
      if (!('srt' in result)) return { success: false, error: result.error };
      try {
        const outPath = join(
          dirname(videoPath),
          `${basename(videoPath, extname(videoPath))}.pl.srt`
        );
        await mkdir(dirname(outPath), { recursive: true });
        await writeFile(outPath, result.srt, 'utf-8');
        return { success: true, path: outPath, format: 'srt' };
      } catch (e) {
        logger.warn('napiprojekt', 'cannot save subtitles', e);
        return { success: false, error: String((e as Error)?.message ?? e) };
      }
    }
  );
}
