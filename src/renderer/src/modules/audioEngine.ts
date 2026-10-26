import type { MediaFile } from '@renderer/types/media';
import { audioEvents } from '@renderer/utils/audioEvents';
import { toMediaServerUrl, toMediaStreamUrl } from '@renderer/utils/mediaUrl';
import { logger } from '@shared/logger';
import { RESUME_MIN_SECONDS } from '@shared/constants';
import { AudioGraph } from './audioGraph';
import type { EqBand } from '@renderer/utils/constants/audio';
import { AudioSecondary } from './audioSecondary';
import { AudioEnginePositions } from './audioEnginePositions';
import {
  attachMediaElementListeners,
  cleanupAudioElement,
  computeTrackNormalization,
  handleStreamSourceError,
  resolveReplayGainRatio,
  type ReplayGainMode
} from './audioEngineHelpers';

export interface AudioEngineStateProvider {
  getCurrentTrackPath?: () => string | null;
  getCurrentTrack?: () => MediaFile | null;
  isMuted?: () => boolean;
  getVolume?: () => number;
  isPlaying?: () => boolean;
}

class AudioEngine {
  private graph = new AudioGraph();
  private audioEl: HTMLAudioElement | null = null;
  private secondary: AudioSecondary | null = null;
  private readonly positionsStore = new AudioEnginePositions();
  private normalization = 1;
  private preloadEl: HTMLAudioElement | null = null;
  private lastPreloadPath = '';
  private loadStartTs = 0;
  private currentVolume = 1;
  private isMuted = false;
  private desiredPlay = false;
  private replayGainMode: ReplayGainMode = 'off';
  private rememberPosition = true;
  private currentTrackPath: string | null = null;
  private currentTrackType: MediaFile['type'] | null = null;
  private stateProvider: AudioEngineStateProvider | null = null;
  private lastSavedPosition = 0;

  // Stan odtwarzania strumieni (YouTube online). Strumienie przechodzą przez proxy
  // serwera mediów (z CORS, dzięki czemu graf WebAudio/EQ/wizualizator dalej
  // działają); googlevideo okresowo zwraca 403, a proxy ponawia z
  // backoffem. Gdy ścieżka proxy zostanie wyczerpana, surowy URL jest ponawiany raz
  // bezpośrednio z renderera (inna ścieżka żądania) jako ostatnia deska ratunku.
  private streamUrl: string | null = null;
  private streamTriedDirect = false;
  private streamFinalRetried = false;
  private streamMode: 'proxy' | 'direct' | null = null;

  setStateProvider(provider: AudioEngineStateProvider | null): void {
    this.stateProvider = provider;
  }

  setReplayGainMode(mode: ReplayGainMode): void {
    this.replayGainMode = mode;
    // Zmiana trybu (np. track -> album) musi działać od razu na bieżącym utworze,
    // a nie dopiero po następnym `loadTrack`.
    const track = this.stateProvider?.getCurrentTrack?.() ?? null;
    this.normalization = computeTrackNormalization(
      mode !== 'off',
      resolveReplayGainRatio(mode, track?.metadata)
    );
    this.applyVolume();
  }

  setRememberPosition(enabled: boolean): void {
    this.rememberPosition = enabled;
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    this.applyVolume();
  }

  private getEffectiveVolume(): number {
    const muted = this.stateProvider?.isMuted?.() ?? this.isMuted;
    const vol = this.stateProvider?.getVolume?.() ?? this.currentVolume;
    return (muted ? 0 : vol) * this.normalization;
  }

  private applyVolume(): void {
    const effective = this.getEffectiveVolume();
    if (this.streamMode === 'direct' && this.audioEl) {
      this.audioEl.volume = effective;
      return;
    }
    if (this.graph.gainNode) {
      this.graph.gainNode.gain.value = effective;
    }
  }

  private getActiveTrackPath(): string | null {
    return this.stateProvider?.getCurrentTrackPath?.() ?? this.currentTrackPath;
  }

