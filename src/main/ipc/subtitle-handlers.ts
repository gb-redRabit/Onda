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
        const outPath = join(getTempDir(), `sub_${uniqueId()}.ass`);
        await execAsync(
          `ffmpeg -v error -i "${filePath}" -map 0:${streamIndex} -c:s copy -y "${outPath}"`,
          { encoding: 'utf-8', timeout: 30000, windowsHide: true }
        );
        const content = await readFile(outPath, 'utf-8');
        await unlink(outPath).catch(() => {});
        return { content, format: 'ass' };
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
            return subExts.includes(ext) && basename(f, ext).startsWith(videoName);
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
      try {
        const { stdout } = await execAsync(
          `ffprobe -v quiet -show_entries stream=index,codec_type,codec_name:stream_tags=filename -of json "${filePath}"`,
          { encoding: 'utf-8', timeout: 15000, windowsHide: true }
        );
        const parsed = JSON.parse(stdout);
        const streams: Array<{ index: number; tags?: { filename?: string } }> = (
          parsed.streams || []
        ).filter((s: { codec_type?: string }) => s.codec_type === 'attachment');

        if (!streams.length) return [];

        const dumpDir = join(
          getTempDir(),
          `fonts_${Date.now()}_${Math.random().toString(36).slice(2)}`
        );
        await mkdir(dumpDir, { recursive: true });
        const fonts: Array<{ name: string; ext: string; data: number[] }> = [];
        try {
          const bin = await getMkvExtractPath();
          for (const [attId, s] of streams.entries()) {
            const fileName = s.tags?.filename || `font_${attId}.ttf`;
            const ext = (fileName.split('.').pop() || 'ttf').toLowerCase();
            const outPath = join(dumpDir, `att_${attId}.${ext}`);
            try {
              await execAsync(`"${bin}" "${filePath}" attachments ${attId}:"${outPath}"`, {
                encoding: 'utf-8',
                timeout: 30000,
                windowsHide: true
              });
              try {
                await stat(outPath);
                const buf = await readFile(outPath);
                fonts.push({
                  name: fileName.replace(/\.(ttf|otf|ttc)$/i, ''),
                  ext,
                  data: Array.from(buf)
                });
              } catch {
                /* file not created */
              }
            } catch {
              /* skip failed attachment */
            }
          }
        } catch (e: unknown) {
          const err = e as { message?: string };
          logger.error('attachments', 'mkvextract failed', err.message?.split('\n')[0] || e);
        }
        await rm(dumpDir, { recursive: true, force: true }).catch(() => {});

        return fonts;
      } catch (err) {
        logger.error('subtitles', 'extractAttachments failed', err);
        return [];
      }
    }
  );
}
