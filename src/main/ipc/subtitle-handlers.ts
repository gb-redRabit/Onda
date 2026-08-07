import { ipcMain } from 'electron';
import { readdir, readFile, mkdir, unlink, rm, stat, realpath } from 'fs/promises';
import { join, extname, basename, dirname, sep } from 'path';
import { getTempDir } from './cover-cache';
import { resolveBin } from '../binaries';
import { logger } from '../../shared/logger';
import { runCommand } from '../utils/exec';
import { isNonNegativeInt } from '../../shared/helpers';

function uniqueId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Attachment filenames in MKV metadata are controlled by the author — the
// extension must not be trusted (it can contain path separators / traversal).
const FONT_EXTS = new Set(['ttf', 'otf', 'ttc', 'woff', 'woff2', 'eot']);
function safeFontExt(filename: string, fallback: string = 'ttf'): string {
  const last = (filename.split('.').pop() || '').toLowerCase();
  return FONT_EXTS.has(last) ? last : fallback;
}

export function registerSubtitleHandlers(): void {
  ipcMain.handle(
    'subtitles:listEmbedded',
    async (
      _event,
      filePath: string
    ): Promise<Array<{ index: number; language: string; title: string; codec: string }>> => {
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

  ipcMain.handle(
    'subtitles:extractEmbedded',
    async (
      _event,
      filePath: string,
      streamIndex: number
    ): Promise<{ content: string; format: string } | null> => {
      try {
        if (!isNonNegativeInt(streamIndex)) return null;
        await mkdir(getTempDir(), { recursive: true });
        // detect codec to choose best output format
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
          // text-based codec: try extract with native format first
          try {
            await runCommand(
              ffmpeg,
              ['-v', 'error', '-i', filePath, '-map', `0:${streamIndex}`, '-c:s', 'copy', '-y', outPath],
              { timeout: 30000 }
            );
          } catch (e1) {
            logger.warn(
              'subtitles',
              `copy failed for stream ${streamIndex} (${codec}), trying transcode`,
              (e1 as Error).message?.split('\n')[0]
            );
            // copy failed, try transcoding to srt
            const srtPath = join(getTempDir(), `sub_${uniqueId()}.srt`);
            await runCommand(
              ffmpeg,
              ['-v', 'error', '-i', filePath, '-map', `0:${streamIndex}`, '-c:s', 'srt', '-y', srtPath],
              { timeout: 30000 }
            );
            const content = await readFile(srtPath, 'utf-8');
            await unlink(outPath).catch(() => {});
            await unlink(srtPath).catch(() => {});
            return { content, format: 'srt' };
          }
        } else {
          // binary codec (pgs, dvd_subtitle, etc): transcode to srt
          await runCommand(
            ffmpeg,
            ['-v', 'error', '-i', filePath, '-map', `0:${streamIndex}`, '-c:s', 'srt', '-y', outPath],
            { timeout: 30000 }
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

        // try mkvextract first
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
              // mkvextract numbers attachments starting from 1
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
          // attachments live in the container header; -t 0.001 stops ffmpeg right
          // after the header is read instead of demuxing the whole file
          args.push('-t', '0.001', '-i', filePath, '-f', 'null', '-');
          try {
            await runCommand(ffmpeg, args, { timeout: 30000, cwd: dumpDir });
          } catch (e) {
            logger.warn('subtitles', `ffmpeg attachment dump failed for ${filePath}`, e);
          }
        }

        // read all dumped files (only ones actually inside dumpDir)
        const realDumpDir = await realpath(dumpDir);
        const dumped = await readdir(dumpDir);
        const seen = new Set<string>();
        for (const fname of dumped) {
          if (seen.has(fname)) continue;
          seen.add(fname);
          const fpath = join(dumpDir, fname);
          try {
            const real = await realpath(fpath);
            if (real !== realDumpDir && !real.startsWith(realDumpDir + sep)) continue;
            await stat(fpath);
            const buf = await readFile(fpath);
            const ext = safeFontExt(fname);
            fonts.push({
              name: fname.replace(/\.(ttf|otf|ttc)$/i, ''),
              ext,
              data: Array.from(buf)
            });
          } catch {
            /* skip unreadable */
          }
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
