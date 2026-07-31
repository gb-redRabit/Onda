import { toFileUrl } from './audio-utils';

export class SecondaryAudioManager {
  private el: HTMLAudioElement | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private offset = 0;

  get isConnected(): boolean {
    return this.el !== null;
  }

  set timeOffset(offset: number) {
    this.offset = offset;
  }

  async connect(
    audioCtx: AudioContext,
    targetGain: GainNode,
    audioPath: string,
    timeOffset = 0
  ): Promise<void> {
    this.disconnect();

    const el = new Audio();
    el.src = toFileUrl(audioPath);
    el.preload = 'auto';

    await new Promise<void>((resolve, reject) => {
      const onCanPlay = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('Failed to load secondary audio'));
      };
      const cleanup = () => {
        el.removeEventListener('canplay', onCanPlay);
        el.removeEventListener('error', onError);
      };
      el.addEventListener('canplay', onCanPlay);
      el.addEventListener('error', onError);
      el.load();
    });

    this.el = el;
    this.sourceNode = audioCtx.createMediaElementSource(el);
    this.sourceNode.connect(targetGain);
    this.offset = timeOffset;
    el.volume = 1;
  }

  disconnect(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }
    if (this.el) {
      this.el.pause();
      this.el.removeAttribute('src');
      this.el.load();
      this.el = null;
    }
  }

  play(): void {
    this.el?.play().catch(() => {});
  }

  pause(): void {
    this.el?.pause();
  }

  seek(videoTime: number): void {
    if (this.el) {
      this.el.currentTime = Math.max(0, videoTime - this.offset);
    }
  }
}
