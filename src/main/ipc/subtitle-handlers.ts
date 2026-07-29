import { ipcMain } from 'electron';
import { readdir, readFile, mkdir, unlink, rm, stat } from 'fs/promises';
import { join, extname, basename } from 'path';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import { getTempDir } from './cover-cache';
import { getMkvExtractPath } from './dependency-handlers';
import { logger } from '../utils/logger';

const execAsync = promisify(execCb);

function uniqueId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function registerSubtitleHandlers(): void {
  ipcMain.handle(
    'subtitles:listEmbedded',
    async (
      _event,
      filePath: string
    ): Promise<Array<{ index: number; language: string; title: string; codec: string }>> => {
      try {
        const { stdout } = await execAsync(
          `ffprobe -v quiet -select_streams s -show_entries stream=index,codec_name:stream_tags=language,title -of json "${filePath}"`,
          { encoding: 'utf-8', timeout: 10000, windowsHide: true }
        );
        const parsed = JSON.parse(stdout);
        return (parsed.streams || []).map((s: Record<string, unknown>) => ({
          index: s.index as number,
          language: ((s.tags as Record<string, string>)?.language || 'und') as string,
          title: ((s.tags as Record<string, string>)?.title || '') as string,
          codec: (s.codec_name as string) || 'unknown'
        }));
      } catch {
        return [];
      }
    }
  );

  ipcMain.handle(
    'subtitles:extractEmbedded',
    async (
      _event,
      filePath: string,
      streamIndex: number
    ): Promise<{ content: string; format: string } | null> => {
      try {
        await mkdir(getTempDir(), { recursive: true });
        // detect codec to choose best output format
        const { stdout } = await execAsync(
          `ffprobe -v quiet -select_streams ${streamIndex} -show_entries stream=codec_name -of csv=p=0 "${filePath}"`,
          { encoding: 'utf-8', timeout: 10000, windowsHide: true }
        );
        const codec = stdout.trim().toLowerCase();
        const TEXT_CODECS = new Set(['subrip', 'ass', 'ssa', 'webvtt', 'mov_text']);
        const ext = (codec === 'ass' || codec === 'ssa') ? '.ass' : '.srt';
        const outPath = join(getTempDir(), `sub_${uniqueId()}${ext}`);

        if (TEXT_CODECS.has(codec)) {
          // text-based codec: try extract with native format first
          try {
            await execAsync(
              `ffmpeg -v error -i "${filePath}" -map 0:${streamIndex} -c:s copy -y "${outPath}"`,
              { encoding: 'utf-8', timeout: 30000, windowsHide: true }
            );
          } catch (e1) {
            logger.warn('subtitles', `copy failed for stream ${streamIndex} (${codec}), trying transcode`, (e1 as Error).message?.split('\n')[0]);
            // copy failed, try transcoding to srt
            const srtPath = join(getTempDir(), `sub_${uniqueId()}.srt`);
            await execAsync(
              `ffmpeg -v error -i "${filePath}" -map 0:${streamIndex} -c:s srt -y "${srtPath}"`,
              { encoding: 'utf-8', timeout: 30000, windowsHide: true }
            );
            const content = await readFile(srtPath, 'utf-8');
            await unlink(outPath).catch(() => {});
            await unlink(srtPath).catch(() => {});
            return { content, format: 'srt' };
          }
        } else {
          // binary codec (pgs, dvd_subtitle, etc): transcode to srt
          await execAsync(
            `ffmpeg -v error -i "${filePath}" -map 0:${streamIndex} -c:s srt -y "${outPath}"`,
            { encoding: 'utf-8', timeout: 30000, windowsHide: true }
          );
        }

        const content = await readFile(outPath, 'utf-8');
        await unlink(outPath).catch(() => {});
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
      try {
        const dir = videoPath.substring(
          0,
          videoPath.lastIndexOf('\\') !== -1
            ? videoPath.lastIndexOf('\\')
            : videoPath.lastIndexOf('/')
        );
        const videoName = basename(videoPath, extname(videoPath));
        const subExts = ['.srt', '.ass', '.ssa', '.vtt', '.sub'];
        const files = await readdir(dir);
        return files
          .filter((f) => {
            const ext = extname(f).toLowerCase();
            const baseName = basename(f, ext);
            return subExts.includes(ext) && (baseName === videoName || baseName.startsWith(videoName + '.'));
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

  ipcMain.handle('subtitles:readFile', async (_event, filePath: string): Promise<string | null> => {
    try {
      const buf = await readFile(filePath);
      const utf8 = buf.toString('utf-8');
      if (!utf8.includes('\ufffd')) return utf8;
      try {
        return buf.toString('latin1');
      } catch {
        return utf8;
      }
    } catch {
      return null;
    }
  });

  ipcMain.handle(
    'subtitles:extractAttachments',
    async (
      _event,
      filePath: string
    ): Promise<Array<{ name: string; ext: string; data: number[] }>> => {
      const dumpDir = join(
        getTempDir(),
        `fonts_${Date.now()}_${Math.random().toString(36).slice(2)}`
      );
      await mkdir(dumpDir, { recursive: true });
      const fonts: Array<{ name: string; ext: string; data: number[] }> = [];

      try {
        // list attachments via ffprobe
        let attachmentStreams: Array<{ index: number; filename: string }> = [];
        try {
          const { stdout } = await execAsync(
            `ffprobe -v quiet -show_entries stream=index,codec_type:stream_tags=filename -of json "${filePath}"`,
            { encoding: 'utf-8', timeout: 15000, windowsHide: true }
          );
          const parsed = JSON.parse(stdout);
          attachmentStreams = (parsed.streams || [])
            .filter((s: { codec_type?: string; tags?: { filename?: string } }) => s.codec_type === 'attachment' && s.tags?.filename)
            .map((s: { index: number; tags: { filename: string } }) => ({
              index: s.index,
              filename: s.tags.filename
            }));
        } catch (err) {
          logger.warn('attachments', 'ffprobe list failed', err);
        }

        if (!attachmentStreams.length) return [];

        // try mkvextract first
        let bin: string | null = null;
        try { bin = await getMkvExtractPath(); } catch { /* not available */ }

        let allOk = true;

        for (const [i, s] of attachmentStreams.entries()) {
          const ext = (s.filename.split('.').pop() || 'ttf').toLowerCase();
          const outPath = join(dumpDir, `att_${i}.${ext}`);

          if (bin) {
            try {
              await execAsync(`"${bin}" "${filePath}" attachments ${i}:"${outPath}"`, {
                encoding: 'utf-8',
                timeout: 30000,
                windowsHide: true
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
          // fallback: dump all attachments via ffmpeg
          try {
            await execAsync(
              `ffmpeg -v error -y -dump_attachment "" -i "${filePath}" -f null -`,
              { encoding: 'utf-8', timeout: 30000, windowsHide: true, cwd: dumpDir }
            );
          } catch (e2) {
          }
        }

        // read all dumped files
        const dumped = await readdir(dumpDir);
        const seen = new Set<string>();
        for (const fname of dumped) {
          if (seen.has(fname)) continue;
          seen.add(fname);
          const fpath = join(dumpDir, fname);
          try {
            await stat(fpath);
            const buf = await readFile(fpath);
            fonts.push({
              name: fname.replace(/\.(ttf|otf|ttc)$/i, ''),
              ext: (fname.split('.').pop() || 'ttf').toLowerCase(),
              data: Array.from(buf)
            });
          } catch { /* skip unreadable */ }
        }
      } catch (err) {
        logger.error('subtitles', 'extractAttachments failed', err);
      } finally {
        await rm(dumpDir, { recursive: true, force: true }).catch(() => {});
      }

      return fonts;
    }
  );
}
