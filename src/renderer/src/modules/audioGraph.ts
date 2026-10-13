import { logger } from '@shared/logger';
import type { EqBand } from '@renderer/utils/constants/audio';
import { iirCoefficients } from '@renderer/utils/eqBiquad';

// Stała liczba slotów filtrów (neutralne, gdy nieużywane) — dzięki temu dodawanie/usuwanie
// pasm nie wymaga przebudowy łańcucha.
const EQ_SLOTS = 12;

export class AudioGraph {
  audioCtx: AudioContext | null = null;
  analyserNode: AnalyserNode | null = null;
  sourceNode: MediaElementAudioSourceNode | null = null;
  gainNode: GainNode | null = null;
  eqFilters: AudioNode[] = [];
  /** Gain wyjściowy korektora (preamp) — między łańcuchem filtrów a głównym gainNode. */
  preampNode: GainNode | null = null;
  /** Węzeł odsłuchu — pozwala spiąć kanały do mono (kontrola fazy). */
  monitorNode: GainNode | null = null;
  eqMono = false;
  /**
   * Tryb nocny: kompresor dynamiki + podbicie dialogów. Węzły są na stałe w łańcuchu,
   * a przełączenie zmienia tylko ich parametry (neutralne = brak wpływu) — bez przebudowy
   * grafu i bez trzasków.
   */
  nightCompressor: DynamicsCompressorNode | null = null;
  nightMakeup: GainNode | null = null;
  nightDialogueEq: BiquadFilterNode | null = null;
  nightEnabled = false;
  /**
   * Kompensacja opóźnienia dźwięku: `DelayNode` opóźnia ścieżkę audio względem obrazu.
   * Węzeł jest na stałe w łańcuchu; przy zerze opóźnienie jest neutralne.
   */
  delayNode: DelayNode | null = null;
  audioDelayMs = 0;
  /** Ostatnio ustawione pasma — nakładane na filtry także przy (od)tworzeniu kontekstu. */
  eqBands: readonly EqBand[] = [];
  eqEnabled = true;
  eqPreampDb = 0;
  videoSourceNode: MediaElementAudioSourceNode | null = null;
  videoGainNode: GainNode | null = null;
  videoSourceEl: HTMLVideoElement | null = null;
  eqChainBuilt = false;

  ensureContext(): void {
    if (this.audioCtx) return;
    this.audioCtx = new AudioContext();
    this.analyserNode = this.audioCtx.createAnalyser();
    this.analyserNode.fftSize = 2048;
    this.gainNode = this.audioCtx.createGain();
    this.preampNode = this.audioCtx.createGain();
    this.setEqPreamp(this.eqPreampDb);
    this.monitorNode = this.audioCtx.createGain();
    this.setEqMono(this.eqMono);
    this.nightCompressor = this.audioCtx.createDynamicsCompressor();
    this.nightMakeup = this.audioCtx.createGain();
    this.nightDialogueEq = this.audioCtx.createBiquadFilter();
    this.nightDialogueEq.type = 'peaking';
    this.nightDialogueEq.frequency.value = 2500;
    this.nightDialogueEq.Q.value = 1;
    this.applyNightParams();
    this.delayNode = this.audioCtx.createDelay(1);
    this.setAudioDelayMs(this.audioDelayMs);
  }

  ensureEqChain(): void {
    this.ensureContext();
    if (this.eqChainBuilt) return;
    this.rebuildEqFilters();
    this.preampNode!.connect(this.nightCompressor!);
    this.nightCompressor!.connect(this.nightMakeup!);
    this.nightMakeup!.connect(this.nightDialogueEq!);
    this.nightDialogueEq!.connect(this.delayNode!);
    this.delayNode!.connect(this.gainNode!);
    this.gainNode!.connect(this.monitorNode!);
    this.monitorNode!.connect(this.analyserNode!);
    this.analyserNode!.connect(this.audioCtx!.destination);
    this.eqChainBuilt = true;
  }