  get sourceNode(): MediaElementAudioSourceNode | null {
    return this.graph.sourceNode;
  }

  get videoSourceNode(): MediaElementAudioSourceNode | null {
    return this.graph.videoSourceNode;
  }

  get videoGainNode(): GainNode | null {
    return this.graph.videoGainNode;
  }

  get eqFilters(): AudioNode[] {
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
      onEnded: () => {
        const path = this.getActiveTrackPath();
        if (path) {
          this.clearSavedPosition(path);
        }
        this.handleEnded();
      },
      onError: (element) => this.handleStreamError(element),
      loadStartTs: () => this.loadStartTs,
      onCanplay: (element) => this.replayIfDesired(element),
      onPause: () => {
        this.savePosition();
      },
      onTimeUpdate: (currentTime) => {
        if (Math.abs(currentTime - this.lastSavedPosition) > 3) {
          this.lastSavedPosition = currentTime;
          this.savePosition();
        }
      }
    });
  }

  private replayIfDesired(el: HTMLAudioElement): void {
    // Ponów odtwarzanie po późnym/ponowionym wczytaniu: resumeAndPlay odpala play() po +50ms,
    // co odrzuca, gdy element wciąż się ładuje lub ma błąd (np.
    // strumień wymagający ponowień proxy lub bezpośredniego fallbacku). Gdy media
    // są faktycznie gotowe, ponów play, jeśli użytkownik nadal chce odtwarzania.
    const isPlaying = this.stateProvider?.isPlaying?.() ?? this.desiredPlay;
    if (this.streamMode && isPlaying && this.audioEl && this.audioEl.paused) {
      el.play().catch(() => {
        /* best-effort */
      });
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
      isMuted: () => this.stateProvider?.isMuted?.() ?? this.isMuted,
      volume: () => this.stateProvider?.getVolume?.() ?? this.currentVolume,
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

  // Utwórz AudioContext z wyprzedzeniem w czasie bezczynności, żeby pierwsze kliknięcie odtwarzania
  // nie ponosiło synchronicznie (kosztownego) jednorazowego kosztu tworzenia kontekstu.
  warmUp(): void {
    this.graph.ensureContext();
  }

  savePosition(): void {
    // Celowo stan LOKALNY przed providerem: `loadTrack` zapisuje pozycję wychodzącego
    // utworu, a store wskazuje już następny. `getActiveTrackPath` (provider-first)
    // służy do sprawdzenia, czy zastosować zapisaną pozycję — to inny cel.
    const trackPath = this.currentTrackPath ?? this.stateProvider?.getCurrentTrackPath?.() ?? null;
    const trackType =
      this.currentTrackType ?? this.stateProvider?.getCurrentTrack?.()?.type ?? 'audio';
    if (this.audioEl && trackPath && trackType === 'audio') {
      if (this.audioEl.currentTime > RESUME_MIN_SECONDS) {
        this.positionsStore.persist(trackPath, this.audioEl.currentTime);
      }
    }
  }

  clearSavedPosition(path: string): void {
    this.positionsStore.clear(path);
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
    const effectiveVol = this.getEffectiveVolume();
    if (mode === 'direct') {
      // Odtwarzanie cross-origin bez CORS: brak atrybutu crossorigin (fetch w trybie CORS
      // zostałby zablokowany przez googlevideo, które nie wysyła nagłówków ACAO)
      // oraz brak połączenia MediaElementSource (skażony element byłby
      // cichy przez graf). Głośność jest stosowana na samym elemencie.
      this.audioEl!.crossOrigin = null;
      this.graph.disconnectSourceNode();
      this.disconnectSecondaryAudio();
      this.audioEl!.volume = effectiveVol;
    } else {
      this.audioEl!.crossOrigin = 'anonymous';
      this.audioEl!.volume = 1;
      this.connectAudio(this.audioEl!);
      if (this.graph.gainNode) {
        this.graph.gainNode.gain.value = effectiveVol;
      }
    }
    this.audioEl!.src = src;
    // Jawne load(): bez niego element nie przeładuje się, gdy nowy src
    // równa się bieżącemu (np. ponawianie zbuforowanego stream URL po
    // potknięciu upstreamu), zostawiając odtwarzanie w poprzednim stanie błędu.
    this.audioEl!.load();
    logger.info(
      'audioEngine',
      `loadSource${mode === 'direct' ? ' (direct)' : ''} src=${src.slice(0, 160)}`
    );
    audioEvents.emit('bufferChange', 0);
    audioEvents.emit('trackLoaded', undefined);
  }

  loadTrack(
    track: MediaFile,
    options?: { resume?: boolean; enableNormalization?: boolean; rememberPosition?: boolean }
  ): void {
    if (track.type === 'video') {
      return;
    }

    if (this.currentTrackPath && this.currentTrackPath !== track.path) {
      this.savePosition();
    }
    this.lastSavedPosition = 0;

    this.currentTrackPath = track.path;
    this.currentTrackType = track.type;

    // Normalizacja głośności / ReplayGain: zastosuj współczynnik ReplayGain utworu,
    // gdy którekolwiek ustawienie jest włączone, a metadane niosą wartość gain.
    const enableNorm = options?.enableNormalization ?? this.replayGainMode !== 'off';
    this.normalization = computeTrackNormalization(
      enableNorm,
      resolveReplayGainRatio(this.replayGainMode, track.metadata)
    );

    this.loadSource(toMediaServerUrl(track.path));

    // Wznawianie zapisanej pozycji jest opcjonalne: prosi o nie tylko karta
    // "Kontynuuj" na stronie głównej. Każda inna ścieżka odtwarzania startuje od początku,
    // dlatego domyślnie nie ruszamy tutaj zegara elementu.
    const remember = options?.rememberPosition ?? this.rememberPosition;
    if (options?.resume && remember) {
      const savedPos = this.positionsStore.get(track.path);
      if (savedPos > 0) {
        this.applySavedPosition(track.path, savedPos);
      } else {
        // Mapa w pamięci trzyma tylko pozycje zapisane w tej sesji;
        // pozycje z wcześniejszych sesji żyją w store procesu głównego.
        void this.restoreSavedPosition(track.path);
      }
    }
  }

  // Przewija do `position`, gdy metadane są dostępne, ale tylko dopóki `path` to
  // wciąż wczytany utwór (zabezpiecza przed wolnym fetchem lądującym po tym, jak użytkownik
  // już przełączył) i odtwarzanie nie poszło dalej.
  private applySavedPosition(path: string, position: number): void {
    const el = this.audioEl;
    if (!el) return;
    const apply = (): void => {
      if (!this.audioEl) return;
      if (this.getActiveTrackPath() !== path) return;
      if (this.audioEl.currentTime < 3) this.audioEl.currentTime = position;
    };
    // Szybkie lokalne pliki mogą skończyć ładowanie przed tym wywołaniem — przewiń natychmiast.
    if (el.readyState >= 1) {
      apply();
      return;
    }
    el.addEventListener('loadedmetadata', apply, { once: true });
  }

  private async restoreSavedPosition(path: string): Promise<void> {
    const position = await this.positionsStore.restore(path);
    if (position <= 0) return;
    if (this.getActiveTrackPath() !== path) return;
    this.applySavedPosition(path, position);
  }

  // Odtwarza zdalny strumień (YouTube online) przez proxy serwera mediów.
  // Proxy ponawia przejściowe 403 googlevideo z backoffem; jeśli to zostanie
  // wyczerpane, surowy URL jest ponawiany bezpośrednio z renderera. Pozycje nie są
  // zapisywane dla strumieni; rememberPosition nie ma zastosowania.
  loadRemote(url: string): void {
    this.normalization = 1;
    this.streamUrl = url;
    this.currentTrackPath = url;
    this.currentTrackType = 'stream';
    // Nowy strumień musi zacząć z czystą drabinką ponowień. `loadSource` resetuje
    // je tylko gdy mode jest fałszywe, więc wyzerowanie ich tutaj nie pozwala
    // flagie "ostatnie ponowienie zużyte" poprzedniego utworu wyłączyć ostatniego ponowienia tego strumienia.
    this.streamTriedDirect = false;
    this.streamFinalRetried = false;
    logger.info('audioEngine', `loadRemote url=${url.slice(0, 160)}`);
    // Ścieżka już będąca proxy serwera mediów (np. `/stream?provider=` dla MEGA) nie może
    // być opakowana ponownie.
    this.loadSource(/\/stream\?/.test(url) ? url : toMediaStreamUrl(url), { mode: 'proxy' });
  }

  play(): void {
    this.desiredPlay = true;
    this.audioEl?.play().catch((e) => {
      logger.warn('audioEngine', 'audio play() rejected', e);
    });
  }

  pause(): void {
    this.desiredPlay = false;
    this.audioEl?.pause();
  }

  seek(time: number): void {
    if (!Number.isFinite(time)) return;
    if (this.audioEl) this.audioEl.currentTime = time;
  }

  setVolume(v: number): void {
    this.currentVolume = Math.max(0, Math.min(1, v));
    this.applyVolume();
  }

  // Rozgrzewa cache dla następnego utworu, żeby przejście było możliwie
  // płynne (używane przez ustawienie "odtwarzanie bez przerw").
  preloadNext(track: MediaFile): void {
    // Ten sam utwór bywa preloadowany wielokrotnie (zmiany kolejki/ustawień) —
    // ponowne ustawienie `src`+`load()` marnowałoby pasmo i odrzucało bufor.
    if (this.preloadEl && this.lastPreloadPath === track.path) return;
    if (!this.preloadEl) {
      this.preloadEl = new Audio();
      this.preloadEl.preload = 'auto';
      this.preloadEl.crossOrigin = 'anonymous';
    }
    this.lastPreloadPath = track.path;
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

  setEqBands(bands: readonly EqBand[]): void {
    this.graph.setEqBands(bands);
  }

  setEqPreamp(db: number): void {
    this.graph.setEqPreamp(db);
  }

  setEqEnabled(enabled: boolean): void {
    this.graph.setEqEnabled(enabled);
  }

  setEqMono(on: boolean): void {
    this.graph.setEqMono(on);
  }

  setNightMode(on: boolean): void {
    this.graph.setNightMode(on);
  }

  setAudioDelayMs(ms: number): void {
    this.graph.setAudioDelayMs(ms);
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

  async deactivate(): Promise<void> {
    this.desiredPlay = false;
    this.savePosition();
    if (this.audioEl) {
      this.audioEl.pause();
    }
    await this.graph.suspendContext();
  }

  async destroy(): Promise<void> {
    this.desiredPlay = false;
    this.savePosition();
    this.disconnectSecondaryAudio();
    // `secondary` powstał z kontekstu grafu; po jego zamknięciu musi zostać zresetowany,
    // inaczej kolejne `connectSecondaryAudio` użyłoby obiektu z martwym kontekstem.
    this.secondary = null;
    this.graph.disconnectNodes();
    cleanupAudioElement(this.audioEl);
    this.audioEl = null;
    // Zwolnij element prefetch i cache pozycji per utwór; oba w przeciwnym razie
    // przeżyłyby silnik i trzymały bufor/uchwyt sieciowy przy życiu.
    if (this.preloadEl) {
      this.preloadEl.pause();
      this.preloadEl.removeAttribute('src');
      this.preloadEl.load();
      this.preloadEl = null;
    }
    this.lastPreloadPath = '';
    this.positionsStore.clearAll();
    await this.graph.closeContext();
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
    this.graph.connectVideoElement(videoEl, this.getEffectiveVolume());
  }

  disconnectVideoElement(): void {
    this.graph.disconnectVideoElement();
  }

  setVideoVolume(v: number): void {
    this.graph.setVideoVolume(v);
  }
}

export const audioEngine = new AudioEngine();
