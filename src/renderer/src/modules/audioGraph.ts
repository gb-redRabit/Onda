import { usePlayerStore } from '@renderer/stores/player';
import { logger } from '@shared/logger';

const eqFrequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export class AudioGraph {
  audioCtx: AudioContext | null = null;
  analyserNode: AnalyserNode | null = null;
  sourceNode: MediaElementAudioSourceNode | null = null;
  gainNode: GainNode | null = null;
  eqFilters: BiquadFilterNode[] = [];
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
    this.eqFilters = eqFrequencies.map((freq, i) => {
      const filter = this.audioCtx!.createBiquadFilter();
      filter.type = i === 0 ? 'lowshelf' : i === eqFrequencies.length - 1 ? 'highshelf' : 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = 1.4;
      filter.gain.value = 0;
      return filter;
    });
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
      eqChain.connect(this.gainNode!);
    } else {
      this.sourceNode?.connect(this.gainNode!);
    }
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
        this.sourceNode.connect(this.gainNode!);
      }
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

  connectVideoElement(videoEl: HTMLVideoElement): void {
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
        const player = usePlayerStore();
        if (this.videoGainNode) {
          this.videoGainNode.gain.value = player.isMuted ? 0 : player.volume;
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
    this.eqChainBuilt = false;
  }
}
