import type { MediaFile } from '@renderer/types/media';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';
import { audioEvents } from '@renderer/utils/audioEvents';
import { toMediaServerUrl, toMediaStreamUrl } from '@renderer/utils/mediaUrl';
import { logger } from '@shared/logger';
import { AudioGraph } from './audioGraph';
import { AudioSecondary } from './audioSecondary';
import {
  attachMediaElementListeners,
  cleanupAudioElement,
  computeTrackNormalization,
  handleStreamSourceError
} from './audioEngineHelpers';

class AudioEngine {
  private graph = new AudioGraph();
  private audioEl: HTMLAudioElement | null = null;
  private secondary: AudioSecondary | null = null;
  private initialized = false;
  private savedPositions = new Map<string, number>();
  private normalization = 1;
  private preloadEl: HTMLAudioElement | null = null;
  private loadStartTs = 0;
  // Stream (YouTube online) playback state. Streams are proxied through the
  // media server (CORS-enabled, so the WebAudio graph/EQ/visualizer keep
  // working); googlevideo intermittently 403s and the proxy retries with
  // backoff. If the proxy path is exhausted, the raw URL is retried once
  // directly from the renderer (different request path) as a last resort.
  private streamUrl: string | null = null;
  private streamTriedDirect = false;
  private streamFinalRetried = false;
  private streamMode: 'proxy' | 'direct' | null = null;

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
    attachMediaElementListeners(el, {
      onEnded: () => this.handleEnded(),
      onError: (element) => this.handleStreamError(element),
      loadStartTs: () => this.loadStartTs,
      onCanplay: (element) => this.replayIfDesired(element)
    });
  }

  private replayIfDesired(el: HTMLAudioElement): void {
    // Re-play after a late/retried load: resumeAndPlay fires play() at +50ms,
    // which rejects while the element is still loading or errored (e.g. a
    // stream that needed proxy retries or a direct fallback). Once the media
    // is actually ready, re-issue play if the user still wants playback.
    if (this.streamMode && usePlayerStore().isPlaying && this.audioEl && this.audioEl.paused) {
      el.play().catch(() => {});
    }
  }

  private handleStreamError(el: HTMLAudioElement): void {
    handleStreamSourceError(el, {
      getStreamUrl: () => this.streamUrl,
      getMode: () => this.streamMode,
      getTriedDirect: () => this.streamTriedDirect,
      getFinalRetried: () => this.streamFinalRetried,
      setMode: (mode) => {
        this.streamMode = mode;
      },
      setTriedDirect: (value) => {
        this.streamTriedDirect = value;
      },
      setFinalRetried: (value) => {
        this.streamFinalRetried = value;
      },
      normalization: () => this.normalization,
      isMuted: () => usePlayerStore().isMuted,
      volume: () => usePlayerStore().volume,
      disconnectSourceNode: () => this.graph.disconnectSourceNode(),
      disconnectSecondary: () => this.disconnectSecondaryAudio(),
      connectAudio: (element) => this.connectAudio(element),
      setGain: (value) => {
        if (this.graph.gainNode) this.graph.gainNode.gain.value = value;
      }
    });
  }

  private handleEnded(): void {
    audioEvents.emit('trackEnd', undefined);
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

  private loadSource(src: string, opts?: { mode?: 'proxy' | 'direct' }): void {
    if (!this.audioEl) {
      const el = this.createAudioElement();
      this.setupListeners(el);
    }
    const mode = opts?.mode ?? null;
    this.streamMode = mode;
    if (!mode) {
      this.streamUrl = null;
      this.streamTriedDirect = false;
      this.streamFinalRetried = false;
    }
    this.loadStartTs = performance.now();
    const player = usePlayerStore();
    if (mode === 'direct') {
      // CORS-less cross-origin playback: no crossorigin attribute (a CORS-mode
      // fetch would be blocked by googlevideo, which sends no ACAO headers)
      // and no MediaElementSource connection (a tainted element would be
      // silent through the graph). Volume is applied on the element itself.
      this.audioEl!.crossOrigin = null;
      this.graph.disconnectSourceNode();
      this.disconnectSecondaryAudio();
      this.audioEl!.volume = (player.isMuted ? 0 : player.volume) * this.normalization;
    } else {
      this.audioEl!.crossOrigin = 'anonymous';
      this.audioEl!.volume = 1;
      this.connectAudio(this.audioEl!);
      if (this.graph.gainNode) {
        this.graph.gainNode.gain.value = (player.isMuted ? 0 : player.volume) * this.normalization;
      }
    }
    this.audioEl!.src = src;
    // Explicit load(): without it the element does not reload when the new src
    // equals the current one (e.g. retrying a cached stream URL after an
    // upstream hiccup), leaving playback stuck in the previous error state.
    this.audioEl!.load();
    logger.info(
      'audioEngine',
      `loadSource${mode === 'direct' ? ' (direct)' : ''} src=${src.slice(0, 160)}`
    );
    audioEvents.emit('bufferChange', 0);
    audioEvents.emit('trackLoaded', undefined);
  }

  loadTrack(track: MediaFile, options?: { resume?: boolean }): void {
    const settings = useSettingsStore();

    if (track.type === 'video') {
      return;
    }

    // Volume normalization / ReplayGain: apply the track's ReplayGain ratio
    // when either setting is enabled and the metadata carries a gain value.
    const enableNorm = settings.playback.replayGain || settings.playback.normalization;
    this.normalization = computeTrackNormalization(enableNorm, track.metadata?.replayGainTrackGain);

    this.loadSource(toMediaServerUrl(track.path));

    // Resuming a saved position is opt-in: only the Home "Continue" card asks
    // for it. Every other play path starts from the beginning, which is why the
    // default is not to touch the element's clock here.
    if (options?.resume && settings.playback.rememberPosition) {
      const savedPos = this.savedPositions.get(track.path) || 0;
      if (savedPos > 0) {
        this.applySavedPosition(track.path, savedPos);
      } else {
        // The in-memory map only holds positions saved during this session;
        // positions from earlier sessions live in the main-process store.
        void this.restoreSavedPosition(track.path);
      }
    }
  }

  // Seeks to `position` once metadata is available, but only while `path` is
  // still the loaded track (guards against a slow fetch landing after the user
  // already switched) and playback has not moved on.
  private applySavedPosition(path: string, position: number): void {
    const el = this.audioEl;
    if (!el) return;
    const apply = (): void => {
      if (!this.audioEl) return;
      if (usePlayerStore().currentTrack?.path !== path) return;
      if (this.audioEl.currentTime < 3) this.audioEl.currentTime = position;
    };
    // Fast local files can finish loading before this runs — seek immediately.
    if (el.readyState >= 1) {
      apply();
      return;
    }
    el.addEventListener('loadedmetadata', apply, { once: true });
  }

  private async restoreSavedPosition(path: string): Promise<void> {
    try {
      const position = (await window.api?.getPlaybackPosition(path)) || 0;
      if (position <= 0) return;
      this.savedPositions.set(path, position);
      if (usePlayerStore().currentTrack?.path !== path) return;
      this.applySavedPosition(path, position);
    } catch (e) {
      logger.warn('audio', 'restore saved position failed', e);
    }
  }

  // Plays a remote stream (YouTube online) through the media-server proxy. The
  // proxy retries googlevideo's transient 403s with backoff; if that is
  // exhausted the raw URL is retried directly from the renderer. Positions are
  // not persisted for streams; rememberPosition does not apply.
  loadRemote(url: string): void {
    this.normalization = 1;
    this.streamUrl = url;
    // A new stream must start with a clean retry ladder. `loadSource` only
    // resets these when mode is falsy, so clearing them here stops the previous
    // track's "final retry spent" flag from disabling this stream's last retry.
    this.streamTriedDirect = false;
    this.streamFinalRetried = false;
    logger.info('audioEngine', `loadRemote url=${url.slice(0, 160)}`);
    this.loadSource(toMediaStreamUrl(url), { mode: 'proxy' });
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
    if (this.streamMode === 'direct' && this.audioEl) {
      this.audioEl.volume = v * this.normalization;
      return;
    }
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
    cleanupAudioElement(this.audioEl);
    this.audioEl = null;
    // Release the prefetch element and the per-track position cache; both would
    // otherwise outlive the engine and keep a buffer/network handle alive.
    if (this.preloadEl) {
      this.preloadEl.pause();
      this.preloadEl.removeAttribute('src');
      this.preloadEl.load();
      this.preloadEl = null;
    }
    this.savedPositions.clear();
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
