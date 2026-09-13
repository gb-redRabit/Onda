import { audioEvents } from '@renderer/utils/audioEvents';
import { logger } from '@shared/logger';

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
