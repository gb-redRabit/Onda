import { ipcMain } from 'electron';
import { mkdir, stat, writeFile } from 'fs/promises';
import { basename, dirname, extname, join } from 'path';
import { resolveBin } from '../../binaries';
import { runCommand } from '../../utils/exec';
import { isSafeAbsolutePath } from '../../utils/validate';
import { logger } from '../../../shared/logger';

// Przewijanie klatka po klatce i zrzut klatki. fps czytamy z ffprobe (raz na plik,
// z cache), a PNG rysuje renderer i przysyła bajty — main tylko zapisuje obok wideo.

const FPS_FALLBACK = 25;
const FPS_CACHE_MAX = 500;

/** Parsuje `r_frame_rate`/`avg_frame_rate` ffprobe (`24000/1001`, `30/1`, `25`) na fps. */
export function parseFrameRate(value: string): number {
  const raw = (value || '').trim();
  if (!raw) return 0;
  const [num, den] = raw.split('/');
  const n = Number(num);
  const d = den === undefined ? 1 : Number(den);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0 || n <= 0) return 0;
  return n / d;
}

/** `HH-MM-SS` z sekund — czytelny znacznik czasu w nazwie pliku. */
export function timecode(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}-${pad(Math.floor((total % 3600) / 60))}-${pad(total % 60)}`;
}

const fpsCache = new Map<string, { fps: number; mtimeMs: number }>();

export async function getVideoFps(filePath: string): Promise<number> {
  try {
    const s = await stat(filePath);
    const cached = fpsCache.get(filePath);
    if (cached && cached.mtimeMs >= s.mtimeMs) return cached.fps;

    const ffprobe = (await resolveBin('ffprobe')) || 'ffprobe';
    const stdout = await runCommand(
      ffprobe,
      [
        '-v',
        'quiet',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=r_frame_rate,avg_frame_rate',
        '-of',
        'csv=p=0',
        '--',
        filePath
      ],
      { timeout: 10000 }
    );
    // csv=p=0 → np. "24000/1001,24000/1001"
    const [rate, avg] = stdout.trim().split(',');
    const fps = parseFrameRate(rate ?? '') || parseFrameRate(avg ?? '') || FPS_FALLBACK;
    fpsCache.set(filePath, { fps, mtimeMs: s.mtimeMs });
    if (fpsCache.size > FPS_CACHE_MAX) {
      const oldest = fpsCache.keys().next();
      if (!oldest.done) fpsCache.delete(oldest.value);
    }
    return fps;
  } catch (e) {
    logger.warn('media', `fps probe failed for ${filePath}`, e);
    return FPS_FALLBACK;
  }
}

/** Zapisuje bajty PNG obok wideo jako `<base>.frame-<HH-MM-SS>.png`. */
export async function saveVideoScreenshot(
  videoPath: string,
  data: number[],
  timeSec: number
): Promise<string | null> {
  if (!isSafeAbsolutePath(videoPath) || !Array.isArray(data) || data.length === 0) return null;
  const buf = Buffer.from(data);
  const base = basename(videoPath, extname(videoPath));
  const outPath = join(dirname(videoPath), `${base}.frame-${timecode(timeSec)}.png`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, buf);
  return outPath;
}

export function registerMediaFrameHandlers(): void {
  ipcMain.handle('media:getVideoFps', async (_event, filePath: string): Promise<number> => {
    if (!isSafeAbsolutePath(filePath)) return 0;
    return getVideoFps(filePath);
  });

  ipcMain.handle(
    'media:saveScreenshot',
    async (
      _event,
      videoPath: string,
      data: number[],
      timeSec: number
    ): Promise<{ success: boolean; path?: string; error?: string }> => {
      try {
        const path = await saveVideoScreenshot(
          videoPath,
          data,
          typeof timeSec === 'number' ? timeSec : 0
        );
        return path ? { success: true, path } : { success: false, error: 'invalid-request' };
      } catch (e) {
        logger.warn('media', 'saveScreenshot failed', e);
        return { success: false, error: String((e as Error)?.message ?? e) };
      }
    }
  );
}
