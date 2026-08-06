import type { MediaFile } from '@renderer/types/media';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';
import { audioEvents } from '@renderer/utils/audioEvents';
import { toMediaServerUrl } from '@renderer/utils/mediaUrl';
import { logger } from '@shared/logger';

const eqFrequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

class AudioEngine {
  private audioEl: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private eqFilters: BiquadFilterNode[] = [];
  private videoSourceNode: MediaElementAudioSourceNode | null = null;
  private videoGainNode: GainNode | null = null;
  private videoSourceEl: HTMLVideoElement | null = null;
  private initialized = false;
  private eqChainBuilt = false;
  private secondaryAudioEl: HTMLAudioElement | null = null;
  private secondarySourceNode: MediaElementAudioSourceNode | null = null;
  private secondaryAudioOffset = 0;
  private savedPositions = new Map<string, number>();
  private ensureAudioContext(): void {
    if (this.audioCtx) return;
    this.audioCtx = new AudioContext();
    this.analyserNode = this.audioCtx.createAnalyser();
    this.analyserNode.fftSize = 2048;
    this.gainNode = this.audioCtx.createGain();
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
    const firstFilter = this.eqFilters[0];
    if (firstFilter) {
      this.sourceNode?.connect(firstFilter);
      let eqChain: AudioNode = firstFilter;
      for (let i = 1; i < this.eqFilters.length; i++) {
        eqChain.connect(this.eqFilters[i]);
        eqChain = this.eqFilters[i];
      }
      eqChain.connect(this.gainNode!);
    } else {
      this.sourceNode?.connect(this.gainNode!);
    }
    this.gainNode!.connect(this.analyserNode!);
    this.analyserNode!.connect(this.audioCtx!.destination);
    this.eqChainBuilt = true;
  }

