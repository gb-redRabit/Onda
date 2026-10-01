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
  // Stan odtwarzania strumieni (YouTube online). Strumienie przechodzą przez proxy
  // serwera mediów (z CORS, dzięki czemu graf WebAudio/EQ/wizualizator dalej
  // działają); googlevideo okresowo zwraca 403, a proxy ponawia z
  // backoffem. Gdy ścieżka proxy zostanie wyczerpana, surowy URL jest ponawiany raz
  // bezpośrednio z renderera (inna ścieżka żądania) jako ostatnia deska ratunku.
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
    // Ponów odtwarzanie po późnym/ponowionym wczytaniu: resumeAndPlay odpala play() po +50ms,
    // co odrzuca, gdy element wciąż się ładuje lub ma błąd (np.
    // strumień wymagający ponowień proxy lub bezpośredniego fallbacku). Gdy media
    // są faktycznie gotowe, ponów play, jeśli użytkownik nadal chce odtwarzania.
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

  // Utwórz AudioContext z wyprzedzeniem w czasie bezczynności, żeby pierwsze kliknięcie odtwarzania
  // nie ponosiło synchronicznie (kosztownego) jednorazowego kosztu tworzenia kontekstu.
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
      // Odtwarzanie cross-origin bez CORS: brak atrybutu crossorigin (fetch w trybie CORS
      // zostałby zablokowany przez googlevideo, które nie wysyła nagłówków ACAO)
      // oraz brak połączenia MediaElementSource (skażony element byłby
      // cichy przez graf). Głośność jest stosowana na samym elemencie.
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

  loadTrack(track: MediaFile, options?: { resume?: boolean }): void {
    const settings = useSettingsStore();

    if (track.type === 'video') {
      return;
    }

    // Normalizacja głośności / ReplayGain: zastosuj współczynnik ReplayGain utworu,
    // gdy którekolwiek ustawienie jest włączone, a metadane niosą wartość gain.
    const enableNorm = settings.playback.replayGain || settings.playback.normalization;
    this.normalization = computeTrackNormalization(enableNorm, track.metadata?.replayGainTrackGain);

    this.loadSource(toMediaServerUrl(track.path));

    // Wznawianie zapisanej pozycji jest opcjonalne: prosi o nie tylko karta
    // "Kontynuuj" na stronie głównej. Każda inna ścieżka odtwarzania startuje od początku,
    // dlatego domyślnie nie ruszamy tutaj zegara elementu.
    if (options?.resume && settings.playback.rememberPosition) {
      const savedPos = this.savedPositions.get(track.path) || 0;
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
      if (usePlayerStore().currentTrack?.path !== path) return;
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

  // Odtwarza zdalny strumień (YouTube online) przez proxy serwera mediów.
  // Proxy ponawia przejściowe 403 googlevideo z backoffem; jeśli to zostanie
  // wyczerpane, surowy URL jest ponawiany bezpośrednio z renderera. Pozycje nie są
  // zapisywane dla strumieni; rememberPosition nie ma zastosowania.
  loadRemote(url: string): void {
    this.normalization = 1;
    this.streamUrl = url;
    // Nowy strumień musi zacząć z czystą drabinką ponowień. `loadSource` resetuje
    // je tylko gdy mode jest fałszywe, więc wyzerowanie ich tutaj nie pozwala
    // flagie "ostatnie ponowienie zużyte" poprzedniego utworu wyłączyć ostatniego ponowienia tego strumienia.
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

  // Rozgrzewa cache dla następnego utworu, żeby przejście było możliwie
  // płynne (używane przez ustawienie "odtwarzanie bez przerw").
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
    // Zwolnij element prefetch i cache pozycji per utwór; oba w przeciwnym razie
    // przeżyłyby silnik i trzymały bufor/uchwyt sieciowy przy życiu.
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
