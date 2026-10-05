import { ipcMain } from 'electron';
import { readdir, readFile, mkdir, unlink, rm, stat, realpath } from 'fs/promises';
import { join, extname, basename, dirname, sep } from 'path';
import { getTempDir } from './cover/cover-cache';
import { resolveBin } from '../binaries';
import { logger } from '../../shared/logger';
import { runCommand } from '../utils/exec';
import { isNonNegativeInt } from '../../shared/helpers';
import { isSafeAbsolutePath } from '../utils/validate';
import {
  readTextFileWithinBounds,
  SUBTITLE_EXTS,
  SUBTITLE_MAX_BYTES
} from '../utils/read-text-file';

function uniqueId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Prosty semafor: te kanały spawnują ffprobe/ffmpeg, więc przejęty renderer mógł
// nimi zalewać system procesami. Limit współbieżności jest globalny (nie per okno),
// bo zasobem jest proces, nie wywołujący.
const MAX_SUBTITLE_PROCS = 4;
let subtitleProcs = 0;
const subtitleWaiters: Array<() => void> = [];

async function withSubtitleSlot<T>(task: () => Promise<T>): Promise<T> {
  if (subtitleProcs >= MAX_SUBTITLE_PROCS) {
    await new Promise<void>((resolve) => subtitleWaiters.push(resolve));
  }
  subtitleProcs++;
  try {
    return await task();
  } finally {
    subtitleProcs--;
    const next = subtitleWaiters.shift();
    if (next) next();
  }
}

/** Rejestruje handler spawnujący procesy pod globalnym limitem współbieżności. */
function handleSpawnSubtitle<A extends unknown[], R>(
  channel: string,
  listener: (event: Electron.IpcMainInvokeEvent, ...args: A) => Promise<R>
): void {
  ipcMain.handle(channel, (event, ...args) =>
    withSubtitleSlot(() => listener(event, ...(args as A)))
  );
}

// Załączniki-czcionki są wczytywane w całości do pamięci i wysyłane przez IPC.
// Bez limitu jeden plik MKV mógł wcisnąć setki MB do structured clone.
const MAX_FONT_BYTES = 25 * 1024 * 1024;
const MAX_FONTS_TOTAL_BYTES = 100 * 1024 * 1024;

// Nazwy plików załączników w metadanych MKV są kontrolowane przez autora —
// rozszerzeniu nie można ufać (może zawierać separatory ścieżki / traversal).
const FONT_EXTS = new Set(['ttf', 'otf', 'ttc', 'woff', 'woff2', 'eot']);
function safeFontExt(filename: string, fallback: string = 'ttf'): string {
  const last = (filename.split('.').pop() || '').toLowerCase();
  return FONT_EXTS.has(last) ? last : fallback;
}