  private connectAudio(el: HTMLAudioElement): void {
    this.ensureAudioContext();
    if (!this.sourceNode) {
      this.sourceNode = this.audioCtx!.createMediaElementSource(el);
    } else {
      try {
        this.sourceNode.disconnect();
      } catch {
        // ok
      }
    }
    
    if (!this.eqChainBuilt) {
      this.ensureEqChain();
    } else {
      const firstFilter = this.eqFilters[0];
      if (firstFilter) {
        this.sourceNode.connect(firstFilter);
      } else {
        this.sourceNode.connect(this.gainNode!);
      }
    }
    this.disconnectSecondaryAudio();
    this.disconnectVideoElement();
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
      audioEvents.emit('playStateChange', false);
    });
    el.addEventListener('timeupdate', () => {
      audioEvents.emit('timeUpdate', el.currentTime);
    });
    el.addEventListener('loadedmetadata', () => {
      audioEvents.emit('durationChange', el.duration || 0);
    });
  }

  private handleEnded(): void {
    let player;
    try {
      player = usePlayerStore();
    } catch (e) {
      logger.warn('audioEngine', 'handleEnded: store unavailable', e);
      return;
    }

    if (player.repeat === 'one') {
      if (this.audioEl) {
        this.audioEl.currentTime = 0;
        this.audioEl.play();
      }
      return;
    }
    player.nextTrack();
  }

  private disconnectNodes(): void {
    try {
      this.sourceNode?.disconnect();
    } catch (e) {
      logger.warn('audioEngine', 'disconnect source node failed', e);
    }
    try {
      this.videoSourceNode?.disconnect();
    } catch (e) {
      logger.warn('audioEngine', 'disconnect video source node failed', e);
    }
    try {
      this.videoGainNode?.disconnect();
    } catch (e) {
      logger.warn('audioEngine', 'disconnect video gain node failed', e);
    }
    this.videoSourceNode = null;
    this.videoGainNode = null;
    this.videoSourceEl = null;
    try {
      this.gainNode?.disconnect();
    } catch (e) {
      logger.warn('audioEngine', 'disconnect gain node failed', e);
    }
    try {
      this.analyserNode?.disconnect();
    } catch (e) {
      logger.warn('audioEngine', 'disconnect analyser failed', e);
    }
    for (const f of this.eqFilters) {
      try {
        f.disconnect();
      } catch (e) {
        logger.warn('audioEngine', 'disconnect eq filter failed', e);
      }
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
    const settings = useSettingsStore();

    if (track.type === 'video') {
      return;
    }

    if (!this.audioEl) {
      const el = this.createAudioElement();
      this.setupListeners(el);
    }
    this.audioEl!.src = toMediaServerUrl(track.path);
    this.connectAudio(this.audioEl!);
    if (this.gainNode)
      this.gainNode.gain.value = usePlayerStore().isMuted ? 0 : usePlayerStore().volume;

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
    this.audioEl?.play().catch((e) => {
      logger.warn('audioEngine', 'audio play() rejected', e);
    });
  }

  pause(): void {
    this.audioEl?.pause();
  }

  seek(time: number): void {
    if (this.audioEl) this.audioEl.currentTime = time;
  }

  setVolume(v: number): void {
    if (this.gainNode) this.gainNode.gain.value = v;
  }

  get hasSecondaryAudio(): boolean {
    return this.secondaryAudioEl !== null;
  }

  set secondaryAudioTimeOffset(offset: number) {
    this.secondaryAudioOffset = offset;
  }

  async connectSecondaryAudio(audioPath: string, timeOffset = 0): Promise<void> {
    await this.disconnectSecondaryAudio();

    this.ensureAudioContext();

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch (e) {
        logger.warn('audioEngine', 'disconnect source node failed', e);
      }
    }

    const el = new Audio();
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

    this.secondaryAudioEl = el;
    this.secondarySourceNode = this.audioCtx!.createMediaElementSource(el);
    this.secondarySourceNode.connect(this.gainNode!);
    try {
      if (this.sourceNode && this.gainNode) {
        this.sourceNode.connect(this.gainNode);
      }
    } catch (e) {
      logger.warn('audioEngine', 'reconnect source node failed', e);
    }
    this.secondaryAudioOffset = timeOffset;
    el.volume = 1;
  }

  disconnectSecondaryAudio(): void {
    if (this.secondarySourceNode) {
      try {
        this.secondarySourceNode.disconnect();
      } catch (e) {
        logger.warn('audioEngine', 'disconnect secondary source failed', e);
      }
      this.secondarySourceNode = null;
    }
    if (this.secondaryAudioEl) {
      this.secondaryAudioEl.pause();
      this.secondaryAudioEl.removeAttribute('src');
      this.secondaryAudioEl.load();
      this.secondaryAudioEl = null;
    }
  }

  seekSecondaryAudio(videoTime: number): void {
    if (this.secondaryAudioEl) {
      this.secondaryAudioEl.currentTime = Math.max(0, videoTime - this.secondaryAudioOffset);
    }
  }

  playSecondaryAudio(): void {
    if (this.secondaryAudioEl) {
      this.secondaryAudioEl.play().catch((e) => {
        logger.warn('audioEngine', 'secondary audio play() rejected', e);
      });
    }
  }

  pauseSecondaryAudio(): void {
    if (this.secondaryAudioEl) {
      this.secondaryAudioEl.pause();
    }
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
    this.savePosition();
    if (this.audioEl) {
      this.audioEl.pause();
    }
    if (this.audioCtx && this.audioCtx.state === 'running') {
      await this.audioCtx.suspend();
    }
  }

  async destroy(): Promise<void> {
    this.savePosition();
    this.disconnectSecondaryAudio();
    this.disconnectNodes();
    this.cleanupAudioEl(this.audioEl);
    this.audioEl = null;
    this.sourceNode = null;
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
    if (!this.audioCtx) {
      this.ensureAudioContext();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  connectVideoElement(videoEl: HTMLVideoElement): void {
    this.ensureAudioContext();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch (e) {
        logger.warn('audioEngine', 'connectVideoElement: source disconnect failed', e);
      }
    }

    if (this.videoSourceNode) {
      if (this.videoSourceEl === videoEl) return;
      this.disconnectVideoElement();
    }

    if (!this.audioCtx) return;
    this.videoSourceNode = this.audioCtx.createMediaElementSource(videoEl);
    this.videoGainNode = this.audioCtx.createGain();
    this.videoSourceEl = videoEl;

    this.ensureEqChain();
    const firstFilter = this.eqFilters[0];
    if (firstFilter) {
      this.videoSourceNode.connect(this.videoGainNode);
      this.videoGainNode.connect(firstFilter);
    } else if (this.gainNode) {
      this.videoSourceNode.connect(this.videoGainNode);
      this.videoGainNode.connect(this.gainNode);
    }

    const player = usePlayerStore();
    this.videoGainNode.gain.value = player.isMuted ? 0 : player.volume;
  }

  disconnectVideoElement(): void {
    if (this.videoSourceNode) {
      try {
        this.videoSourceNode.disconnect();
      } catch (e) {
        logger.warn('audioEngine', 'disconnectVideoElement: video source disconnect failed', e);
      }
    }
    if (this.videoGainNode) {
      try {
        this.videoGainNode.disconnect();
      } catch (e) {
        logger.warn('audioEngine', 'disconnectVideoElement: video gain disconnect failed', e);
      }
    }
    this.videoSourceNode = null;
    this.videoGainNode = null;
    this.videoSourceEl = null;

    if (!this.sourceNode) return;
    const firstFilter = this.eqFilters[0];
    try {
      if (firstFilter) {
        this.sourceNode.connect(firstFilter);
      } else if (this.gainNode) {
        this.sourceNode.connect(this.gainNode);
      }
    } catch (e) {
      logger.warn('audioEngine', 'disconnectVideoElement: reconnect failed (source already disconnected)', e);
    }
  }

  setVideoVolume(v: number): void {
    if (this.videoGainNode) {
      this.videoGainNode.gain.value = v;
    }
    if (this.videoSourceEl) {
      this.videoSourceEl.volume = v;
    }
  }
}

export const audioEngine = new AudioEngine();
