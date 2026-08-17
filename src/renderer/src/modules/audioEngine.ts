import type { MediaFile } from '@renderer/types/media';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';
import { audioEvents } from '@renderer/utils/audioEvents';
import { toMediaServerUrl } from '@renderer/utils/mediaUrl';
import { logger } from '@shared/logger';
import { AudioGraph } from './audioGraph';
import { AudioSecondary } from './audioSecondary';

class AudioEngine {
  private graph = new AudioGraph();
  private audioEl: HTMLAudioElement | null = null;
  private secondary: AudioSecondary | null = null;
  private initialized = false;
  private savedPositions = new Map<string, number>();
  private normalization = 1;
  private preloadEl: HTMLAudioElement | null = null;

  get sourceNode(): MediaElementAudioSourceNode | null {
    return this.graph.sourceNode;
  }

  get videoSourceNode(): MediaElementAudioSourceNode | null {
    return this.graph.videoSourceNode;
  }

  get videoGainNode(): GainNode | null {
    return this.graph.videoGainNode;
  }

  get eqFilters(): BiquadFilterNode[] {
    return this.graph.eqFilters;
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
    audioEvents.emit('trackEnd', undefined);
  }

  private cleanupAudioEl(el: HTMLAudioElement | null): void {
    if (!el) return;
    el.pause();
    el.removeAttribute('src');
    el.load();
  }

  private connectAudio(el: HTMLAudioElement): void {
    this.graph.connectSource(el);
    this.disconnectSecondaryAudio();
    this.graph.disconnectVideoElement();
  }

  init(): void {
    if (this.initialized) return;
    this.initialized = true;
  }

  // Pre-create the AudioContext during idle time so the first playback click
  // doesn't pay the (expensive) one-time context creation cost synchronously.
  warmUp(): void {
    this.graph.ensureContext();
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

    // Volume normalization / ReplayGain: apply the track's ReplayGain ratio
    // when either setting is enabled and the metadata carries a gain value.
    const enableNorm = settings.playback.replayGain || settings.playback.normalization;
    const ratio = track.metadata?.replayGainTrackGain;
    this.normalization =
      enableNorm && typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0
        ? Math.min(4, Math.max(0.25, ratio))
        : 1;

    if (!this.audioEl) {
      const el = this.createAudioElement();
      this.setupListeners(el);
    }
    this.audioEl!.src = toMediaServerUrl(track.path);
    logger.info('audioEngine', `loadTrack src=${toMediaServerUrl(track.path)}`);
    this.connectAudio(this.audioEl!);
    if (this.graph.gainNode)
      this.graph.gainNode.gain.value =
        (usePlayerStore().isMuted ? 0 : usePlayerStore().volume) * this.normalization;

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
    if (this.graph.gainNode) this.graph.gainNode.gain.value = v * this.normalization;
  }

  // Warms the cache for the next track so the transition is as seamless as
  // possible (used by the "gapless playback" setting).
  preloadNext(track: MediaFile): void {
    if (!this.preloadEl) {
      this.preloadEl = new Audio();
      this.preloadEl.preload = 'auto';
      this.preloadEl.crossOrigin = 'anonymous';
    }
    this.preloadEl.src = toMediaServerUrl(track.path);
    this.preloadEl.load();
  }

  get hasSecondaryAudio(): boolean {
    return this.secondary?.hasSecondaryAudio ?? false;
  }

  set secondaryAudioTimeOffset(offset: number) {
    if (this.secondary) this.secondary.timeOffset = offset;
  }

  async connectSecondaryAudio(audioPath: string, timeOffset = 0): Promise<void> {
    await this.disconnectSecondaryAudio();

    this.graph.ensureContext();

    if (this.graph.sourceNode) {
      try {
        this.graph.sourceNode.disconnect();
      } catch (e) {
        logger.warn('audioEngine', 'disconnect source node failed', e);
      }
    }

    if (!this.secondary) {
      this.secondary = new AudioSecondary(this.graph.audioCtx!, this.graph.gainNode!);
    }
    await this.secondary.connect(audioPath, timeOffset);
    try {
      if (this.graph.sourceNode && this.graph.gainNode) {
        this.graph.sourceNode.connect(this.graph.gainNode);
      }
    } catch (e) {
      logger.warn('audioEngine', 'reconnect source node failed', e);
    }
  }

  disconnectSecondaryAudio(): void {
    this.secondary?.disconnect();
  }

  seekSecondaryAudio(videoTime: number): void {
    this.secondary?.seek(videoTime);
  }

  playSecondaryAudio(): void {
    this.secondary?.play();
  }

  pauseSecondaryAudio(): void {
    this.secondary?.pause();
  }

  setPlaybackRate(rate: number): void {
    if (this.audioEl) this.audioEl.playbackRate = rate;
  }

  setEqualizerBand(index: number, gain: number): void {
    this.graph.setEqualizerBand(index, gain);
  }

  applyEqPreset(preset: Record<number, number>): void {
    this.graph.applyEqPreset(preset);
  }

  getAnalyserNode(): AnalyserNode | null {
    return this.graph.getAnalyserNode();
  }

  getAudioContext(): AudioContext | null {
    return this.graph.getAudioContext();
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
    await this.graph.suspendContext();
  }

  async destroy(): Promise<void> {
    this.savePosition();
    this.disconnectSecondaryAudio();
    this.graph.disconnectNodes();
    this.cleanupAudioEl(this.audioEl);
    this.audioEl = null;
    await this.graph.closeContext();
    this.initialized = false;
  }

  resumeContext(): void {
    this.graph.resumeContext();
  }

  resume(): void {
    if (!this.graph.audioCtx) {
      this.graph.ensureContext();
    }
    this.graph.resumeContext();
  }

  connectVideoElement(videoEl: HTMLVideoElement): void {
    this.graph.connectVideoElement(videoEl);
  }

  disconnectVideoElement(): void {
    this.graph.disconnectVideoElement();
  }

  setVideoVolume(v: number): void {
    this.graph.setVideoVolume(v);
  }
}

export const audioEngine = new AudioEngine();
