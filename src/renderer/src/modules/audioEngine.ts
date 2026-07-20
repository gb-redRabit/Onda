import type { MediaFile } from '@renderer/types/media';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';

let audioEl: HTMLAudioElement | null = null;
let nextAudioEl: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;
let analyserNode: AnalyserNode | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let sourceNodeB: MediaElementAudioSourceNode | null = null;
let videoSourceNode: MediaElementAudioSourceNode | null = null;
let crossfadeGainA: GainNode | null = null;
let crossfadeGainB: GainNode | null = null;
let gainNode: GainNode | null = null;
let eqFilters: BiquadFilterNode[] = [];
let rafId: number | null = null;
let crossfadeTimer: ReturnType<typeof setTimeout> | null = null;
let isCrossfading = false;
let _initialized = false;
let eqChainBuilt = false;

let _onTimeUpdate: ((time: number) => void) | null = null;
let _onDurationChange: ((duration: number) => void) | null = null;
let _onPlayStateChange: ((playing: boolean) => void) | null = null;
let _onTrackEnd: (() => void) | null = null;

const eqFrequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const savedPositions = new Map<string, number>();

function ensureAudioContext(): void {
  if (audioCtx) return;
  audioCtx = new AudioContext();
  analyserNode = audioCtx.createAnalyser();
  analyserNode.fftSize = 2048;
  gainNode = audioCtx.createGain();
  crossfadeGainA = audioCtx.createGain();
  crossfadeGainB = audioCtx.createGain();
  crossfadeGainA.gain.value = 1;
  crossfadeGainB.gain.value = 0;
  eqFilters = eqFrequencies.map((freq, i) => {
    const filter = audioCtx!.createBiquadFilter();
    filter.type = i === 0 ? 'lowshelf' : i === eqFrequencies.length - 1 ? 'highshelf' : 'peaking';
    filter.frequency.value = freq;
    filter.Q.value = 1.4;
    filter.gain.value = 0;
    return filter;
  });
}

function ensureEqChain(): void {
  ensureAudioContext();
  if (eqChainBuilt) return;
  let eqChain: AudioNode = crossfadeGainA!;
  for (const filter of eqFilters) {
    eqChain.connect(filter);
    eqChain = filter;
  }
  eqChain.connect(gainNode!);
  gainNode!.connect(analyserNode!);
  analyserNode!.connect(audioCtx!.destination);
  eqChainBuilt = true;
}

function connectAudio(el: HTMLAudioElement): void {
  ensureAudioContext();
  ensureEqChain();

  // Odłącz wideo jeśli było aktywne
  if (videoSourceNode) {
    try {
      videoSourceNode.disconnect();
    } catch {}
  }

  if (!sourceNode) {
    sourceNode = audioCtx!.createMediaElementSource(el);
  } else {
    try {
      sourceNode.disconnect();
    } catch {}
  }
  sourceNode.connect(crossfadeGainA!);
}

function connectAudioB(el: HTMLAudioElement): void {
  ensureAudioContext();
  ensureEqChain();
  if (sourceNodeB) return;
  try {
    sourceNodeB = audioCtx!.createMediaElementSource(el);
    sourceNodeB.connect(crossfadeGainB!);
    crossfadeGainB!.connect(gainNode!);
  } catch {
    // already connected
  }
}

function createAudioElement(): HTMLAudioElement {
  if (audioEl) {
    audioEl.pause();
    audioEl.removeAttribute('src');
  }
  audioEl = new Audio();
  audioEl.preload = 'auto';
  audioEl.crossOrigin = 'anonymous';
  return audioEl;
}

function setupListeners(el: HTMLAudioElement): void {
  el.addEventListener('timeupdate', () => {
    if (_onTimeUpdate) _onTimeUpdate(el.currentTime);
  });
  el.addEventListener('durationchange', () => {
    if (_onDurationChange) _onDurationChange(el.duration || 0);
  });
  el.addEventListener('ended', () => {
    if (_onTrackEnd) _onTrackEnd();
  });
  el.addEventListener('play', () => {
    if (_onPlayStateChange) _onPlayStateChange(true);
  });
  el.addEventListener('pause', () => {
    if (!isCrossfading && _onPlayStateChange) _onPlayStateChange(false);
  });
  el.addEventListener('loadedmetadata', () => {
    if (_onDurationChange) _onDurationChange(el.duration || 0);
  });
}