export function registerSubtitleHandlers(): void {
  handleSpawnSubtitle(
    'subtitles:listEmbedded',
    async (
      _event,
      filePath: string
    ): Promise<Array<{ index: number; language: string; title: string; codec: string }>> => {
      if (!isSafeAbsolutePath(filePath)) return [];
      try {
        const ffprobe = (await resolveBin('ffprobe')) || 'ffprobe';
        const stdout = await runCommand(
          ffprobe,
          [
            '-v',
            'quiet',
            '-select_streams',
            's',
            '-show_entries',
            'stream=index,codec_name:stream_tags=language,title',
            '-of',
            'json',
            '--',
            filePath
          ],
          { timeout: 10000 }
        );
        const parsed = JSON.parse(stdout);
        return (parsed.streams || []).map((s: Record<string, unknown>) => ({
          index: s.index as number,
          language: ((s.tags as Record<string, string>)?.language || 'und') as string,
          title: ((s.tags as Record<string, string>)?.title || '') as string,
          codec: (s.codec_name as string) || 'unknown'
        }));
      } catch (err) {
        logger.warn('subtitles', `listEmbedded ffprobe failed for ${filePath}`, err);
        return [];
      }
    }
  );

  handleSpawnSubtitle(
    'subtitles:extractEmbedded',
    async (
      _event,
      filePath: string,
      streamIndex: number
    ): Promise<{ content: string; format: string } | null> => {
      if (!isSafeAbsolutePath(filePath)) return null;
      try {
        if (!isNonNegativeInt(streamIndex)) return null;
        await mkdir(getTempDir(), { recursive: true });
        // wykryj kodek, aby wybrać najlepszy format wyjściowy
        const ffprobe = (await resolveBin('ffprobe')) || 'ffprobe';
        const stdout = await runCommand(
          ffprobe,
          [
            '-v',
            'quiet',
            '-select_streams',
            String(streamIndex),
            '-show_entries',
            'stream=codec_name',
            '-of',
            'csv=p=0',
            '--',
            filePath
          ],
          { timeout: 10000 }
        );
        const codec = stdout.trim().toLowerCase();
        const TEXT_CODECS = new Set(['subrip', 'ass', 'ssa', 'webvtt', 'mov_text']);
        const ext = codec === 'ass' || codec === 'ssa' ? '.ass' : '.srt';
        const outPath = join(getTempDir(), `sub_${uniqueId()}${ext}`);
        const ffmpeg = (await resolveBin('ffmpeg')) || 'ffmpeg';

        if (TEXT_CODECS.has(codec)) {
          // kodek tekstowy: najpierw spróbuj wyodrębnić w natywnym formacie
          try {
            await runCommand(
              ffmpeg,
              [
                '-v',
                'error',
                '-i',
                filePath,
                '-map',
                `0:${streamIndex}`,
                '-c:s',
                'copy',
                '-y',
                outPath
              ],
              { timeout: 30000 }
            );
          } catch (e1) {
            logger.warn(
              'subtitles',
              `copy failed for stream ${streamIndex} (${codec}), trying transcode`,
              (e1 as Error).message?.split('\n')[0]
            );
            // kopiowanie nie powiodło się, spróbuj transkodować do srt
            const srtPath = join(getTempDir(), `sub_${uniqueId()}.srt`);
            await runCommand(
              ffmpeg,
              [
                '-v',
                'error',
                '-i',
                filePath,
                '-map',
                `0:${streamIndex}`,
                '-c:s',
                'srt',
                '-y',
                srtPath
              ],
              { timeout: 30000 }
            );
            const content = await readFile(srtPath, 'utf-8');
            await unlink(outPath).catch(() => {
              /* best-effort */
            });
            await unlink(srtPath).catch(() => {
              /* best-effort */
            });
            return { content, format: 'srt' };
          }
        } else {
          // kodek binarny (pgs, dvd_subtitle itp.): transkoduj do srt
          await runCommand(
            ffmpeg,
            [
              '-v',
              'error',
              '-i',
              filePath,
              '-map',
              `0:${streamIndex}`,
              '-c:s',
              'srt',
              '-y',
              outPath
            ],
            { timeout: 30000 }
          );
        }

        const content = await readFile(outPath, 'utf-8');
        await unlink(outPath).catch(() => {
          /* best-effort */
        });
        return { content, format: ext.slice(1) };
      } catch (err) {
        logger.error('subtitles', 'extractEmbedded failed', err);
        return null;
      }
    }
  );

  ipcMain.handle(
    'subtitles:findExternal',
    async (
      _event,
      videoPath: string
    ): Promise<Array<{ name: string; path: string; format: string }>> => {
      if (!isSafeAbsolutePath(videoPath)) return [];
      try {
        const dir = dirname(videoPath);
        const videoName = basename(videoPath, extname(videoPath));
        const subExts = ['.srt', '.ass', '.ssa', '.vtt', '.sub'];
        const files = await readdir(dir);
        return files
          .filter((f) => {
            const ext = extname(f).toLowerCase();
            const baseName = basename(f, ext);
            return (
              subExts.includes(ext) &&
              (baseName === videoName || baseName.startsWith(videoName + '.'))
            );
          })
          .map((f) => ({
            name: f,
            path: join(dir, f),
            format: extname(f).toLowerCase().slice(1)
          }));
      } catch {
        return [];
      }
    }
  );

  // Zwraca zawartość pliku do renderera, więc ścieżka jest ograniczona do rozszerzeń
  // napisów i pułapu rozmiaru — inaczej ten kanał czytałby dowolny plik, jaki może
  // otworzyć proces main (cookies sesji, konfiguracja, klucze).
  ipcMain.handle('subtitles:readFile', async (_event, filePath: string): Promise<string | null> => {
    const result = await readTextFileWithinBounds(
      filePath,
      SUBTITLE_EXTS,
      SUBTITLE_MAX_BYTES,
      'subtitles'
    );
    return result.ok ? result.text : null;
  });

  handleSpawnSubtitle(
    'subtitles:extractAttachments',
    async (
      _event,
      filePath: string
    ): Promise<Array<{ name: string; ext: string; data: number[] }>> => {
      if (!isSafeAbsolutePath(filePath)) return [];
      const dumpDir = join(
        getTempDir(),
        `fonts_${Date.now()}_${Math.random().toString(36).slice(2)}`
      );
      await mkdir(dumpDir, { recursive: true });
      const fonts: Array<{ name: string; ext: string; data: number[] }> = [];

      try {
        // wylistuj załączniki przez ffprobe
        let attachmentStreams: Array<{ index: number; filename: string }> = [];
        try {
          const ffprobe = (await resolveBin('ffprobe')) || 'ffprobe';
          const stdout = await runCommand(
            ffprobe,
            [
              '-v',
              'quiet',
              '-show_entries',
              'stream=index,codec_type:stream_tags=filename',
              '-of',
              'json',
              '--',
              filePath
            ],
            { timeout: 15000 }
          );
          const parsed = JSON.parse(stdout);
          attachmentStreams = (parsed.streams || [])
            .filter(
              (s: { codec_type?: string; tags?: { filename?: string } }) =>
                s.codec_type === 'attachment' && s.tags?.filename
            )
            .map((s: { index: number; tags: { filename: string } }) => ({
              index: s.index,
              filename: s.tags.filename
            }));
        } catch (err) {
          logger.warn('attachments', 'ffprobe list failed', err);
        }

        if (!attachmentStreams.length) return [];

        // najpierw spróbuj mkvextract
        let bin: string | null = null;
        try {
          bin = await resolveBin('mkvextract');
        } catch (e) {
          logger.warn('subtitles', 'mkvextract unavailable', e);
        }

        let allOk = true;

        for (const [i, s] of attachmentStreams.entries()) {
          const ext = safeFontExt(s.filename);
          const outPath = join(dumpDir, `att_${i}.${ext}`);

          if (bin) {
            try {
              // mkvextract numeruje załączniki od 1
              await runCommand(bin, [filePath, 'attachments', `${i + 1}:${outPath}`], {
                timeout: 30000
              });
              await stat(outPath);
            } catch {
              allOk = false;
            }
          } else {
            allOk = false;
          }
        }

        if (!allOk) {
          const ffmpeg = (await resolveBin('ffmpeg')) || 'ffmpeg';
          const args: string[] = ['-v', 'error', '-y'];
          for (const [i, s] of attachmentStreams.entries()) {
            const ext = safeFontExt(s.filename);
            args.push(`-dump_attachment:${s.index}`, `att_${i}.${ext}`);
          }
          // załączniki są w nagłówku kontenera; -t 0.001 zatrzymuje ffmpeg zaraz
          // po odczytaniu nagłówka, zamiast demuksować cały plik
          args.push('-t', '0.001', '-i', filePath, '-f', 'null', '-');
          try {
            await runCommand(ffmpeg, args, { timeout: 30000, cwd: dumpDir });
          } catch (e) {
            logger.warn('subtitles', `ffmpeg attachment dump failed for ${filePath}`, e);
          }
        }

        // odczytaj wszystkie zrzucone pliki (tylko te faktycznie wewnątrz dumpDir)
        const realDumpDir = await realpath(dumpDir);
        const dumped = await readdir(dumpDir);
        const seen = new Set<string>();
        let totalBytes = 0;
        for (const fname of dumped) {
          if (seen.has(fname)) continue;
          seen.add(fname);
          const fpath = join(dumpDir, fname);
          try {
            const real = await realpath(fpath);
            if (real !== realDumpDir && !real.startsWith(realDumpDir + sep)) continue;
            const info = await stat(fpath);
            // Pomiń pojedyncze zbyt duże czcionki i przestań po globalnym budżecie —
            // dane lecą w całości przez structured clone do renderera.
            if (info.size > MAX_FONT_BYTES || totalBytes + info.size > MAX_FONTS_TOTAL_BYTES) {
              logger.warn('subtitles', `skipping oversized attachment ${fname} (${info.size}b)`);
              continue;
            }
            const buf = await readFile(fpath);
            totalBytes += buf.length;
            const ext = safeFontExt(fname);
            fonts.push({
              name: fname.replace(/\.(ttf|otf|ttc)$/i, ''),
              ext,
              data: Array.from(buf)
            });
          } catch {
            /* pomiń nieczytelne */
          }
        }
      } catch (err) {
        logger.error('subtitles', 'extractAttachments failed', err);
      } finally {
        await rm(dumpDir, { recursive: true, force: true }).catch(() => {
          /* best-effort */
        });
      }

      return fonts;
    }
  );
}
