import { registerMusicBrainzHandlers } from './musicbrainz';
import { ipcMain, dialog, BrowserWindow, shell, app } from 'electron';
import { readdir, stat, lstat, readFile, writeFile, mkdir, rename, unlink, rm } from 'fs/promises';

import { join, extname, basename, dirname } from 'path';
import { exec as execCb } from 'child_process';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import type { FileItem } from '../../renderer/src/types/explorer';
import type { MediaFile, Playlist } from '../../renderer/src/types/media';
import { promisify } from 'util';
import { createHash } from 'crypto';
import NodeID3 from 'node-id3';
import { parseFile } from 'music-metadata';
import https from 'https';
import http from 'http';
import os from 'os';
import { VIDEO_EXTS, AUDIO_EXTS } from '../../shared/constants';
import { logger } from '../utils/logger';

const execAsync = promisify(execCb);

function errMsg(e: unknown): string {
  return e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : String(e);
}

function uniqueId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

let _store: InstanceType<typeof import('electron-store').default> | null = null;
async function getStore() {
  if (!_store) {
    const { default: Store } = await import('electron-store');
    _store = new Store();
  }
  return _store;
}

function getTempDir(): string {
  return join(os.tmpdir(), 'onda-covers');
}

interface CachedCover {
  result: { type: 'video' | 'image' | null; data: string | null };
  mtimeMs: number;
}
const coverResultCache = new Map<string, CachedCover>();
const durationCache = new Map<string, { duration: number; mtimeMs: number }>();
const coverCacheLocks = new Set<string>();

const CACHE_MAX_SIZE = 5000;

function evictCache(map: Map<string, unknown>, maxSize: number): void {
  if (map.size <= maxSize) return;
  const toDelete = map.size - maxSize;
  let i = 0;
  for (const key of map.keys()) {
    if (i >= toDelete) break;
    map.delete(key);
    i++;
  }
}

function cacheSet<T>(map: Map<string, T>, key: string, value: T, maxSize: number = CACHE_MAX_SIZE): void {
  map.set(key, value);
  evictCache(map as Map<string, unknown>, maxSize);
}

const PERSISTENT_COVER_DIR = join(getTempDir(), 'persistent');
const COVER_CACHE_MAP_KEY = 'coverCacheMap';

function hashPath(filePath: string): string {
  return createHash('md5').update(filePath.toLowerCase()).digest('hex');
}

async function getPersistentCover(
  filePath: string
): Promise<{ type: 'video' | 'image' | null; data: string | null } | null> {
  try {
    const store = await getStore();
    const cacheMap: Record<string, { cacheFile: string; mtime: number }> | undefined = store.get(
      COVER_CACHE_MAP_KEY
    ) as any;
    const entry = cacheMap?.[filePath];
    if (!entry) return null;

    const s = await stat(filePath).catch(() => null);
    if (!s || s.mtimeMs > entry.mtime) {
      if (entry && cacheMap) {
        delete cacheMap[filePath];
        store.set(COVER_CACHE_MAP_KEY, cacheMap);
      }
      return null;
    }

    const cachePath = join(PERSISTENT_COVER_DIR, entry.cacheFile);
    const buf = await readFile(cachePath).catch(() => null);
    if (!buf) return null;

    const isJpeg = entry.cacheFile.endsWith('.jpg');
    const dataUrl = isJpeg
      ? `data:image/jpeg;base64,${buf.toString('base64')}`
      : `data:image/png;base64,${buf.toString('base64')}`;
    return { type: 'image', data: dataUrl };
  } catch {
    return null;
  }
}

async function savePersistentCover(filePath: string, binary: Buffer, ext: string): Promise<void> {
  try {
    await mkdir(PERSISTENT_COVER_DIR, { recursive: true });
    const hash = hashPath(filePath);
    const cacheFile = `${hash}.${ext}`;
    const cachePath = join(PERSISTENT_COVER_DIR, cacheFile);
    await writeFile(cachePath, binary);

    const s = await stat(filePath).catch(() => null);
    const store = await getStore();
    const cacheMap: Record<string, { cacheFile: string; mtime: number }> =
      (store.get(COVER_CACHE_MAP_KEY) as any) || {};
    cacheMap[filePath] = { cacheFile, mtime: s?.mtimeMs ?? Date.now() };
    store.set(COVER_CACHE_MAP_KEY, JSON.parse(JSON.stringify(cacheMap)));
  } catch {
    // non-fatal
  }
}

