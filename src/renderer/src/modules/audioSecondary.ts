import { toMediaServerUrl } from '@renderer/utils/mediaUrl';
import { logger } from '@shared/logger';

export class AudioSecondary {
  private audioEl: HTMLAudioElement | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private offset = 0;
  private audioCtx: AudioContext;
  private gainNode: GainNode;

  constructor(audioCtx: AudioContext, gainNode: GainNode) {
    this.audioCtx = audioCtx;
    this.gainNode = gainNode;
  }

  get hasSecondaryAudio(): boolean {
    return this.audioEl !== null;
  }

  set timeOffset(offset: number) {
    this.offset = offset;
  }

  async connect(audioPath: string, timeOffset = 0): Promise<void> {
    await this.disconnect();

    const el = new Audio();
    el.crossOrigin = 'anonymous';
    el.src = toMediaServerUrl(audioPath);
    el.preload = 'auto';

    await new Promise<void>((resolve, reject) => {
      const onCanPlay = (): void => {
        cleanup();
        resolve();
      };
      const onError = (): void => {
        cleanup();
        reject(new Error('Failed to load secondary audio'));
      };
      const cleanup = (): void => {
        el.removeEventListener('canplay', onCanPlay);
        el.removeEventListener('error', onError);
      };
      el.addEventListener('canplay', onCanPlay);
      el.addEventListener('error', onError);
      el.load();
    });

    this.audioEl = el;
    this.sourceNode = this.audioCtx.createMediaElementSource(el);
    this.sourceNode.connect(this.gainNode);
    this.offset = timeOffset;
    el.volume = 1;
  }

  disconnect(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch (e) {
        logger.warn('audioEngine', 'disconnect secondary source failed', e);
      }
      this.sourceNode = null;
    }
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.removeAttribute('src');
      this.audioEl.load();
      this.audioEl = null;
    }
  }

  seek(videoTime: number): void {
    if (this.audioEl) {
      this.audioEl.currentTime = Math.max(0, videoTime - this.offset);
    }
  }

  play(): void {
    if (this.audioEl) {
      this.audioEl.play().catch((e) => {
        logger.warn('audioEngine', 'secondary audio play() rejected', e);
      });
    }
  }

  pause(): void {
    if (this.audioEl) {
      this.audioEl.pause();
    }
  }
}
