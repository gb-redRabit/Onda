import { ipcMain, dialog, BrowserWindow, shell, app } from 'electron';
import { readdir, stat, readFile, writeFile, mkdir, rename, unlink, rm } from 'fs/promises';
import { statSync, readFileSync } from 'fs';
import { join, extname, basename } from 'path';
import { execSync, exec as execCb, spawnSync } from 'child_process';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import type { FileItem } from '../../renderer/src/types/explorer';
import { promisify } from 'util';
import https from 'https';
import http from 'http';
import os from 'os';

const execAsync = promisify(execCb);

const VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.webm', '.mov', '.wmv', '.flv', '.m4v', '.ts', '.ogv'];
const AUDIO_EXTS = [
  '.mp3',
  '.flac',
  '.wav',
  '.ogg',
  '.aac',
  '.m4a',
  '.wma',
  '.opus',
  '.aiff',
  '.alac'
];

function getTempDir(): string {
  return join(os.tmpdir(), 'onda-covers');
}

async function extractVideoFrame(filePath: string, time = '00:00:00.5'): Promise<string | null> {
  try {
    await mkdir(getTempDir(), { recursive: true });
    const outPath = join(getTempDir(), `frame_${Date.now()}.jpg`);
    await execAsync(
      `ffmpeg -v quiet -ss ${time} -i "${filePath}" -vframes 1 -q:v 2 -update 1 "${outPath}" -y`,
      { encoding: 'utf-8', timeout: 15000, windowsHide: true }
    );
    const buf = await readFile(outPath);
    await unlink(outPath).catch(() => {});
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

async function extractEmbeddedCover(filePath: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -select_streams v:0 -show_entries stream=codec_type -of csv=p=0 "${filePath}"`,
      { encoding: 'utf-8', timeout: 10000, windowsHide: true }
    );
    if (stdout.trim() !== 'video') return null;
    await mkdir(getTempDir(), { recursive: true });
    const outPath = join(getTempDir(), `cover_${Date.now()}.jpg`);
    await execAsync(`ffmpeg -v quiet -i "${filePath}" -vframes 1 -q:v 2 -update 1 "${outPath}" -y`, {
      encoding: 'utf-8',
      timeout: 15000,
      windowsHide: true
    });
    const buf = await readFile(outPath);
    await unlink(outPath).catch(() => {});
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client
      .get(url, { headers: { 'User-Agent': 'Onda/1.0' } }, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          downloadFile(res.headers.location, dest).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const file = createWriteStream(dest);
        pipeline(res, file).then(resolve).catch(reject);
      })
      .on('error', reject);
  });
}

function getWindowsDrives(): FileItem[] {
  const fallback = [
    {
      name: 'C:',
      path: 'C:',
      isDirectory: true,
      size: 0,
      modifiedAt: Date.now(),
      createdAt: Date.now(),
      extension: '',
      mimeType: undefined
    }
  ];
  try {
    const cmd =
      'powershell.exe -NoProfile -NonInteractive -Command "Get-PSDrive -PSProvider FileSystem | Select-Object Name,Root,Free,Used | ConvertTo-Json -Compress"';
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 10000, windowsHide: true });
    if (!output || !output.trim()) return fallback;
    let parsed: any[];
    try {
      parsed = JSON.parse(output.trim());
    } catch {
      return fallback;
    }
    if (!Array.isArray(parsed)) parsed = [parsed];
    return parsed
      .filter((d) => d && d.Name)
      .map((d) => {
        const name: string = d.Name;
        const used: number = d.Used || 0;
        const free: number = d.Free || 0;
        return {
          name: `${name}:`,
          path: `${name}:`,
          isDirectory: true,
          size: used + free,
          modifiedAt: Date.now(),
          createdAt: Date.now(),
          extension: '',
          mimeType: undefined
        };
      });
  } catch {
    return fallback;
  }
}

function getFileItem(fullPath: string, stats: import('fs').Stats, name: string): FileItem {
  return {
    name,
    path: fullPath,
    isDirectory: stats.isDirectory(),
    size: stats.size,
    modifiedAt: stats.mtimeMs,
    createdAt: stats.birthtimeMs,
    extension: extname(name).toLowerCase(),
    mimeType: undefined
  };
}

export function registerIPC(): void {
  ipcMain.handle('fs:getDrives', (): FileItem[] => {
    return getWindowsDrives();
  });

  ipcMain.handle('fs:readdir', async (_event, dirPath: string): Promise<FileItem[]> => {
    if (!dirPath || dirPath === '/') {
      return getWindowsDrives();
    }
    const resolvedPath = /^[A-Z]:$/i.test(dirPath) ? `${dirPath}\\` : dirPath;
    const entries = await readdir(resolvedPath, { withFileTypes: true });
    const items: FileItem[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      try {
        const fullPath = join(resolvedPath, entry.name);
        const stats = await stat(fullPath);
        items.push(getFileItem(fullPath, stats, entry.name));
      } catch {
        // skip inaccessible files
      }
    }
    return items;
  });

  ipcMain.handle('fs:stat', async (_event, filePath: string) => {
    const s = await stat(filePath);
    return {
      size: s.size,
      modifiedAt: s.mtimeMs,
      createdAt: s.birthtimeMs,
      isDirectory: s.isDirectory()
    };
  });

  ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
    const buf = await readFile(filePath);
    return buf.toString('base64');
  });

  ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
    await writeFile(filePath, Buffer.from(content, 'base64'));
    return true;
  });

  ipcMain.handle('fs:mkdir', async (_event, dirPath: string) => {
    await mkdir(dirPath, { recursive: true });
    return true;
  });

  ipcMain.handle('fs:rename', async (_event, oldPath: string, newPath: string) => {
    await rename(oldPath, newPath);
    return true;
  });

  ipcMain.handle('fs:delete', async (_event, filePath: string) => {
    const s = await stat(filePath);
    if (s.isDirectory()) {
      await rm(filePath, { recursive: true, force: true });
    } else {
      await unlink(filePath);
    }
    return true;
  });

  ipcMain.handle('dialog:openFile', async (_event, options?: Electron.OpenDialogOptions) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { canceled: true, filePaths: [] };
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Media Files',
          extensions: [
            'mp3',
            'flac',
            'wav',
            'ogg',
            'aac',
            'm4a',
            'mp4',
            'mkv',
            'avi',
            'webm',
            'mov'
          ]
        },
        { name: 'All Files', extensions: ['*'] }
      ],
      ...options
    });
    return result;
  });

  ipcMain.handle('dialog:openFolder', async (_event, options?: Electron.OpenDialogOptions) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { canceled: true, filePaths: [] };
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      ...options
    });
    return result;
  });

  ipcMain.handle('dialog:openFolderFiles', async (_event) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { canceled: true, filePaths: [] };
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths.length) {
      return { canceled: true, filePaths: [] as string[] };
    }
    const folder = result.filePaths[0];
    const mediaExts = [...VIDEO_EXTS, ...AUDIO_EXTS];
    let entries: string[] = [];
    try {
      const dirEntries = await readdir(folder);
      entries = dirEntries
        .filter((f) => mediaExts.includes(extname(f).toLowerCase()))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map((f) => join(folder, f));
    } catch {
      entries = [];
    }
    return { canceled: false, filePaths: entries };
  });

  const playbackPositions = new Map<string, number>();

  ipcMain.handle('playback:getPosition', (_event, filePath: string): number => {
    return playbackPositions.get(filePath) || 0;
  });

  ipcMain.handle('playback:setPosition', (_event, filePath: string, position: number): void => {
    if (position > 0) playbackPositions.set(filePath, position);
    else playbackPositions.delete(filePath);
  });

  ipcMain.handle('playback:clearPosition', (_event, filePath: string): void => {
    playbackPositions.delete(filePath);
  });

  ipcMain.handle('dialog:saveFile', async (_event, options?: Electron.SaveDialogOptions) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { canceled: true, filePath: '' };
    const result = await dialog.showSaveDialog(win, {
      filters: [
        { name: 'Media Files', extensions: ['mp3', 'flac', 'mp4', 'mkv'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      ...options
    });
    return result;
  });

  ipcMain.handle('window:minimize', () => {
    BrowserWindow.getFocusedWindow()?.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
  });

  ipcMain.handle('window:close', () => {
    BrowserWindow.getFocusedWindow()?.close();
  });

  ipcMain.handle('window:isMaximized', () => {
    return BrowserWindow.getFocusedWindow()?.isMaximized() ?? false;
  });

  ipcMain.handle('window:setAlwaysOnTop', (_event, flag: boolean) => {
    BrowserWindow.getFocusedWindow()?.setAlwaysOnTop(flag);
  });

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    await shell.openExternal(url);
  });

  ipcMain.handle('shell:showItemInFolder', (_event, fullPath: string) => {
    shell.showItemInFolder(fullPath);
  });

  ipcMain.handle('app:getPath', (_event, name: string) => {
    return app.getPath(name as any);
  });

  ipcMain.handle('app:getVersion', () => {
    return app.getVersion();
  });

  ipcMain.handle('settings:get', async () => {
    try {
      const Store = (await import('electron-store')).default;
      const store = new Store();
      return store.store || {};
    } catch {
      return {};
    }
  });

  ipcMain.handle('settings:set', async (_event, data: Record<string, unknown>) => {
    try {
      const Store = (await import('electron-store')).default;
      const store = new Store();
      for (const [key, value] of Object.entries(data)) {
        store.set(key, value);
      }
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('media:getMetadata', async (_event, filePath: string) => {
    try {
      const s = await stat(filePath);
      const ext = extname(filePath).toLowerCase();
      const isVideo = ['.mp4', '.mkv', '.avi', '.webm', '.mov', '.wmv', '.flv', '.m4v'].includes(
        ext
      );
      return {
        title: basename(filePath, ext),
        artist: '',
        album: '',
        duration: 0,
        bitrate: 0,
        sampleRate: 0,
        channels: 0,
        format: ext.slice(1),
        isVideo,
        size: s.size
      };
    } catch {
      return null;
    }
  });

  ipcMain.handle('media:getThumbnail', async (_event, _filePath: string) => {
    return null;
  });

  ipcMain.handle('yt:search', async (_event, _query: string) => {
    return { items: [], nextPageToken: null };
  });

  ipcMain.handle('yt:getInfo', async (_event, _videoId: string) => {
    return null;
  });

  ipcMain.handle('yt:download', async (_event, _url: string, _format: string) => {
    return { success: false, error: 'yt-dlp not installed' };
  });

  ipcMain.handle('yt:getChannel', async (_event, _channelId: string) => {
    return null;
  });

  ipcMain.handle('update:check', async () => {
    return { available: false, version: app.getVersion(), notes: '' };
  });

  ipcMain.handle('update:download', async () => {
    return { success: false };
  });

  ipcMain.handle('update:install', async () => {
    app.relaunch();
    app.exit(0);
  });

  ipcMain.handle('dep:checkFfmpeg', async () => {
    try {
      const output = execSync('ffmpeg -version', {
        encoding: 'utf-8',
        timeout: 10000,
        windowsHide: true
      });
      const match = output.match(/ffmpeg version (\S+)/);
      return { installed: true, version: match ? match[1] : 'unknown' };
    } catch {
      return { installed: false, version: null };
    }
  });

  ipcMain.handle('dep:checkYtdlp', async () => {
    try {
      const localBin = join(app.getPath('userData'), 'bin', 'yt-dlp.exe');
      try {
        await stat(localBin);
        const output = execSync(`"${localBin}" --version`, {
          encoding: 'utf-8',
          timeout: 10000,
          windowsHide: true
        });
        return { installed: true, version: output.trim(), path: localBin };
      } catch {
        // not in local bin
      }
      const output = execSync('yt-dlp --version', {
        encoding: 'utf-8',
        timeout: 10000,
        windowsHide: true
      });
      return { installed: true, version: output.trim(), path: 'yt-dlp' };
    } catch {
      return { installed: false, version: null, path: null };
    }
  });

  ipcMain.handle('dep:checkFfprobe', async () => {
    try {
      const output = execSync('ffprobe -version', {
        encoding: 'utf-8',
        timeout: 10000,
        windowsHide: true
      });
      const match = output.match(/ffprobe version (\S+)/);
      return { installed: true, version: match ? match[1] : 'unknown' };
    } catch {
      return { installed: false, version: null };
    }
  });

  ipcMain.handle('dep:installFfmpeg', async () => {
    try {
      const { stdout, stderr } = await execAsync('choco install ffmpeg -y --no-progress', {
        timeout: 300000,
        windowsHide: true
      });
      return { success: true, output: stdout + stderr };
    } catch (e: any) {
      const msg = e.stderr || e.stdout || e.message || 'Nieznany błąd';
      if (msg.includes('requires elevated permissions') || msg.includes('elevation required')) {
        return {
          success: false,
          error:
            'Wymagane uprawnienia administratora. Uruchom choco install ffmpeg -y w terminalu jako admin.'
        };
      }
      return { success: false, error: msg };
    }
  });

  ipcMain.handle('dep:installYtdlp', async () => {
    try {
      const binDir = join(app.getPath('userData'), 'bin');
      await mkdir(binDir, { recursive: true });
      const dest = join(binDir, 'yt-dlp.exe');
      await downloadFile(
        'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
        dest
      );
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Nie udało się pobrać yt-dlp' };
    }
  });

  function getMkvExtractPath(): string {
    const candidates = [
      'mkvextract',
      'C:\\Program Files\\MKVToolNix\\mkvextract.exe',
      'C:\\Program Files (x86)\\MKVToolNix\\mkvextract.exe'
    ];
    for (const c of candidates) {
      try {
        const res = spawnSync(`"${c}"`, ['--version'], {
          timeout: 5000,
          windowsHide: true,
          stdio: 'ignore',
          shell: true
        });
        if (res.status === 0) return c;
      } catch {
        /* try next */
      }
    }
    return 'mkvextract';
  }

  ipcMain.handle('dep:checkMkvextract', async () => {
    try {
      const bin = getMkvExtractPath();
      const output = execSync(`"${bin}" --version`, {
        encoding: 'utf-8',
        timeout: 10000,
        windowsHide: true
      });
      const match = output.match(/mkvextract v([\d.]+)/);
      return { installed: true, version: match ? match[1] : 'unknown' };
    } catch {
      return { installed: false, version: null };
    }
  });

  ipcMain.handle('dep:installMkvextract', async () => {
    try {
      const { stdout, stderr } = await execAsync('choco install mkvtoolnix -y --no-progress', {
        timeout: 300000,
        windowsHide: true
      });
      return { success: true, output: stdout + stderr };
    } catch (e: any) {
      const msg = e.stderr || e.stdout || e.message || 'Nieznany błąd';
      if (msg.includes('requires elevated permissions') || msg.includes('elevation required')) {
        return {
          success: false,
          error:
            'Wymagane uprawnienia administratora. Uruchom choco install mkvtoolnix -y w terminalu jako admin.'
        };
      }
      return { success: false, error: msg };
    }
  });

  ipcMain.handle(
    'media:getCover',
    async (
      _event,
      filePath: string
    ): Promise<{ type: 'video' | 'image' | null; data: string | null }> => {
      const ext = extname(filePath).toLowerCase();
      const dir = join(filePath, '..');
      const name = basename(filePath, ext);

      if (AUDIO_EXTS.includes(ext)) {
        for (const vExt of VIDEO_EXTS) {
          const videoPath = join(dir, name + vExt);
          try {
            await stat(videoPath);
            return { type: 'video', data: videoPath };
          } catch {
            /* no video */
          }
        }
        const embedded = await extractEmbeddedCover(filePath);
        if (embedded) return { type: 'image', data: embedded };
        return { type: null, data: null };
      }

      if (VIDEO_EXTS.includes(ext)) {
        const frame = await extractVideoFrame(filePath);
        if (frame) return { type: 'image', data: frame };
        return { type: null, data: null };
      }

      return { type: null, data: null };
    }
  );

  ipcMain.handle('media:getDuration', async (_event, filePath: string): Promise<number> => {
    try {
      const { stdout } = await execAsync(
        `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`,
        { encoding: 'utf-8', timeout: 10000, windowsHide: true }
      );
      return parseFloat(stdout.trim()) || 0;
    } catch {
      return 0;
    }
  });

  // --- Subtitles ---

  ipcMain.handle(
    'subtitles:listEmbedded',
    async (
      _event,
      filePath: string
    ): Promise<Array<{ index: number; language: string; title: string; codec: string }>> => {
      try {
        const output = execSync(
          `ffprobe -v quiet -select_streams s -show_entries stream=index,codec_name:stream_tags=language,title -of json "${filePath}"`,
          { encoding: 'utf-8', timeout: 10000, windowsHide: true }
        );
        const parsed = JSON.parse(output);
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
        const outPath = join(getTempDir(), `sub_${Date.now()}.ass`);
        execSync(
          `ffmpeg -v error -i "${filePath}" -map 0:${streamIndex} -c:s copy -y "${outPath}"`,
          { encoding: 'utf-8', timeout: 30000, windowsHide: true }
        );
        const content = await readFile(outPath, 'utf-8');
        await unlink(outPath).catch(() => {});
        return { content, format: 'ass' };
      } catch (err) {
        console.error('[Onda/subtitles] extractEmbedded failed:', err);
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
        const probe = execSync(
          `ffprobe -v quiet -show_entries stream=index,codec_type,codec_name:stream_tags=filename -of json "${filePath}"`,
          { encoding: 'utf-8', timeout: 15000, windowsHide: true }
        );
        const parsed = JSON.parse(probe);
        const streams: Array<{ index: number; tags?: { filename?: string } }> = (
          parsed.streams || []
        ).filter((s: any) => s.codec_type === 'attachment');

        if (!streams.length) return [];

        const dumpDir = join(
          getTempDir(),
          `fonts_${Date.now()}_${Math.random().toString(36).slice(2)}`
        );
        await mkdir(dumpDir, { recursive: true });
        const fonts: Array<{ name: string; ext: string; data: number[] }> = [];
        try {
          const bin = getMkvExtractPath();
          let count = 0;
          streams.forEach((s, attId) => {
            const fileName = s.tags?.filename || `font_${attId}.ttf`;
            const ext = (fileName.split('.').pop() || 'ttf').toLowerCase();
            const outPath = join(dumpDir, `att_${attId}.${ext}`);
            try {
              const res = spawnSync(
                `"${bin}"`,
                [`"${filePath}"`, 'attachments', `${attId}:"${outPath}"`],
                { encoding: 'utf-8', timeout: 30000, windowsHide: true, shell: true }
              );
              if (res.status === 0 && statSync(outPath)) {
                const buf = readFileSync(outPath);
                fonts.push({
                  name: fileName.replace(/\.(ttf|otf|ttc)$/i, ''),
                  ext,
                  data: Array.from(buf)
                });
                count++;
              }
            } catch {
              /* skip failed attachment */
            }
          });
        } catch (e: any) {
          console.error('[Onda/attachments] mkvextract failed:', e.message?.split('\n')[0] || e);
        }
        await rm(dumpDir, { recursive: true, force: true }).catch(() => {});

        return fonts;
      } catch (err) {
        console.error('[Onda/subtitles] extractAttachments failed:', err);
        return [];
      }
    }
  );
}
