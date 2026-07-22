import type { MediaFile } from '@renderer/types/media';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';
import { audioEvents } from '@renderer/utils/audioEvents';

const eqFrequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

function toFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return `file:///${encodeURI(normalized).replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
}

class AudioEngine {
  private audioEl: HTMLAudioElement | null = null;
  private nextAudioEl: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private sourceNodeB: MediaElementAudioSourceNode | null = null;
  private videoSourceNode: MediaElementAudioSourceNode | null = null;
  private crossfadeGainA: GainNode | null = null;
  private crossfadeGainB: GainNode | null = null;
  private gainNode: GainNode | null = null;
  private eqFilters: BiquadFilterNode[] = [];
  private rafId: number | null = null;
  private crossfadeTimer: ReturnType<typeof setTimeout> | null = null;
  private isCrossfading = false;
  private initialized = false;
  private eqChainBuilt = false;
  private savedPositions = new Map<string, number>();
  private visibilityHandler: (() => void) | null = null;

  private ensureAudioContext(): void {
    if (this.audioCtx) return;
    this.audioCtx = new AudioContext();
    this.analyserNode = this.audioCtx.createAnalyser();
    this.analyserNode.fftSize = 2048;
    this.gainNode = this.audioCtx.createGain();
    this.crossfadeGainA = this.audioCtx.createGain();
    this.crossfadeGainB = this.audioCtx.createGain();
    this.crossfadeGainA.gain.value = 1;
    this.crossfadeGainB.gain.value = 0;
    this.eqFilters = eqFrequencies.map((freq, i) => {
      const filter = this.audioCtx!.createBiquadFilter();
      filter.type = i === 0 ? 'lowshelf' : i === eqFrequencies.length - 1 ? 'highshelf' : 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = 1.4;
      filter.gain.value = 0;
      return filter;
    });
  }

  private ensureEqChain(): void {
    this.ensureAudioContext();
    if (this.eqChainBuilt) return;
    let eqChain: AudioNode = this.crossfadeGainA!;
    for (const filter of this.eqFilters) {
      eqChain.connect(filter);
      eqChain = filter;
    }
    eqChain.connect(this.gainNode!);
    this.gainNode!.connect(this.analyserNode!);
    this.analyserNode!.connect(this.audioCtx!.destination);
    this.eqChainBuilt = true;
  }

  private connectAudio(el: HTMLAudioElement): void {
    this.ensureAudioContext();
    this.ensureEqChain();

    if (this.videoSourceNode) {
      try {
        this.videoSourceNode.disconnect();
      } catch {}
    }

    if (!this.sourceNode) {
      this.sourceNode = this.audioCtx!.createMediaElementSource(el);
    } else {
      try {
        this.sourceNode.disconnect();
      } catch {}
    }
    this.sourceNode.connect(this.crossfadeGainA!);
  }

  private connectAudioB(el: HTMLAudioElement): void {
    this.ensureAudioContext();
    this.ensureEqChain();
    if (this.sourceNodeB) return;
    try {
      this.sourceNodeB = this.audioCtx!.createMediaElementSource(el);
      this.sourceNodeB.connect(this.crossfadeGainB!);
      this.crossfadeGainB!.connect(this.gainNode!);
    } catch {}
  }

  private createAudioElement(): HTMLAudioElement {
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.removeAttribute('src');
    }
    this.audioEl = new Audio();
    this.audioEl.preload = 'auto';
    this.audioEl.crossOrigin = 'anonymous';
    return this.audioEl;
  }

  private setupListeners(el: HTMLAudioElement): void {
    el.addEventListener('timeupdate', () => {
      audioEvents.emit('timeUpdate', el.currentTime);
    });
    el.addEventListener('durationchange', () => {
      audioEvents.emit('durationChange', el.duration || 0);
    });
    el.addEventListener('ended', () => {
      this.handleEnded();
    });
    el.addEventListener('play', () => {
      audioEvents.emit('playStateChange', true);
    });
    el.addEventListener('pause', () => {
      if (!this.isCrossfading) audioEvents.emit('playStateChange', false);
    });
    el.addEventListener('loadedmetadata', () => {
      audioEvents.emit('durationChange', el.duration || 0);
    });
  }

  private handleEnded(): void {
    let player;
    try {
      player = usePlayerStore();
    } catch {
      return;
    }
    if (this.isCrossfading) return;

    if (player.repeat === 'one') {
      if (this.audioEl) {
        this.audioEl.currentTime = 0;
        this.audioEl.play();
      }
      return;
    }

    const settings = useSettingsStore();
    const crossfadeDuration = settings.playback.crossfadeDuration || 0;
    if (crossfadeDuration > 0 && player.queue.length > 0) {
      this.startCrossfade(crossfadeDuration);
      return;
    }

    audioEvents.emit('trackEnd', undefined);
  }

  private startRafLoop(): void {
    const tick = () => {
      if (this.audioEl && !this.audioEl.paused) {
        audioEvents.emit('timeUpdate', this.audioEl.currentTime);
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopRafLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private startCrossfade(duration: number): void {
    const player = usePlayerStore();
    if (!this.audioEl || !this.audioCtx || !this.crossfadeGainA || !this.crossfadeGainB) return;

    const next = player.queue[0];
    if (!next || next.type === 'video') {
      audioEvents.emit('trackEnd', undefined);
      return;
    }

    this.isCrossfading = true;

    if (!this.nextAudioEl) {
      this.nextAudioEl = new Audio();
      this.nextAudioEl.preload = 'auto';
      this.nextAudioEl.crossOrigin = 'anonymous';
      this.connectAudioB(this.nextAudioEl);
    }

    const src = toFileUrl(next.path);
    this.nextAudioEl.src = src;

    this.nextAudioEl.addEventListener(
      'canplay',
      () => {
        this.crossfadeGainA!.gain.setValueAtTime(1, this.audioCtx!.currentTime);
        this.crossfadeGainA!.gain.linearRampToValueAtTime(0, this.audioCtx!.currentTime + duration);
        this.crossfadeGainB!.gain.setValueAtTime(0, this.audioCtx!.currentTime);
        this.crossfadeGainB!.gain.linearRampToValueAtTime(1, this.audioCtx!.currentTime + duration);
        this.nextAudioEl!.play().catch(() => {});

        this.crossfadeTimer = setTimeout(() => {
          if (this.audioEl) {
            this.audioEl.pause();
            this.audioEl.removeAttribute('src');
          }
          player.setTrack(next);
          this.audioEl = this.nextAudioEl;
          this.nextAudioEl = null;
          this.sourceNode = this.sourceNodeB;
          this.sourceNodeB = null;
          this.crossfadeGainA!.gain.value = 1;
          this.crossfadeGainB!.gain.value = 0;
          this.isCrossfading = false;
          this.crossfadeTimer = null;
          audioEvents.emit('timeUpdate', 0);
          audioEvents.emit('durationChange', this.audioEl!.duration || 0);
          if (player.currentTrack) player.currentTrack.duration = this.audioEl!.duration || 0;
          this.ensureNextPreloaded();
        }, duration * 1000);
      },
      { once: true }
    );
  }

  private ensureNextPreloaded(): void {
    const player = usePlayerStore();
    if (player.queue.length === 0) return;
    const nextTrack = player.queue[0];
    if (!nextTrack || nextTrack.type === 'video') return;

    if (!this.nextAudioEl) {
      this.nextAudioEl = new Audio();
      this.nextAudioEl.preload = 'auto';
      this.nextAudioEl.crossOrigin = 'anonymous';
      this.connectAudioB(this.nextAudioEl);
    }
    const src = toFileUrl(nextTrack.path);
    if (this.nextAudioEl.src !== src) {
      this.nextAudioEl.src = src;
    }
  }

  private disconnectNodes(): void {
    try {
      this.sourceNode?.disconnect();
    } catch {}
    try {
      this.sourceNodeB?.disconnect();
    } catch {}
    try {
      this.videoSourceNode?.disconnect();
    } catch {}
    try {
      this.crossfadeGainA?.disconnect();
    } catch {}
    try {
      this.crossfadeGainB?.disconnect();
    } catch {}
    try {
      this.gainNode?.disconnect();
    } catch {}
    try {
      this.analyserNode?.disconnect();
    } catch {}
    for (const f of this.eqFilters) {
      try {
        f.disconnect();
      } catch {}
    }
  }

  private cleanupAudioEl(el: HTMLAudioElement | null): void {
    if (!el) return;
    el.pause();
    el.removeAttribute('src');
    el.load();
  }

  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.visibilityHandler = () => {
      if (document.hidden) {
        this.stopRafLoop();
      } else if (this.audioEl && !this.audioEl.paused) {
        this.startRafLoop();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  savePosition(): void {
    const player = usePlayerStore();
    if (this.audioEl && player.currentTrack && player.currentTrack.type === 'audio') {
      if (this.audioEl.currentTime > 5) {
        this.savedPositions.set(player.currentTrack.path, this.audioEl.currentTime);
        window.api?.invoke(
          'playback:setPosition',
          player.currentTrack.path,
          this.audioEl.currentTime
        );
      }
    }
  }

  clearSavedPosition(path: string): void {
    this.savedPositions.delete(path);
    window.api?.invoke('playback:clearPosition', path);
  }

  loadTrack(track: MediaFile): void {
    const player = usePlayerStore();
    const settings = useSettingsStore();

    if (track.type === 'video') return;
    if (!this.audioEl) {
      const el = this.createAudioElement();
      this.setupListeners(el);
    }
    const src = toFileUrl(track.path);
    this.audioEl!.src = src;
    this.connectAudio(this.audioEl!);
    this.audioEl!.volume = player.isMuted ? 0 : player.volume;
    this.isCrossfading = false;

    audioEvents.emit('trackLoaded', undefined);
    if (settings.playback.rememberPosition) {
      const savedPos = this.savedPositions.get(track.path) || 0;
      if (savedPos > 0) {
        this.audioEl!.addEventListener(
          'loadedmetadata',
          () => {
            if (this.audioEl && this.audioEl.currentTime < 3) {
              this.audioEl.currentTime = savedPos;
            }
          },
          { once: true }
        );
      }
    }
  }

  play(): void {
    this.audioEl?.play().catch(() => {});
  }

  pause(): void {
    this.audioEl?.pause();
  }

  seek(time: number): void {
    if (this.audioEl) this.audioEl.currentTime = time;
  }

  setVolume(v: number): void {
    if (this.audioEl) this.audioEl.volume = v;
    if (this.gainNode) this.gainNode.gain.value = v;
  }

  setPlaybackRate(rate: number): void {
    if (this.audioEl) this.audioEl.playbackRate = rate;
  }

  setEqualizerBand(index: number, gain: number): void {
    if (this.eqFilters[index]) this.eqFilters[index].gain.value = gain;
  }

  applyEqPreset(preset: Record<number, number>): void {
    Object.entries(preset).forEach(([idx, gain]) => {
      const i = parseInt(idx);
      if (this.eqFilters[i]) this.eqFilters[i].gain.value = gain;
    });
  }

  getAnalyserNode(): AnalyserNode | null {
    return this.analyserNode;
  }

  getAudioContext(): AudioContext | null {
    return this.audioCtx;
  }

  getMediaElement(): HTMLAudioElement | null {
    return this.audioEl;
  }

  isActive(): boolean {
    return this.initialized;
  }

  async deactivate(): Promise<void> {
    this.stopRafLoop();
    if (this.crossfadeTimer) {
      clearTimeout(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }
    this.isCrossfading = false;
    this.savePosition();
    if (this.audioEl) {
      this.audioEl.pause();
    }
    if (this.audioCtx && this.audioCtx.state === 'running') {
      await this.audioCtx.suspend();
    }
  }

  async destroy(): Promise<void> {
    this.stopRafLoop();
    if (this.crossfadeTimer) {
      clearTimeout(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }
    this.isCrossfading = false;
    this.savePosition();
    this.disconnectNodes();
    this.cleanupAudioEl(this.audioEl);
    this.cleanupAudioEl(this.nextAudioEl);
    this.audioEl = null;
    this.nextAudioEl = null;
    this.sourceNode = null;
    this.sourceNodeB = null;
    this.videoSourceNode = null;
    this.eqChainBuilt = false;
    if (this.audioCtx) {
      await this.audioCtx.close();
      this.audioCtx = null;
    }
    this.initialized = false;
  }

  resumeContext(): void {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  resume(): void {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    if (this.rafId === null) {
      this.startRafLoop();
    }
  }

  setupVideoListeners(el: HTMLVideoElement): void {
    const player = usePlayerStore();
    el.addEventListener('timeupdate', () => {
      player.currentTime = el.currentTime;
    });
    el.addEventListener('durationchange', () => {
      player.duration = el.duration || 0;
      if (player.currentTrack) player.currentTrack.duration = el.duration || 0;
    });
    el.addEventListener('loadedmetadata', () => {
      player.duration = el.duration || 0;
      if (player.currentTrack) player.currentTrack.duration = el.duration || 0;
    });
    el.addEventListener('ended', () => {
      player.isPlaying = false;
      player.nextTrack();
    });
  }

  connectVideoElement(el: HTMLVideoElement): void {
    this.ensureAudioContext();
    this.ensureEqChain();

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
    }

    if (!this.videoSourceNode || (this.videoSourceNode as any).mediaElement !== el) {
      if (this.videoSourceNode) {
        try {
          this.videoSourceNode.disconnect();
        } catch {}
      }
      this.videoSourceNode = this.audioCtx!.createMediaElementSource(el);
    } else {
      try {
        this.videoSourceNode.disconnect();
      } catch {}
    }
    this.videoSourceNode.connect(this.crossfadeGainA!);
  }

  disconnectVideoElement(): void {
    if (this.videoSourceNode) {
      try {
        this.videoSourceNode.disconnect();
      } catch {}
    }
  }
}

export const audioEngine = new AudioEngine();
