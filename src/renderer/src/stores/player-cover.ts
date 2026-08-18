import { shallowRef, triggerRef } from 'vue';
import type { MediaFile } from '@renderer/types/media';
import { VIDEO_EXTS } from '@shared/constants';
import { toMediaServerUrl } from '@renderer/utils/mediaUrl';
import { useLibraryStore } from './library';

export interface CoverResult {
  type: 'video' | 'image' | null;
  data: string | null;
}

function captureVideoFrame(filePath: string): Promise<CoverResult> {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  if (!VIDEO_EXTS.includes(ext)) return Promise.resolve({ type: null, data: null });

  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.src = toMediaServerUrl(filePath);

    let resolved = false;
    function done(result: CoverResult) {
      if (resolved) return;
      resolved = true;
      video.remove();
      resolve(result);
    }

    const timer = setTimeout(() => done({ type: null, data: null }), 15000);

    video.onloadedmetadata = () => {
      const t = Math.min(1, video.duration || 1);
      video.currentTime = t > 0 ? t : 0.5;
    };

    video.onseeked = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return done({ type: null, data: null });
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        done({ type: 'image', data: dataUrl });
      } catch {
        done({ type: null, data: null });
      }
    };

    video.onerror = () => {
      clearTimeout(timer);
      done({ type: null, data: null });
    };
    video.onabort = () => {
      clearTimeout(timer);
      done({ type: null, data: null });
    };
  });
}

export function usePlayerCover() {
  const coverCache = shallowRef<Record<string, CoverResult>>({});
  const coverQueue: string[] = [];
  let coverFlushScheduled = false;
  let coverProcessing = false;
  const COVER_CACHE_MAX = 100;

  async function processCoverBatch(): Promise<void> {
    coverProcessing = true;
    while (coverQueue.length > 0) {
      const batch = coverQueue.splice(0, 5);
      await Promise.all(batch.map((p) => doLoadCover(p)));
      if (coverQueue.length > 0) await new Promise<void>((r) => queueMicrotask(() => r()));
    }
    coverProcessing = false;
  }

  function scheduleCoverFlush(): void {
    if (coverProcessing || coverFlushScheduled) return;
    coverFlushScheduled = true;
    setTimeout(() => {
      coverFlushScheduled = false;
      processCoverBatch();
    }, 0);
  }

  function evictCoverCache(): void {
    const keys = Object.keys(coverCache.value);
    if (keys.length <= COVER_CACHE_MAX) return;
    const excess = keys.length - COVER_CACHE_MAX;
    for (let i = 0; i < excess; i++) {
      delete coverCache.value[keys[i]];
    }
  }

  async function doLoadCover(filePath: string): Promise<void> {
    if (filePath in coverCache.value) return;
    coverCache.value[filePath] = { type: null, data: null };
    const cover = (await window.api?.getCover(filePath)) ?? { type: null, data: null };
    if (cover.data) {
      coverCache.value[filePath] = cover;
      evictCoverCache();
      triggerRef(coverCache);
      return;
    }
    const frame = await captureVideoFrame(filePath);
    coverCache.value[filePath] = frame;
    evictCoverCache();
    triggerRef(coverCache);
  }

  async function loadCover(filePath: string): Promise<CoverResult> {
    if (filePath in coverCache.value) return coverCache.value[filePath]!;
    coverQueue.push(filePath);
    scheduleCoverFlush();
    return { type: null, data: null };
  }

  function getCover(filePath: string): CoverResult {
    return coverCache.value[filePath] ?? { type: null, data: null };
  }

  function invalidateCoverCache(filePath: string) {
    delete coverCache.value[filePath];
    triggerRef(coverCache);
    loadCover(filePath);
  }

  async function enrichTrack(track: MediaFile): Promise<void> {
    if (!track.duration) {
      let dur = 0;
      try {
        dur = (await window.api?.getDuration(track.path)) || 0;
      } catch {
        dur = 0;
      }
      if (dur > 0) {
        useLibraryStore().updateTrack(track.path, (t) => {
          t.duration = dur;
        });
      }
    }
    loadCover(track.path);
  }

  return { loadCover, getCover, invalidateCoverCache, enrichTrack };
}
