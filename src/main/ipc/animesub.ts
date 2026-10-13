import { ipcMain } from 'electron';
import { mkdir, writeFile } from 'fs/promises';
import { basename, dirname, extname, join } from 'path';
import { httpRequest } from './http-request';
import { readZip } from '../utils/zip';
import { isSafeAbsolutePath } from '../utils/validate';
import { logRequestOutcome } from '../utils/request-outcome';
import { logger } from '../../shared/logger';
import type {
  AnimeSubDownloadParams,
  AnimeSubDownloadResult,
  AnimeSubResult,
  AnimeSubSearchParams,
  AnimeSubSearchResult
} from '../../shared/types/animesub';

// AnimeSub.info (polskie napisy do anime). Strona działa TYLKO po HTTP i wymaga
// sesji: wyszukiwanie ustawia cookie, a pobranie to POST `sciagnij.php` z `id` + `sh`
// z TEJ SAMEJ sesji (inaczej „Błąd zabezpieczeń"). Odpowiedzią jest ZIP z plikami
// per odcinek. Zweryfikowane end-to-end.

const AS_URL = 'http://animesub.info';
const USER_AGENT = 'Mozilla/5.0 (compatible; Onda)';
const MAX_HTML_BYTES = 4 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const SUB_EXTS = ['.ass', '.srt', '.ssa', '.vtt', '.sub'];

/** Cookie z ostatniego wyszukiwania — `sh` jest ważne tylko w tej samej sesji. */
let sessionCookie = '';

function cookiesFrom(setCookie: string | string[] | undefined): string {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return list.map((c) => c.split(';')[0]).join('; ');
}

/** Odpowiedź czytamy bajtowo (latin1), więc treść dekodujemy z Windows-1250. */
function decodeCp1250(latin1Text: string): string {
  try {
    return new TextDecoder('windows-1250').decode(Buffer.from(latin1Text, 'latin1'));
  } catch (e) {
    logger.warn('animesub', 'windows-1250 decoder unavailable', e);
    return latin1Text;
  }
}

/**
 * Parsuje tabelę wyników. Jedna pozycja = jeden formularz `sciagnij.php`; tytuł to
 * OSTATNI wiersz `tr.KNap` przed formularzem (strona renderuje wpis w kilku wierszach).
 */
export function parseAnimeSubResults(html: string): AnimeSubResult[] {
  const parts = html.split(/<form[^>]*action="sciagnij\.php"[^>]*>/i);
  const results: AnimeSubResult[] = [];
  for (let i = 1; i < parts.length; i++) {
    const id = parts[i].match(/name="id"\s+value="(\d+)"/i)?.[1];
    const sh = parts[i].match(/name="sh"\s+value="([0-9a-f]+)"/i)?.[1];
    if (!id || !sh) continue;
    const titles = [
      ...parts[i - 1].matchAll(/<tr class="KNap">\s*<td align="left"[^>]*>([\s\S]*?)<\/td>/gi)
    ]
      .map((m) =>
        m[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/\s+/g, ' ')
          .trim()
      )
      .filter(Boolean);
    const title = titles[titles.length - 1];
    if (!title) continue;
    results.push({ id, sh, title, language: 'pl' });
  }
  return results;
}