  /**
   * (Prze)budowuje IIR-y z bieżących pasm i łączy [źródło/wideo] → filtry → preamp.
   * `IIRFilterNode` ma stałe współczynniki, więc każda zmiana pasma wymaga przebudowy
   * (krótkie, jednorazowe rozłączenie łańcucha).
   */
  private rebuildEqFilters(): void {
    const ctx = this.audioCtx;
    if (!ctx) return;
    for (const f of this.eqFilters) {
      try {
        f.disconnect();
      } catch {
        /* ok */
      }
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        /* ok */
      }
    }
    if (this.videoGainNode) {
      try {
        this.videoGainNode.disconnect();
      } catch {
        /* ok */
      }
    }
    const passthrough = { feedforward: [1, 0, 0], feedback: [1, 0, 0] };
    const slots = Math.max(EQ_SLOTS, this.eqBands.length);
    this.eqFilters = Array.from({ length: slots }, (_, i) => {
      const band =
        this.eqEnabled && this.eqBands[i]?.enabled !== false ? this.eqBands[i] : undefined;
      const c = band ? iirCoefficients(band, ctx.sampleRate) : passthrough;
      return ctx.createIIRFilter(c.feedforward, c.feedback);
    });
    const first = this.eqFilters[0];
    if (first) {
      if (this.sourceNode) this.sourceNode.connect(first);
      if (this.videoGainNode) this.videoGainNode.connect(first);
      let prev: AudioNode = first;
      for (let i = 1; i < this.eqFilters.length; i++) {
        prev.connect(this.eqFilters[i]);
        prev = this.eqFilters[i];
      }
      if (this.preampNode) prev.connect(this.preampNode);
    } else {
      if (this.sourceNode && this.preampNode) this.sourceNode.connect(this.preampNode);
      if (this.videoGainNode && this.preampNode) this.videoGainNode.connect(this.preampNode);
    }
  }

  connectSource(el: HTMLAudioElement): void {
    this.ensureContext();
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
      this.rebuildEqFilters();
    }
  }

  // Odłącza wszystkie węzły źródłowe od grafu bez rozbierania reszty
  // łańcucha (gain/analyser/destination pozostają podłączone). Używane przy bezpośrednim
  // odtwarzaniu strumienia: cross-origin element mediów bez CORS przepuszczony przez graf
  // zostałby skażony (cisza), więc musi grać natywnie na wyjściu.
  disconnectSourceNode(): void {
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
  }

  disconnectNodes(): void {
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

  connectVideoElement(videoEl: HTMLVideoElement, initialVolume = 1): void {
    this.ensureContext();
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
      if (this.videoSourceEl === videoEl) {
        // Ten sam element, nowe źródło — przywróć głośność. Gain mógł zostać
        // wyzerowany przez transkodowanie audio poprzedniego utworu i bez tego
        // resetu kolejne wideo grałoby bez dźwięku.
        if (this.videoGainNode) {
          this.videoGainNode.gain.value = initialVolume;
        }
        return;
      }
      this.disconnectVideoElement();
    }

    if (!this.audioCtx) return;
    this.videoSourceNode = this.audioCtx.createMediaElementSource(videoEl);
    this.videoGainNode = this.audioCtx.createGain();
    this.videoSourceEl = videoEl;

    this.ensureEqChain();
    if (this.videoSourceNode) this.videoSourceNode.connect(this.videoGainNode!);
    this.rebuildEqFilters();

    this.videoGainNode.gain.value = initialVolume;
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
    this.rebuildEqFilters();
  }

  setVideoVolume(v: number): void {
    if (this.videoGainNode) {
      this.videoGainNode.gain.value = v;
    }
    if (this.videoSourceEl) {
      this.videoSourceEl.volume = v;
    }
  }

  /** Ustawia pasma i (prze)budowuje łańcuch IIR; nadmiarowe sloty stają się neutralne. */
  setEqBands(bands: readonly EqBand[]): void {
    this.eqBands = bands;
    if (this.eqChainBuilt) this.rebuildEqFilters();
  }

  /** Preamp: płaski gain wyjściowy korektora (dB). */
  setEqPreamp(db: number): void {
    this.eqPreampDb = db;
    if (this.preampNode) this.preampNode.gain.value = Math.pow(10, db / 20);
  }

  /** Włącz/wyłącz korektor bez utraty pasm (bypass = wszystkie filtry neutralne). */
  setEqEnabled(enabled: boolean): void {
    this.eqEnabled = enabled;
    this.setEqBands(this.eqBands);
  }

  /** Odsłuch mono: spina kanały (channelCount 1) — do kontroli fazy/zgodności. */
  setEqMono(on: boolean): void {
    this.eqMono = on;
    if (!this.monitorNode) return;
    this.monitorNode.channelCount = on ? 1 : 2;
    this.monitorNode.channelCountMode = 'explicit';
    this.monitorNode.channelInterpretation = 'speakers';
  }

  /** Tryb nocny: kompresja dynamiki — ciche dialogi głośniej, efekty/eksplozje ciszej. */
  setNightMode(on: boolean): void {
    this.nightEnabled = on;
    this.applyNightParams();
  }

  /** Wyłączony tryb = parametry neutralne (łańcuch zostaje, ale nic nie zmienia). */
  private applyNightParams(): void {
    const on = this.nightEnabled;
    if (this.nightCompressor) {
      this.nightCompressor.threshold.value = on ? -32 : 0;
      this.nightCompressor.knee.value = on ? 24 : 0;
      this.nightCompressor.ratio.value = on ? 12 : 1;
      this.nightCompressor.attack.value = on ? 0.003 : 0;
      this.nightCompressor.release.value = 0.25;
    }
    // +6 dB wyrównania po kompresji, żeby dialogi nie zniknęły pod progiem.
    if (this.nightMakeup) this.nightMakeup.gain.value = on ? Math.pow(10, 6 / 20) : 1;
    if (this.nightDialogueEq) this.nightDialogueEq.gain.value = on ? 4 : 0;
  }

  /**
   * Kompensacja opóźnienia dźwięku (ms). Dodatnie = dźwięk PÓŹNIEJ niż obraz
   * (naprawia ścieżkę audio, która ucieka do przodu). `HTMLMediaElement` nie pozwala
   * odtworzyć dźwięku wcześniej niż obraz, więc zakres jest dodatni.
   */
  setAudioDelayMs(ms: number): void {
    this.audioDelayMs = Math.max(0, Math.min(500, Math.round(ms) || 0));
    if (this.delayNode) this.delayNode.delayTime.value = this.audioDelayMs / 1000;
  }

  getAnalyserNode(): AnalyserNode | null {
    return this.analyserNode;
  }
  getAudioContext(): AudioContext | null {
    return this.audioCtx;
  }

  isContextRunning(): boolean {
    return this.audioCtx?.state === 'running';
  }

  async suspendContext(): Promise<void> {
    if (this.audioCtx && this.audioCtx.state === 'running') {
      await this.audioCtx.suspend();
    }
  }

  resumeContext(): void {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  async closeContext(): Promise<void> {
    if (this.audioCtx) {
      await this.audioCtx.close();
      this.audioCtx = null;
    }
    // Wyzeruj wszystkie węzły: bez tego kolejne `connectSource` po ponownym użyciu
    // singletona sięgnęłoby po węzeł z zamkniętego kontekstu (błąd / brak dźwięku).
    this.analyserNode = null;
    this.sourceNode = null;
    this.gainNode = null;
    this.eqFilters = [];
    this.videoSourceNode = null;
    this.videoGainNode = null;
    this.videoSourceEl = null;
    this.nightCompressor = null;
    this.nightMakeup = null;
    this.nightDialogueEq = null;
    this.delayNode = null;
    this.eqChainBuilt = false;
  }
}
