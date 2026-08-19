import type { MediaFile } from '@renderer/types/media';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';
import { audioEvents } from '@renderer/utils/audioEvents';
import { toMediaServerUrl, toMediaStreamUrl } from '@renderer/utils/mediaUrl';
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
      this.handleStreamError(el);
    });
    el.addEventListener('loadstart', () => {
      logger.info('audioEngine', `loadstart +${Math.round(performance.now() - this.loadStartTs)}ms`);
    });
    el.addEventListener('loadeddata', () => {
      logger.info('audioEngine', `loadeddata +${Math.round(performance.now() - this.loadStartTs)}ms`);
    });
    el.addEventListener('canplay', () => {
      logger.info('audioEngine', `canplay +${Math.round(performance.now() - this.loadStartTs)}ms`);
      audioEvents.emit('playable', undefined);
      // Re-play after a late/retried load: resumeAndPlay fires play() at +50ms,
      // which rejects while the element is still loading or errored (e.g. a
      // stream that needed proxy retries or a direct fallback). Once the media
      // is actually ready, re-issue play if the user still wants playback.
      if (this.streamMode && usePlayerStore().isPlaying && this.audioEl && this.audioEl.paused) {
        this.audioEl.play().catch(() => {});
      }
    });
  }

  // Stream error handling ladder:
  //   proxy retries exhausted        -> direct retry once (different request path)
  //   direct failed too              -> one more proxy pass (the per-IP throttle
  //                                     window may have passed meanwhile)
  //   that failed as well            -> streamError event (footer shows it)
  private handleStreamError(el: HTMLAudioElement): void {
    const err = el.error;
    logger.warn(
      'audioEngine',
      `audio element error code=${err?.code} message=${err?.message} src=${(el.src || '').slice(0, 120)}`
    );
    if (!this.streamUrl) return;
    if (this.streamMode === 'proxy' && !this.streamTriedDirect) {
      // Proxy retries (403 with backoff) were exhausted — retry the raw URL
      // once directly from the renderer as a different request path.
      this.streamTriedDirect = true;
      this.streamMode = 'direct';
      logger.info('audioEngine', `stream proxy failed -> direct retry url=${this.streamUrl.slice(0, 120)}`);
      const player = usePlayerStore();
      el.crossOrigin = null;
      this.graph.disconnectSourceNode();
      this.disconnectSecondaryAudio();
      el.volume = (player.isMuted ? 0 : player.volume) * this.normalization;
      el.src = this.streamUrl;
      el.load();
      audioEvents.emit('bufferChange', 0);
      return;
    }
    if (this.streamMode === 'direct' && !this.streamFinalRetried) {
      // Direct retry failed as well — go back through the proxy one last time.
      this.streamFinalRetried = true;
      this.streamMode = 'proxy';
      logger.info('audioEngine', `stream direct failed -> proxy retry url=${this.streamUrl.slice(0, 120)}`);
      const player = usePlayerStore();
      el.crossOrigin = 'anonymous';
      el.volume = 1;
      this.connectAudio(el);
      if (this.graph.gainNode) {
        this.graph.gainNode.gain.value =
          (player.isMuted ? 0 : player.volume) * this.normalization;
      }
      el.src = toMediaStreamUrl(this.streamUrl);
      el.load();
      audioEvents.emit('bufferChange', 0);
      return;
    }
    audioEvents.emit('streamError', 'stream-failed');
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
        this.graph.gainNode.gain.value =
          (player.isMuted ? 0 : player.volume) * this.normalization;
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

    this.loadSource(toMediaServerUrl(track.path));

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

  // Plays a remote stream (YouTube online) through the media-server proxy. The
  // proxy retries googlevideo's transient 403s with backoff; if that is
  // exhausted the raw URL is retried directly from the renderer. Positions are
  // not persisted for streams; rememberPosition does not apply.
  loadRemote(url: string): void {
    this.normalization = 1;
    this.streamUrl = url;
    this.streamTriedDirect = false;
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
