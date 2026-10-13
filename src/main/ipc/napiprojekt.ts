import { createHash } from 'crypto';
import { ipcMain } from 'electron';
import { mkdir, open, writeFile } from 'fs/promises';
import { basename, dirname, extname, join } from 'path';
import { httpRequest } from './http-request';
import { isSafeAbsolutePath } from '../utils/validate';
import { logger } from '../../shared/logger';
import type {
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

export function registerNapiProjektHandlers(): void {
  ipcMain.handle(
    'napiprojekt:download',
    async (_event, params: NapiProjektDownloadParams): Promise<NapiProjektDownloadResult> => {
      try {
        const videoPath = typeof params?.videoPath === 'string' ? params.videoPath : '';
        if (!videoPath || !isSafeAbsolutePath(videoPath)) {
          return { success: false, error: 'missing-file' };
        }

        let hash: string;
        try {
          hash = await napiprojektHash(videoPath);
        } catch (e) {
          logger.warn('napiprojekt', `cannot hash ${videoPath}`, e);
          return { success: false, error: 'missing-file' };
        }

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
        if (res.text.startsWith('NPc0')) return { success: false, error: 'not-found' };

        const srt = parseNapiSubtitles(decodeNapiText(res.text));
        if (!srt) return { success: false, error: 'not-found' };

        const outPath = join(
          dirname(videoPath),
          `${basename(videoPath, extname(videoPath))}.pl.srt`
        );
        await mkdir(dirname(outPath), { recursive: true });
        await writeFile(outPath, srt, 'utf-8');
        return { success: true, path: outPath, format: 'srt' };
      } catch (e) {
        logger.warn('napiprojekt', 'download failed', e);
        const msg = (e as Error)?.message ?? String(e);
        return { success: false, error: /HTTP \d/.test(msg) ? 'network' : msg };
      }
    }
  );
}