function handleEnded(): void {
  let player;
  try { player = usePlayerStore(); } catch { return; }
  if (isCrossfading) return;

  if (player.repeat === 'one') {
    if (audioEl) {
      audioEl.currentTime = 0;
      audioEl.play();
    }
    return;
  }

  const settings = useSettingsStore();
  const crossfadeDuration = settings.playback.crossfadeDuration || 0;
  if (crossfadeDuration > 0 && player.queue.length > 0) {
    startCrossfade(crossfadeDuration);
    return;
  }

  if (_onTrackEnd) _onTrackEnd();
}

function startRafLoop(): void {
  const tick = () => {
    if (audioEl && !audioEl.paused) {
      if (_onTimeUpdate) _onTimeUpdate(audioEl.currentTime);
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function stopRafLoop(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function startCrossfade(duration: number): void {
  const player = usePlayerStore();
  if (!audioEl || !audioCtx || !crossfadeGainA || !crossfadeGainB) return;

  const next = player.queue[0];
  if (!next || next.type === 'video') {
    if (_onTrackEnd) _onTrackEnd();
    return;
  }

  isCrossfading = true;

  if (!nextAudioEl) {
    nextAudioEl = new Audio();
    nextAudioEl.preload = 'auto';
    nextAudioEl.crossOrigin = 'anonymous';
    connectAudioB(nextAudioEl);
  }

  const src = `file:///${next.path.replace(/\\/g, '/')}`;
  nextAudioEl.src = src;

  nextAudioEl.addEventListener(
    'canplay',
    () => {
      crossfadeGainA!.gain.setValueAtTime(1, audioCtx!.currentTime);
      crossfadeGainA!.gain.linearRampToValueAtTime(0, audioCtx!.currentTime + duration);
      crossfadeGainB!.gain.setValueAtTime(0, audioCtx!.currentTime);
      crossfadeGainB!.gain.linearRampToValueAtTime(1, audioCtx!.currentTime + duration);
      nextAudioEl!.play().catch(() => {});

      crossfadeTimer = setTimeout(() => {
        if (audioEl) {
          audioEl.pause();
          audioEl.removeAttribute('src');
        }
        player.setTrack(next);
        audioEl = nextAudioEl;
        nextAudioEl = null;
        sourceNode = sourceNodeB;
        sourceNodeB = null;
        crossfadeGainA!.gain.value = 1;
        crossfadeGainB!.gain.value = 0;
        isCrossfading = false;
        crossfadeTimer = null;
        if (_onTimeUpdate) _onTimeUpdate(0);
        if (_onDurationChange) _onDurationChange(audioEl!.duration || 0);
        if (player.currentTrack) player.currentTrack.duration = audioEl!.duration || 0;
        ensureNextPreloaded();
      }, duration * 1000);
    },
    { once: true }
  );
}

function ensureNextPreloaded(): void {
  const player = usePlayerStore();
  if (player.queue.length === 0) return;
  const nextTrack = player.queue[0];
  if (!nextTrack || nextTrack.type === 'video') return;

  if (!nextAudioEl) {
    nextAudioEl = new Audio();
    nextAudioEl.preload = 'auto';
    nextAudioEl.crossOrigin = 'anonymous';
    connectAudioB(nextAudioEl);
  }
  const src = `file:///${nextTrack.path.replace(/\\/g, '/')}`;
  if (nextAudioEl.src !== src) {
    nextAudioEl.src = src;
  }
}

function savePosition(): void {
  const player = usePlayerStore();
  if (audioEl && player.currentTrack && player.currentTrack.type === 'audio') {
    if (audioEl.currentTime > 5) {
      savedPositions.set(player.currentTrack.path, audioEl.currentTime);
      window.api?.invoke('playback:setPosition', player.currentTrack.path, audioEl.currentTime);
    }
  }
}

function clearSavedPosition(path: string): void {
  savedPositions.delete(path);
  window.api?.invoke('playback:clearPosition', path);
}

function connectVideoElement(el: HTMLVideoElement): void {
  ensureAudioContext();
  ensureEqChain();

  // Odłącz audio jeśli było aktywne
  if (sourceNode) {
    try {
      sourceNode.disconnect();
    } catch {}
  }

  if (!videoSourceNode || (videoSourceNode as any).mediaElement !== el) {
    if (videoSourceNode) {
      try {
        videoSourceNode.disconnect();
      } catch {}
    }
    videoSourceNode = audioCtx!.createMediaElementSource(el);
  } else {
    try {
      videoSourceNode.disconnect();
    } catch {}
  }
  videoSourceNode.connect(crossfadeGainA!);
}

function disconnectVideoElement(): void {
  if (videoSourceNode) {
    try {
      videoSourceNode.disconnect();
    } catch {}
  }
}

function disconnectNodes(): void {
  try {
    sourceNode?.disconnect();
  } catch {}
  try {
    sourceNodeB?.disconnect();
  } catch {}
  try {
    videoSourceNode?.disconnect();
  } catch {}
  try {
    crossfadeGainA?.disconnect();
  } catch {}
  try {
    crossfadeGainB?.disconnect();
  } catch {}
  try {
    gainNode?.disconnect();
  } catch {}
  try {
    analyserNode?.disconnect();
  } catch {}
  for (const f of eqFilters) {
    try {
      f.disconnect();
    } catch {}
  }
}

function cleanupAudioEl(el: HTMLAudioElement | null): void {
  if (!el) return;
  el.pause();
  el.removeAttribute('src');
  el.load();
}

export const audioEngine = {
  set onTimeUpdate(fn: (time: number) => void) { _onTimeUpdate = fn; },
  set onDurationChange(fn: (duration: number) => void) { _onDurationChange = fn; },
  set onPlayStateChange(fn: (playing: boolean) => void) { _onPlayStateChange = fn; },
  set onTrackEnd(fn: () => void) { _onTrackEnd = fn; },

  init(): void {
    if (_initialized) return;
    _initialized = true;
    ensureAudioContext();
    const el = createAudioElement();
    setupListeners(el);
    startRafLoop();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopRafLoop();
      } else if (audioEl && !audioEl.paused) {
        startRafLoop();
      }
    });
  },

  loadTrack(track: MediaFile): void {
    const player = usePlayerStore();
    const settings = useSettingsStore();

    if (track.type === 'video') return;
    if (!audioEl) {
      const el = createAudioElement();
      setupListeners(el);
    }
    const src = `file:///${track.path.replace(/\\/g, '/')}`;
    audioEl!.src = src;
    connectAudio(audioEl!);
    audioEl!.volume = player.isMuted ? 0 : player.volume;
    isCrossfading = false;

    if (settings.playback.rememberPosition) {
      const savedPos = savedPositions.get(track.path) || 0;
      if (savedPos > 0) {
        audioEl!.addEventListener(
          'loadedmetadata',
          () => {
            if (audioEl && audioEl.currentTime < 3) {
              audioEl.currentTime = savedPos;
            }
          },
          { once: true }
        );
      }
    }
  },

  play(): void {
    audioEl?.play().catch(() => {});
  },

  pause(): void {
    audioEl?.pause();
  },

  seek(time: number): void {
    if (audioEl) audioEl.currentTime = time;
  },

  setVolume(v: number): void {
    if (audioEl) audioEl.volume = v;
    if (gainNode) gainNode.gain.value = v;
  },

  setPlaybackRate(rate: number): void {
    if (audioEl) audioEl.playbackRate = rate;
  },

  setEqualizerBand(index: number, gain: number): void {
    if (eqFilters[index]) eqFilters[index].gain.value = gain;
  },

  applyEqPreset(preset: Record<number, number>): void {
    Object.entries(preset).forEach(([idx, gain]) => {
      const i = parseInt(idx);
      if (eqFilters[i]) eqFilters[i].gain.value = gain;
    });
  },

  savePosition,

  clearSavedPosition,

  getAnalyserNode(): AnalyserNode | null {
    return analyserNode;
  },

  getAudioContext(): AudioContext | null {
    return audioCtx;
  },

  getMediaElement(): HTMLAudioElement | null {
    return audioEl;
  },

  isActive(): boolean {
    return _initialized;
  },

  async deactivate(): Promise<void> {
    stopRafLoop();
    if (crossfadeTimer) {
      clearTimeout(crossfadeTimer);
      crossfadeTimer = null;
    }
    isCrossfading = false;
    savePosition();
    if (audioEl) {
      audioEl.pause();
    }
    if (audioCtx && audioCtx.state === 'running') {
      await audioCtx.suspend();
    }
  },

  async destroy(): Promise<void> {
    stopRafLoop();
    if (crossfadeTimer) {
      clearTimeout(crossfadeTimer);
      crossfadeTimer = null;
    }
    isCrossfading = false;
    savePosition();
    disconnectNodes();
    cleanupAudioEl(audioEl);
    cleanupAudioEl(nextAudioEl);
    audioEl = null;
    nextAudioEl = null;
    sourceNode = null;
    sourceNodeB = null;
    videoSourceNode = null;
    eqChainBuilt = false;
    if (audioCtx) {
      await audioCtx.close();
      audioCtx = null;
    }
    _initialized = false;
  },

  resumeContext(): void {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  },

  resume(): void {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    if (rafId === null) {
      startRafLoop();
    }
  },

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
  },

  connectVideoElement(el: HTMLVideoElement): void {
    connectVideoElement(el);
  },

  disconnectVideoElement(): void {
    disconnectVideoElement();
  }
};