/** Numer odcinka z nazwy pliku (`S01E07`, `ep7`, `E07`, samotna liczba 1–3 cyfry). */
export function episodeNumber(name: string): number | null {
  const base = basename(name);
  const m =
    base.match(/s\d{1,2}e(\d{1,3})/i) ||
    base.match(/\bep?\.?\s?(\d{1,3})\b/i) ||
    base.match(/\b(\d{1,3})\b/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/** Wybiera plik odcinka z archiwum; bez dopasowania bierze pierwszy. */
export function pickEpisodeFile<T extends { name: string }>(
  files: T[],
  videoName: string
): T | null {
  if (!files.length) return null;
  const episode = episodeNumber(videoName);
  if (episode !== null) {
    const re = new RegExp(`(^|[^0-9])0*${episode}([^0-9]|$)`);
    const match = files.find((f) => re.test(basename(f.name)));
    if (match) return match;
  }
  return files[0];
}

function subtitleExt(name: string): string {
  const ext = extname(name).toLowerCase();
  return SUB_EXTS.includes(ext) ? ext : '.srt';
}

async function saveSubtitle(
  videoPath: string,
  fileName: string,
  data: Buffer
): Promise<AnimeSubDownloadResult> {
  const ext = subtitleExt(fileName);
  const outPath = join(dirname(videoPath), `${basename(videoPath, extname(videoPath))}.pl${ext}`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, data);
  return { success: true, path: outPath, format: ext.slice(1) };
}

export function registerAnimeSubHandlers(): void {
  ipcMain.handle(
    'animesub:search',
    async (_event, params: AnimeSubSearchParams): Promise<AnimeSubSearchResult> => {
      const query = typeof params?.query === 'string' ? params.query.trim().slice(0, 200) : '';
      if (!query) return { success: false, results: [], error: 'missing-query' };
      try {
        const res = await httpRequest(
          `${AS_URL}/szukaj.php?szukane=${encodeURIComponent(query)}&wyslane=1`,
          {
            headers: { 'User-Agent': USER_AGENT },
            encoding: 'latin1',
            // Scalona wyszukiwarka czeka na wszystkich dostawców — krótki timeout, żeby
            // wolny AnimeSub nie opóźniał listy (jego wyniki po prostu odpadają).
            timeoutMs: 8000,
            maxBytes: MAX_HTML_BYTES
          }
        );
        sessionCookie = cookiesFrom(res.headers['set-cookie']);
        return { success: true, results: parseAnimeSubResults(decodeCp1250(res.text)) };
      } catch (e) {
        logRequestOutcome('animesub', 'search', e);
        return { success: false, results: [], error: String((e as Error)?.message ?? e) };
      }
    }
  );

  ipcMain.handle(
    'animesub:download',
    async (_event, params: AnimeSubDownloadParams): Promise<AnimeSubDownloadResult> => {
      const id = typeof params?.id === 'string' ? params.id.replace(/\D/g, '').slice(0, 12) : '';
      const sh =
        typeof params?.sh === 'string' ? params.sh.replace(/[^0-9a-f]/gi, '').slice(0, 64) : '';
      const videoPath = typeof params?.videoPath === 'string' ? params.videoPath : '';
      if (!id || !sh) return { success: false, error: 'invalid-request' };
      if (!videoPath || !isSafeAbsolutePath(videoPath)) {
        return { success: false, error: 'missing-file' };
      }
      if (!sessionCookie) return { success: false, error: 'no-session' };

      try {
        const body = `id=${id}&sh=${sh}&single_file=Pobierz+napisy`;
        const res = await httpRequest(`${AS_URL}/sciagnij.php`, {
          method: 'POST',
          headers: {
            'User-Agent': USER_AGENT,
            'Content-Type': 'application/x-www-form-urlencoded',
            Cookie: sessionCookie,
            Referer: `${AS_URL}/szukaj.php`
          },
          body,
          encoding: 'latin1',
          maxBytes: MAX_ARCHIVE_BYTES
        });
        const buf = Buffer.from(res.text, 'latin1');
        if (!buf.length) return { success: false, error: 'empty' };

        if (buf.subarray(0, 2).toString('latin1') !== 'PK') {
          // Nie-ZIP: traktuj jako pojedynczy plik napisów.
          const looksAss = buf.subarray(0, 64).toString('latin1').includes('[Script Info]');
          return await saveSubtitle(videoPath, looksAss ? 'x.ass' : 'x.srt', buf);
        }

        const files = readZip(buf).filter((e) => SUB_EXTS.includes(extname(e.name).toLowerCase()));
        const chosen = pickEpisodeFile(files, basename(videoPath));
        if (!chosen) return { success: false, error: 'no-subtitles' };
        return await saveSubtitle(videoPath, chosen.name, chosen.data);
      } catch (e) {
        logRequestOutcome('animesub', 'download', e);
        return { success: false, error: String((e as Error)?.message ?? e) };
      }
    }
  );
}