async function getCachedCover(
  filePath: string
): Promise<{ type: 'video' | 'image' | null; data: string | null } | null> {
  const memCached = coverResultCache.get(filePath);
  if (memCached) {
    try {
      const { mtimeMs } = await stat(filePath);
      if (mtimeMs <= memCached.mtimeMs) return memCached.result;
    } catch {
      /* file gone */
    }
    coverResultCache.delete(filePath);
  }

  const diskCached = await getPersistentCover(filePath);
  if (diskCached) {
    const s = await stat(filePath).catch(() => null);
    cacheSet(coverResultCache, filePath, { result: diskCached, mtimeMs: s?.mtimeMs ?? Date.now() });
    return diskCached;
  }

  return null;
}

async function extractAudioCover(filePath: string): Promise<string | null> {
  try {
    const meta = await parseFile(filePath, { duration: false });
    if (meta.common.picture && meta.common.picture.length > 0) {
      const pic = meta.common.picture[0];
      const buf = Buffer.from(pic.data);
      const imgExt = pic.format === 'image/jpeg' ? 'jpg' : pic.format.replace('image/', '');
      savePersistentCover(filePath, buf, imgExt);
      return `data:${pic.format};base64,${buf.toString('base64')}`;
    }
  } catch {
    /* no cover in metadata */
  }
  return extractEmbeddedCover(filePath);
}

async function extractAndCacheCover(
  filePath: string
): Promise<{ type: 'video' | 'image' | null; data: string | null }> {
  while (coverCacheLocks.has(filePath)) {
    await new Promise((r) => setTimeout(r, 10));
  }
  const cached = await getCachedCover(filePath);
  if (cached) return cached;

  coverCacheLocks.add(filePath);

  try {
    const ext = extname(filePath).toLowerCase();
    const dir = dirname(filePath);
    const name = basename(filePath, ext);
    let result: { type: 'video' | 'image' | null; data: string | null } = { type: null, data: null };

    if (AUDIO_EXTS.includes(ext)) {
      let foundVideo = false;
      for (const vExt of VIDEO_EXTS) {
        const videoPath = join(dir, name + vExt);
        try {
          await stat(videoPath);
          result = { type: 'video', data: videoPath };
          foundVideo = true;
          break;
        } catch {
          /* no video */
        }
      }
      if (!foundVideo) {
        const cover = await extractAudioCover(filePath);
        if (cover) result = { type: 'image', data: cover };
      }
    } else if (VIDEO_EXTS.includes(ext)) {
      const frame = await extractVideoFrame(filePath);
      result = frame ? { type: 'image', data: frame } : { type: null, data: null };
    } else {
      result = { type: null, data: null };
    }

    const statResult = await stat(filePath).catch(() => null);
    cacheSet(coverResultCache, filePath, { result, mtimeMs: statResult?.mtimeMs ?? Date.now() });

    if (result.type === 'image' && result.data?.startsWith('data:')) {
      const match = result.data.match(/^data:image\/(\w+);base64,(.+)$/);
      if (match) {
        const imgExt = match[1] === 'jpeg' ? 'jpg' : match[1];
        const buf = Buffer.from(match[2], 'base64');
        savePersistentCover(filePath, buf, imgExt);
      }
    }

    return result;
  } finally {
    coverCacheLocks.delete(filePath);
  }
}

