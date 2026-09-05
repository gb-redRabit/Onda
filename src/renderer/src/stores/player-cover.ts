import { shallowRef, triggerRef } from 'vue';
import type { MediaFile } from '@renderer/types/media';
import { VIDEO_EXTS } from '@shared/constants';
import { toMediaServerUrl } from '@renderer/utils/mediaUrl';
import { useLibraryStore } from './library';

export interface CoverResult {
  type: 'video' | 'image' | null;
  data: string | null;
}

// Stream tracks (YouTube/SoundCloud/radio) use remote http(s) URLs as their
// path — main rejects them with "unsafe path" on media:getCover, and they only
// ever get a real cover through enrichTrack's thumbnail seeding. Never enqueue
// or IPC them; a cache miss degrades to the fallback icon.
function isRemoteUrl(filePath: string): boolean {
  return /^https?:\/\//i.test(filePath) || filePath.startsWith('//');
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
  const coverSealedAt = new Map<string, number>();
  let coverFlushScheduled = false;
  let coverProcessing = false;
  const COVER_CACHE_MAX = 500;
  // A "no cover" result is cached briefly (cheap — main returns instantly from
  // its mem cache) and re-probed afterwards, so a transient IPC failure or a
  // file that was missing for a moment can never leave the cache poisoned.
  const NULL_COVER_TTL_MS = 30_000;

  async function processCoverBatch(): Promise<void> {
    coverProcessing = true;
    try {
      while (coverQueue.length > 0) {
        const batch = coverQueue.splice(0, 5);
        await Promise.all(batch.map((p) => doLoadCover(p).catch(() => {})));
        if (coverQueue.length > 0) await new Promise<void>((r) => queueMicrotask(() => r()));
      }
    } finally {
      coverProcessing = false;
    }
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
      const path = keys[i];
      delete coverCache.value[path];
      coverSealedAt.delete(path);
    }
  }

  async function doLoadCover(filePath: string): Promise<void> {
    const cached = coverCache.value[filePath];
    if (cached && cached.data) return;
    // Remote URLs (streams/radio) have no local file to probe — never round-trip
    // through IPC for them, just seal a null cover.
    if (isRemoteUrl(filePath)) {
      coverCache.value[filePath] = { type: null, data: null };
      coverSealedAt.set(filePath, Date.now());
      triggerRef(coverCache);
      return;
    }
    // Fresh "no cover" result — skip the round-trip until the TTL expires.
    const sealedAt = coverSealedAt.get(filePath);
    if (sealedAt && Date.now() - sealedAt < NULL_COVER_TTL_MS) return;
    if (cached) {
      delete coverCache.value[filePath];
      coverSealedAt.delete(filePath);
    }
    coverCache.value[filePath] = { type: null, data: null };
    try {
      const cover = (await window.api?.getCover(filePath)) ?? { type: null, data: null };
      if (cover.data) {
        coverCache.value[filePath] = cover;
      } else {
        const frame = await captureVideoFrame(filePath);
        coverCache.value[filePath] = frame;
        if (!frame.data) coverSealedAt.set(filePath, Date.now());
      }
    } catch {
      delete coverCache.value[filePath];
      coverSealedAt.delete(filePath);
    }
    evictCoverCache();
    triggerRef(coverCache);
  }

  async function loadCover(filePath: string): Promise<CoverResult> {
    const cached = coverCache.value[filePath];
    if (cached) {
      const sealedAt = coverSealedAt.get(filePath) ?? 0;
      if (cached.data || Date.now() - sealedAt < NULL_COVER_TTL_MS) {
        return cached;
      }
    }
    if (!coverQueue.includes(filePath) && !isRemoteUrl(filePath)) coverQueue.push(filePath);
    scheduleCoverFlush();
    return cached ?? { type: null, data: null };
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
    // Streams have no local file: no duration lookup, no file cover. The
    // YouTube thumbnail (a remote https URL, allowed by CSP img-src) is seeded
    // straight into the cover cache so PlayerBar/AudioView render it instantly.
    if (track.type === 'stream') {
      if (track.thumbnail && coverCache.value[track.path]?.data !== track.thumbnail) {
        coverCache.value[track.path] = { type: 'image', data: track.thumbnail };
        evictCoverCache();
        triggerRef(coverCache);
      }
      return;
    }
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
    // NOTE: no loadCover() here — enqueueing (e.g. "play all" on a folder)
    // would otherwise flood the cover loader with one IPC round-trip per
    // queued track, even for hundreds the user has never seen. Covers are
    // fetched on demand by MediaCover through its IntersectionObserver when a
    // thumbnail actually renders.
  }

  return { loadCover, getCover, invalidateCoverCache, enrichTrack };
}
