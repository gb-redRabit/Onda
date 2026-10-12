import { logger } from '@shared/logger';
import type { EqBand } from '@renderer/utils/constants/audio';

// Stała liczba slotów filtrów (neutralne, gdy nieużywane) — dzięki temu dodawanie/usuwanie
// pasm nie wymaga przebudowy łańcucha.
const EQ_SLOTS = 12;

export class AudioGraph {
  audioCtx: AudioContext | null = null;
  analyserNode: AnalyserNode | null = null;
  sourceNode: MediaElementAudioSourceNode | null = null;
  gainNode: GainNode | null = null;
  eqFilters: BiquadFilterNode[] = [];
  /** Gain wyjściowy korektora (preamp) — między łańcuchem filtrów a głównym gainNode. */
  preampNode: GainNode | null = null;
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
    this.eqFilters = Array.from({ length: EQ_SLOTS }, () => {
      const filter = this.audioCtx!.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = 1000;
      filter.Q.value = 1;
      filter.gain.value = 0;
      return filter;
    });
    this.setEqBands(this.eqBands);
  }

  ensureEqChain(): void {
    this.ensureContext();
    if (this.eqChainBuilt) return;
    const firstFilter = this.eqFilters[0];
    if (firstFilter) {
      this.sourceNode?.connect(firstFilter);
      let eqChain: AudioNode = firstFilter;
      for (let i = 1; i < this.eqFilters.length; i++) {
        eqChain.connect(this.eqFilters[i]);
        eqChain = this.eqFilters[i];
      }
      eqChain.connect(this.preampNode!);
    } else {
      this.sourceNode?.connect(this.preampNode!);
    }
    this.preampNode!.connect(this.gainNode!);
    this.gainNode!.connect(this.analyserNode!);
    this.analyserNode!.connect(this.audioCtx!.destination);
    this.eqChainBuilt = true;
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
      const firstFilter = this.eqFilters[0];
      if (firstFilter) {
        this.sourceNode.connect(firstFilter);
      } else {
        this.sourceNode.connect(this.preampNode!);
      }
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
    const firstFilter = this.eqFilters[0];
    if (firstFilter) {
      this.videoSourceNode.connect(this.videoGainNode);
      this.videoGainNode.connect(firstFilter);
    } else if (this.preampNode) {
      this.videoSourceNode.connect(this.videoGainNode);
      this.videoGainNode.connect(this.preampNode);
    }

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
    const firstFilter = this.eqFilters[0];
    try {
      if (firstFilter) {
        this.sourceNode.connect(firstFilter);
      } else if (this.preampNode) {
        this.sourceNode.connect(this.preampNode);
      }
    } catch (e) {
      logger.warn(
        'audioEngine',
        'disconnectVideoElement: reconnect failed (source already disconnected)',
        e
      );
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

  /** Ustawia cały łańcuch z definicji pasm; nadmiarowe sloty stają się neutralne. */
  setEqBands(bands: readonly EqBand[]): void {
    this.eqBands = bands;
    for (let i = 0; i < this.eqFilters.length; i++) {
      const f = this.eqFilters[i];
      const band = this.eqEnabled ? bands[i] : undefined;
      if (band) {
        f.type = band.type;
        f.frequency.value = band.frequency;
        f.Q.value = band.q;
        f.gain.value = band.gain;
      } else {
        f.type = 'peaking';
        f.frequency.value = 1000;
        f.Q.value = 1;
        f.gain.value = 0;
      }
    }
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
    this.eqChainBuilt = false;
  }
}