async function extractVideoFrame(filePath: string, time = '00:00:00.5'): Promise<string | null> {
  try {
    await mkdir(getTempDir(), { recursive: true });
    const outPath = join(getTempDir(), `frame_${uniqueId()}.jpg`);
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
    await mkdir(getTempDir(), { recursive: true });
    const outPath = join(getTempDir(), `cover_${uniqueId()}.jpg`);
    await execAsync(
      `ffmpeg -v quiet -i "${filePath}" -vframes 1 -q:v 2 -update 1 "${outPath}" -y`,
      { encoding: 'utf-8', timeout: 15000, windowsHide: true }
    );
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

async function getWindowsDrives(): Promise<FileItem[]> {
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
    const { stdout } = await execAsync(cmd, {
      encoding: 'utf-8',
      timeout: 10000,
      windowsHide: true
    });
    if (!stdout || !stdout.trim()) return fallback;
    interface DriveInfo {
      Name: string;
      Root: string;
      Free: number;
      Used: number;
    }
    let parsed: DriveInfo[];
    try {
      parsed = JSON.parse(stdout.trim());
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
  registerMusicBrainzHandlers();
  ipcMain.handle('fs:getDrives', async (): Promise<FileItem[]> => {
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
    try {
      const s = await stat(filePath);
      return {
        size: s.size,
        modifiedAt: s.mtimeMs,
        createdAt: s.birthtimeMs,
        isDirectory: s.isDirectory()
      };
    } catch {
      return null;
    }
  });

  ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
    try {
      const buf = await readFile(filePath);
      return buf.toString('base64');
    } catch {
      return null;
    }
  });

  ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
    try {
      await writeFile(filePath, Buffer.from(content, 'base64'));
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('fs:mkdir', async (_event, dirPath: string) => {
    try {
      await mkdir(dirPath, { recursive: true });
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('fs:rename', async (_event, oldPath: string, newPath: string) => {
    try {
      await rename(oldPath, newPath);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('fs:delete', async (_event, filePath: string) => {
    try {
      const s = await lstat(filePath);
      if (s.isSymbolicLink()) {
        await unlink(filePath);
      } else if (s.isDirectory()) {
        await rm(filePath, { recursive: true, force: true });
      } else {
        await unlink(filePath);
      }
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle(
    'dialog:openImage',
    async (_event): Promise<{ canceled: boolean; filePaths: string[] }> => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return { canceled: true, filePaths: [] };
      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }]
      });
      return { canceled: result.canceled, filePaths: result.filePaths.slice() };
    }
  );

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

  ipcMain.handle('dialog:openFolder', async (_event): Promise<string[]> => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return [];
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    });
    return result.canceled ? [] : result.filePaths;
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
    if (!folder) return { canceled: false, filePaths: [] };
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
    const validPaths: Array<Parameters<typeof app.getPath>[0]> = [
      'home',
      'userData',
      'temp',
      'desktop',
      'documents',
      'downloads',
      'music',
      'pictures',
      'videos',
      'recent',
      'logs',
      'crashDumps'
    ];
    return app.getPath(
      validPaths.includes(name as any) ? (name as Parameters<typeof app.getPath>[0]) : 'userData'
    );
  });

  ipcMain.handle('app:getVersion', () => {
    return app.getVersion();
  });

  // --- Library scan ---

  const AUDIO_EXT_SET = new Set(AUDIO_EXTS);
  const VIDEO_EXT_SET = new Set(VIDEO_EXTS);

  async function getDuration(filePath: string): Promise<number> {
    const cached = durationCache.get(filePath);
    if (cached) {
      try {
        const { mtimeMs } = await stat(filePath);
        if (mtimeMs <= cached.mtimeMs) return cached.duration;
      } catch {
        /* file gone */
      }
      durationCache.delete(filePath);
    }

    try {
      const meta = await parseFile(filePath, { duration: true });
      const duration = meta.format?.duration || 0;
      const s = await stat(filePath).catch(() => null);
      if (s) cacheSet(durationCache, filePath, { duration, mtimeMs: s.mtimeMs });
      return duration;
    } catch {
      // ffprobe fallback for unsupported formats (e.g. video containers)
      try {
        const { stdout } = await execAsync(
          `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`,
          { encoding: 'utf-8', timeout: 10000, windowsHide: true }
        );
        const duration = parseFloat(stdout.trim()) || 0;
        const s = await stat(filePath).catch(() => null);
        if (s) cacheSet(durationCache, filePath, { duration, mtimeMs: s.mtimeMs });
        return duration;
      } catch {
        return 0;
      }
    }
  }

  async function getAudioMetadata(
    filePath: string,
    ext: string
  ): Promise<{
    title: string;
    artist: string;
    album: string;
    year?: number;
    genre?: string;
    track?: { no: number; of?: number };
    duration: number;
    bitrate: number;
    sampleRate: number;
    channels: number;
    format: string;
    isVideo: boolean;
    size: number;
  } | null> {
    try {
      const s = await stat(filePath).catch(() => null);
      if (!s) return null;

      const meta = await parseFile(filePath, { duration: true });
      const c = meta.common;

      let genreStr = '';
      if (c.genre && c.genre.length > 0) genreStr = c.genre[0];

      // save cover to persistent cache
      if (c.picture && c.picture.length > 0) {
        const pic = c.picture[0];
        const imgExt = pic.format === 'image/jpeg' ? 'jpg' : pic.format.replace('image/', '');
        const buf = Buffer.from(pic.data);
        savePersistentCover(filePath, buf, imgExt);
      }

      return {
        title: c.title || basename(filePath, ext),
        artist: c.artist || '',
        album: c.album || '',
        year: c.year || undefined,
        genre: genreStr,
        track: c.track?.no ? { no: c.track.no, of: c.track.of ?? undefined } : undefined,
        duration: meta.format?.duration || 0,
        bitrate: meta.format?.bitrate || 0,
        sampleRate: meta.format?.sampleRate || 0,
        channels: 0,
        format: ext.slice(1),
        isVideo: false,
        size: s.size
      };
    } catch {
      return null;
    }
  }

  async function getMetadata(
    filePath: string,
    ext: string
  ): Promise<{
    title: string;
    artist: string;
    album: string;
    year?: number;
    genre?: string;
    track?: { no: number; of?: number };
    duration: number;
    bitrate: number;
    sampleRate: number;
    channels: number;
    format: string;
    isVideo: boolean;
    size: number;
  } | null> {
    try {
      const s = await stat(filePath).catch(() => null);
      if (!s) return null;

      const isVideo = ['.mp4', '.mkv', '.avi', '.webm', '.mov', '.wmv', '.flv', '.m4v'].includes(
        ext
      );

      if (!isVideo) {
        return getAudioMetadata(filePath, ext);
      }

      return {
        title: basename(filePath, ext),
        artist: '',
        album: '',
        duration: 0,
        bitrate: 0,
        sampleRate: 0,
        channels: 0,
        format: ext.slice(1),
        isVideo: true,
        size: s.size
      };
    } catch {
      return null;
    }
  }

  async function processAudioFile(
    fullPath: string,
    entryName: string,
    ext: string
  ): Promise<{ file: MediaFile | null }> {
    const s = await stat(fullPath).catch(() => null);
    if (!s) return { file: null };
    const meta = await getMetadata(fullPath, ext);
    return {
      file: {
        id: fullPath,
        name: entryName,
        path: fullPath,
        extension: ext,
        mimeType: '',
        size: s.size,
        type: 'audio',
        metadata: meta
          ? {
              title: meta.title,
              artist: meta.artist,
              album: meta.album,
              year: meta.year,
              genre: meta.genre,
              track: meta.track
            }
          : undefined,
        duration: meta?.duration || 0,
        addedAt: s.birthtimeMs ?? Date.now(),
        playCount: 0
      }
    };
  }

  async function processVideoFile(
    fullPath: string,
    entryName: string,
    ext: string
  ): Promise<{ file: MediaFile | null }> {
    const s = await stat(fullPath).catch(() => null);
    if (!s) return { file: null };
    return {
      file: {
        id: fullPath,
        name: entryName,
        path: fullPath,
        extension: ext,
        mimeType: '',
        size: s.size,
        type: 'video',
        duration: 0,
        addedAt: s.birthtimeMs ?? Date.now(),
        playCount: 0
      }
    };
  }

  async function scanDir(
    dirPath: string,
    maxDepth = 10,
    depth = 0
  ): Promise<{ files: MediaFile[]; audioCount: number; videoCount: number }> {
    if (depth > maxDepth) return { files: [], audioCount: 0, videoCount: 0 };

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      const subDirPromises: Promise<{
        files: MediaFile[];
        audioCount: number;
        videoCount: number;
      }>[] = [];
      const fileTasks: Array<() => Promise<{ file: MediaFile | null }>> = [];
      let audioCount = 0;
      let videoCount = 0;

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        if (entry.isDirectory()) {
          subDirPromises.push(scanDir(fullPath, maxDepth, depth + 1));
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          if (AUDIO_EXT_SET.has(ext)) {
            audioCount++;
            fileTasks.push(() => processAudioFile(fullPath, entry.name, ext));
          } else if (VIDEO_EXT_SET.has(ext)) {
            videoCount++;
            fileTasks.push(() => processVideoFile(fullPath, entry.name, ext));
          }
        }
      }

      const chunkSize = 50;
      const fileResults: Array<{ file: MediaFile | null }> = [];
      for (let i = 0; i < fileTasks.length; i += chunkSize) {
        const chunk = fileTasks.slice(i, i + chunkSize);
        const results = await Promise.all(chunk.map((fn) => fn()));
        fileResults.push(...results);
      }

      const subResults = await Promise.all(subDirPromises);

      const files: MediaFile[] = [];
      let totalAudio = 0;
      let totalVideo = 0;

      for (const r of subResults) {
        files.push(...r.files);
        totalAudio += r.audioCount;
        totalVideo += r.videoCount;
      }

      for (const r of fileResults) {
        if (r.file) files.push(r.file);
      }
      totalAudio += audioCount;
      totalVideo += videoCount;

      return { files, audioCount: totalAudio, videoCount: totalVideo };
    } catch (err) {
      logger.warn('library', `scanDir error reading ${dirPath}: ${err}`);
      return { files: [], audioCount: 0, videoCount: 0 };
    }
  }

  ipcMain.handle(
    'library:scan',
    async (
      _event,
      folderPaths: string[]
    ): Promise<{ count: number; folderTypes: Record<string, 'audio' | 'video' | 'mixed'> }> => {
      try {
        const folderResults = await Promise.all(
          folderPaths.map(async (folderPath) => {
            try {
              const result = await scanDir(folderPath, 8);
              const folderType: 'audio' | 'video' | 'mixed' =
                result.audioCount > 0 && result.videoCount === 0
                  ? 'audio'
                  : result.videoCount > 0 && result.audioCount === 0
                    ? 'video'
                    : 'mixed';
              return { folderType, files: result.files, folderPath };
            } catch (err) {
              logger.warn('library', `scan error for ${folderPath}: ${err}`);
              return null;
            }
          })
        );

        const allFiles: MediaFile[] = [];
        const folderTypes: Record<string, 'audio' | 'video' | 'mixed'> = {};
        for (const r of folderResults) {
          if (!r) continue;
          folderTypes[r.folderPath] = r.folderType;
          allFiles.push(...r.files);
        }

        const store = await getStore();
        store.set('libraryScanned', JSON.parse(JSON.stringify({ files: allFiles, folderTypes })));

        logger.info('library', `scan completed: ${allFiles.length} files`);
        return { count: allFiles.length, folderTypes };
      } catch (err) {
        logger.error('library', 'scan handler failed', err);
        return { count: 0, folderTypes: {} };
      }
    }
  );

  ipcMain.handle('library:loadFolders', async (): Promise<string[]> => {
    try {
      const store = await getStore();
      const folders = store.get('libraryFolders', []);
      return Array.isArray(folders) ? folders : [];
    } catch (err) {
      logger.error('library', 'loadFolders failed', err);
      return [];
    }
  });

  ipcMain.handle('library:saveFolders', async (_event, folders: string[]): Promise<string[]> => {
    try {
      const store = await getStore();
      store.set('libraryFolders', folders);
      return folders;
    } catch (err) {
      logger.error('library', 'saveFolders failed', err);
      throw err;
    }
  });

  ipcMain.handle(
    'library:loadScanned',
    async (): Promise<{
      files: MediaFile[];
      folderTypes: Record<string, 'audio' | 'video' | 'mixed'>;
    } | null> => {
      try {
        const store = await getStore();
        const data = store.get('libraryScanned', null);
        return data as any;
      } catch (err) {
        logger.error('library', 'loadScanned failed', err);
        return null;
      }
    }
  );

  ipcMain.handle(
    'library:saveScanned',
    async (
      _event,
      data: { files: MediaFile[]; folderTypes: Record<string, 'audio' | 'video' | 'mixed'> }
    ): Promise<void> => {
      try {
        const store = await getStore();
        store.set('libraryScanned', data);
      } catch (err) {
        logger.error('library', 'saveScanned failed', err);
      }
    }
  );

  // --- Playlist CRUD ---

  ipcMain.handle('playlist:loadAll', async (): Promise<Playlist[]> => {
    try {
      const store = await getStore();
      return (store.get('playlists', []) || []) as Playlist[];
    } catch (err) {
      logger.error('library', 'loadPlaylists failed', err);
      return [];
    }
  });

  ipcMain.handle('playlist:saveAll', async (_event, playlists: Playlist[]): Promise<void> => {
    try {
      const store = await getStore();
      store.set('playlists', playlists);
    } catch (err) {
      logger.error('library', 'savePlaylists failed', err);
    }
  });

  ipcMain.handle('settings:get', async () => {
    try {
      const store = await getStore();
      return store.store || {};
    } catch {
      return {};
    }
  });

  ipcMain.handle('settings:set', async (_event, data: Record<string, unknown>) => {
    try {
      const store = await getStore();
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
      const ext = extname(filePath).toLowerCase();
      return await getMetadata(filePath, ext);
    } catch {
      return null;
    }
  });

  ipcMain.handle('yt:search', async (_event, query: string) => {
    logger.warn('yt', 'search not implemented — yt-dlp API required. Query:', query);
    return {
      success: false,
      error: 'YouTube integration not yet implemented',
      items: [],
      nextPageToken: null,
      prevPageToken: null
    };
  });

  ipcMain.handle('yt:getInfo', async (_event, videoId: string) => {
    logger.warn('yt', 'getInfo not implemented — yt-dlp API required. Id:', videoId);
    return { success: false, error: 'YouTube integration not yet implemented' };
  });

  ipcMain.handle('yt:download', async (_event, url: string, format: string) => {
    logger.warn(
      'yt',
      'download not implemented — yt-dlp API required. URL:',
      url,
      'Format:',
      format
    );
    return { success: false, error: 'YouTube integration not yet implemented' };
  });

  ipcMain.handle('yt:getChannel', async (_event, channelId: string) => {
    logger.warn('yt', 'getChannel not implemented — yt-dlp API required. Id:', channelId);
    return { success: false, error: 'YouTube integration not yet implemented' };
  });

  ipcMain.handle('update:check', async () => {
    logger.info('update', 'check requested — using electron-updater (not configured)');
    return { available: false, version: app.getVersion(), notes: '' };
  });

  ipcMain.handle('update:download', async () => {
    logger.info('update', 'download requested — not available');
    return { success: false, error: 'Auto-update not configured' };
  });

  ipcMain.handle('update:install', async () => {
    logger.info('update', 'install requested — relaunching');
    app.relaunch();
    app.exit(0);
  });

  async function checkVersion(
    cmd: string,
    regex: RegExp
  ): Promise<{ installed: boolean; version: string | null }> {
    try {
      const { stdout } = await execAsync(cmd, {
        encoding: 'utf-8',
        timeout: 10000,
        windowsHide: true
      });
      const match = stdout.match(regex);
      return { installed: true, version: match?.[1] ?? 'unknown' };
    } catch {
      return { installed: false, version: null };
    }
  }

  ipcMain.handle('dep:checkFfmpeg', async () => {
    return checkVersion('ffmpeg -version', /ffmpeg version (\S+)/);
  });

  ipcMain.handle('dep:checkYtdlp', async () => {
    try {
      const localBin = join(app.getPath('userData'), 'bin', 'yt-dlp.exe');
      try {
        await stat(localBin);
        const { stdout } = await execAsync(`"${localBin}" --version`, {
          encoding: 'utf-8',
          timeout: 10000,
          windowsHide: true
        });
        return { installed: true, version: stdout.trim(), path: localBin };
      } catch {
        // not in local bin
      }
      const { stdout } = await execAsync('yt-dlp --version', {
        encoding: 'utf-8',
        timeout: 10000,
        windowsHide: true
      });
      return { installed: true, version: stdout.trim(), path: 'yt-dlp' };
    } catch {
      return { installed: false, version: null, path: null };
    }
  });

  ipcMain.handle('dep:checkFfprobe', async () => {
    return checkVersion('ffprobe -version', /ffprobe version (\S+)/);
  });

  ipcMain.handle('dep:installFfmpeg', async () => {
    try {
      const { stdout, stderr } = await execAsync('choco install ffmpeg -y --no-progress', {
        timeout: 300000,
        windowsHide: true
      });
      return { success: true, output: stdout + stderr };
    } catch (e: unknown) {
      const err = e as { stderr?: string; stdout?: string; message?: string };
      const msg = err.stderr || err.stdout || err.message || 'Nieznany błąd';
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
    } catch (e: unknown) {
      const err = e as { message?: string };
      return { success: false, error: err.message || 'Nie udało się pobrać yt-dlp' };
    }
  });

  async function getMkvExtractPath(): Promise<string> {
    const candidates = [
      'mkvextract',
      'C:\\Program Files\\MKVToolNix\\mkvextract.exe',
      'C:\\Program Files (x86)\\MKVToolNix\\mkvextract.exe'
    ];
    for (const c of candidates) {
      try {
        await execAsync(`"${c}" --version`, {
          timeout: 5000,
          windowsHide: true
        });
        return c;
      } catch {
        /* try next */
      }
    }
    return 'mkvextract';
  }

  ipcMain.handle('dep:checkMkvextract', async () => {
    try {
      const bin = await getMkvExtractPath();
      const { stdout } = await execAsync(`"${bin}" --version`, {
        encoding: 'utf-8',
        timeout: 10000,
        windowsHide: true
      });
      const match = stdout.match(/mkvextract v([\d.]+)/);
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
    } catch (e: unknown) {
      const err = e as { stderr?: string; stdout?: string; message?: string };
      const msg = err.stderr || err.stdout || err.message || 'Nieznany błąd';
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
      return extractAndCacheCover(filePath);
    }
  );

  ipcMain.handle('media:getDuration', async (_event, filePath: string): Promise<number> => {
    return getDuration(filePath);
  });

  ipcMain.handle(
    'media:writeTags',
    async (
      _event,
      filePath: string,
      tags: Record<string, string | undefined>
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const toWrite: Record<string, string> = {};
        for (const [key, val] of Object.entries(tags)) {
          if (val !== undefined) toWrite[key] = val;
        }
        NodeID3.update(toWrite, filePath);
        return { success: true };
      } catch (e: unknown) {
        return { success: false, error: errMsg(e) };
      }
    }
  );

  ipcMain.handle(
    'media:renameFile',
    async (
      _event,
      oldPath: string,
      newName: string
    ): Promise<{ success: boolean; error?: string; newPath?: string }> => {
      try {
        const dir = dirname(oldPath);
        const ext = extname(oldPath);
        const safeName = newName.replace(/[<>:"/\\|?*]/g, '_');
        const newPath = join(dir, safeName.endsWith(ext) ? safeName : safeName + ext);
        await rename(oldPath, newPath);
        return { success: true, newPath };
      } catch (e: unknown) {
        return { success: false, error: errMsg(e) };
      }
    }
  );

  ipcMain.handle(
    'media:writeCover',
    async (
      _event,
      filePath: string,
      imageSource: number[] | string
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        let imageBuffer: Buffer;
        let mime = 'image/jpeg';
        if (typeof imageSource === 'string') {
          imageBuffer = await readFile(imageSource);
          const ext = extname(imageSource).toLowerCase();
          const mimeMap: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.webp': 'image/webp',
            '.bmp': 'image/bmp'
          };
          mime = mimeMap[ext] || 'image/jpeg';
        } else {
          imageBuffer = Buffer.from(imageSource);
        }
        NodeID3.update(
          {
            image: { mime, type: { id: 3 }, imageBuffer, description: 'Cover' }
          },
          filePath
        );
        return { success: true };
      } catch (e: unknown) {
        return { success: false, error: errMsg(e) };
      }
    }
  );

  ipcMain.handle(
    'media:readCover',
    async (_event, filePath: string): Promise<{ mime?: string; data?: number[] } | null> => {
      try {
        const tags = NodeID3.read(filePath);
        if (tags?.image) {
          const img =
            typeof tags.image === 'string'
              ? { imageBuffer: await readFile(tags.image).catch(() => null), mime: 'image/jpeg' }
              : tags.image;
          if (img?.imageBuffer && Buffer.isBuffer(img.imageBuffer)) {
            return { mime: img.mime || 'image/jpeg', data: Array.from(img.imageBuffer) };
          }
        }
        return null;
      } catch {
        return null;
      }
    }
  );

  // --- Subtitles ---

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
