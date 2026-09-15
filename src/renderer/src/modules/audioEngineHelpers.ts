import { audioEvents } from '@renderer/utils/audioEvents';
import { logger } from '@shared/logger';
import { toMediaStreamUrl } from '@renderer/utils/mediaUrl';

export interface MediaListenerDeps {
  onEnded(): void;
  onError(el: HTMLAudioElement): void;
  loadStartTs(): number;
  onCanplay(el: HTMLAudioElement): void;
}

export function attachMediaElementListeners(el: HTMLAudioElement, deps: MediaListenerDeps): void {
  el.addEventListener('durationchange', () => {
    audioEvents.emit('durationChange', el.duration || 0);
  });
  el.addEventListener('ended', () => {
    deps.onEnded();
  });
  el.addEventListener('play', () => {
    audioEvents.emit('playStateChange', true);
  });
  el.addEventListener('pause', () => {
    audioEvents.emit('playStateChange', false);
  });
  el.addEventListener('timeupdate', () => {
    audioEvents.emit('timeUpdate', el.currentTime);
  });
  el.addEventListener('loadedmetadata', () => {
    audioEvents.emit('durationChange', el.duration || 0);
  });
  el.addEventListener('progress', () => {
    let frac = 0;
    try {
      if (el.duration > 0 && el.buffered.length > 0) {
        const end = el.buffered.end(el.buffered.length - 1);
        frac = Math.min(1, end / el.duration);
      }
    } catch {
      frac = 0;
    }
    audioEvents.emit('bufferChange', frac);
  });
  el.addEventListener('error', () => {
    deps.onError(el);
  });
  el.addEventListener('loadstart', () => {
    logger.info(
      'audioEngine',
      `loadstart +${Math.round(performance.now() - deps.loadStartTs())}ms`
    );
  });
  el.addEventListener('loadeddata', () => {
    logger.info(
      'audioEngine',
      `loadeddata +${Math.round(performance.now() - deps.loadStartTs())}ms`
    );
  });
  el.addEventListener('canplay', () => {
    logger.info('audioEngine', `canplay +${Math.round(performance.now() - deps.loadStartTs())}ms`);
    audioEvents.emit('playable', undefined);
    deps.onCanplay(el);
  });
}

export function computeTrackNormalization(enable: boolean, ratio: number | undefined): number {
  return enable && typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0
    ? Math.min(4, Math.max(0.25, ratio))
    : 1;
}

export function cleanupAudioElement(el: HTMLAudioElement | null): void {
  if (!el) return;
  el.pause();
  el.removeAttribute('src');
  el.load();
}

export interface StreamErrorOps {
  getStreamUrl: () => string | null;
  getMode: () => 'proxy' | 'direct' | null;
  getTriedDirect: () => boolean;
  getFinalRetried: () => boolean;
  setMode: (mode: 'proxy' | 'direct') => void;
  setTriedDirect: (value: boolean) => void;
  setFinalRetried: (value: boolean) => void;
  normalization: () => number;
  isMuted: () => boolean;
  volume: () => number;
  disconnectSourceNode: () => void;
  disconnectSecondary: () => void;
  connectAudio: (el: HTMLAudioElement) => void;
  setGain: (value: number) => void;
}

// Stream error handling ladder, extracted from `modules/audioEngine.ts` (plan 2.8):
//   proxy retries exhausted -> direct retry once (different request path)
//   direct failed too       -> one more proxy pass (the per-IP throttle window
//                              may have passed meanwhile)
//   that failed as well     -> streamError event (footer shows it)
export function handleStreamSourceError(el: HTMLAudioElement, ops: StreamErrorOps): void {
  const err = el.error;
  logger.warn(
    'audioEngine',
    `audio element error code=${err?.code} message=${err?.message} src=${(el.src || '').slice(0, 120)}`
  );
  const streamUrl = ops.getStreamUrl();
  if (!streamUrl) {
    // Local file playback (no stream URL): the file is missing, unreadable or
    // the media server rejected it. Emit so the UI can skip gracefully.
    audioEvents.emit('trackError', err ? String(err.code) : 'unknown');
    return;
  }
  const normalized = ops.normalization();
  const scaledVolume = (ops.isMuted() ? 0 : ops.volume()) * normalized;
  if (ops.getMode() === 'proxy' && !ops.getTriedDirect()) {
    // Proxy retries (403 with backoff) were exhausted — retry the raw URL once
    // directly from the renderer as a different request path.
    ops.setTriedDirect(true);
    ops.setMode('direct');
    logger.info(
      'audioEngine',
      `stream proxy failed -> direct retry url=${streamUrl.slice(0, 120)}`
    );
    el.crossOrigin = null;
    ops.disconnectSourceNode();
    ops.disconnectSecondary();
    el.volume = scaledVolume;
    el.src = streamUrl;
    el.load();
    audioEvents.emit('bufferChange', 0);
    return;
  }
  if (ops.getMode() === 'direct' && !ops.getFinalRetried()) {
    // Direct retry failed as well — go back through the proxy one last time.
    ops.setFinalRetried(true);
    ops.setMode('proxy');
    logger.info(
      'audioEngine',
      `stream direct failed -> proxy retry url=${streamUrl.slice(0, 120)}`
    );
    el.crossOrigin = 'anonymous';
    el.volume = 1;
    ops.connectAudio(el);
    ops.setGain(scaledVolume);
    el.src = toMediaStreamUrl(streamUrl);
    el.load();
    audioEvents.emit('bufferChange', 0);
    return;
  }
  audioEvents.emit('streamError', 'stream-failed');
}
