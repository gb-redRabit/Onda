import { ref, computed, onMounted, onUnmounted } from 'vue';
import { toMediaServerUrl } from '@renderer/utils/mediaUrl';
import { formatDuration } from '@renderer/utils/formatters';
import { EQUALIZER_PRESETS, EQUALIZER_PRESET_LABELS } from '@renderer/utils/constants';

interface PipUpdate {
  mode?: string;
  edge?: 'top' | 'bottom' | null;
  peeked?: boolean;
  state?: PipState;
  opacity?: number;
  cssVars?: Record<string, string>;
}

interface PipState {
  trackName: string;
  artist: string;
  coverData: string | null;
  coverType?: 'image' | 'video' | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted?: boolean;
  shuffle?: boolean;
  repeat?: 'none' | 'all' | 'one';
  equalizerBands?: number[];
  equalizerPreset?: string;
  vizData?: number[];
  nextTrackName?: string;
  nextTrackArtist?: string;
}

export const EQ_PRESETS = Object.keys(EQUALIZER_PRESETS).map((id) => ({
  id,
  label: EQUALIZER_PRESET_LABELS[id] || id
}));

interface PipAudioHandlers {
  updateAccent: () => void;
}

export function usePipAudioState(handlers: PipAudioHandlers) {
  const api = window.api;
  const trackName = ref('—');
  const artist = ref('');
  const coverData = ref<string | null>(null);
  const coverType = ref<'image' | 'video' | null>(null);
  const isPlaying = ref(false);
  const currentTime = ref(0);
  const duration = ref(0);
  const volume = ref(1);
  const isMuted = ref(false);
  const shuffle = ref(false);
  const repeat = ref<'none' | 'all' | 'one'>('none');
  const equalizerBands = ref<number[]>([]);
  const eqPreset = ref('flat');
  const vizData = ref<number[]>([]);
  const nextTrackName = ref('');
  const nextTrackArtist = ref('');
  const mode = ref<'m' | 'd' | 'x' | 'w'>('m');
  const edge = ref<'top' | 'bottom' | null>(null);
  const peeked = ref(false);
  const bgAlpha = ref(0.85);

  const fmt = formatDuration;

  const progressPct = computed(() =>
    duration.value > 0 ? Math.min((currentTime.value / duration.value) * 100, 100) : 0
  );

  const volPct = computed(() => Math.round(volume.value * 100) + '%');
  const volLabel = computed(() => (isMuted.value ? 'MUT' : 'VOL'));

  const isVideoCover = computed(() => coverType.value === 'video' && !!coverData.value);
  const videoCoverSrc = computed(() =>
    coverType.value === 'video' && coverData.value ? toMediaServerUrl(coverData.value) : ''
  );

  const pipAlpha = computed(() => {
    const a = bgAlpha.value;
    return Math.min(0.85, a * 0.65);
  });

  function showMain() {
    api?.send('audio-pip:showMain');
  }

  function onBackgroundClick(e: MouseEvent) {
    const t = e.target as HTMLElement;
    if (t.closest('button, input, video, img')) return;
    showMain();
  }

  function send(action: string) {
    api?.send('audio-pip:action', action);
  }

  function onProgressClick(e: MouseEvent) {
    const bar = e.currentTarget as HTMLElement;
    const r = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    api?.send('audio-pip:progressClick', pct);
  }

  function onVolumeInput(e: Event) {
    send('volume:' + parseFloat((e.target as HTMLInputElement).value).toFixed(2));
  }

  function selectEqPreset(name: string) {
    eqPreset.value = name;
    send('eqPreset:' + name);
  }

  function applyCssVars(vars: Record<string, string> | undefined) {
    if (!vars) return;
    for (const [key, val] of Object.entries(vars)) {
      document.documentElement.style.setProperty(key, val);
    }
  }

  let cleanup: (() => void) | null = null;
  let revealTimer: ReturnType<typeof setTimeout> | null = null;
  const HOVER_REVEAL_MS = 300;

  onMounted(() => {
    if (!api) return;
    const cleanup1 = api.on('audio-pip:update', (...args: unknown[]) => {
      const d = args[0] as PipUpdate | undefined;
      if (!d) return;
      if (d.mode) {
        mode.value =
          d.mode === 'max' ? 'x' : d.mode === 'medium' ? 'd' : d.mode === 'wide' ? 'w' : 'm';
      }
      if (d.edge !== undefined) edge.value = d.edge ?? null;
      if (d.peeked !== undefined) peeked.value = d.peeked;
      if (d.state) {
        const s = d.state;
        trackName.value = s.trackName || '—';
        artist.value = s.artist || '';
        coverData.value = s.coverData || null;
        coverType.value = s.coverType || (s.coverData ? 'image' : null);
        isPlaying.value = !!s.isPlaying;
        currentTime.value = typeof s.currentTime === 'number' ? s.currentTime : 0;
        duration.value = typeof s.duration === 'number' ? s.duration : 0;
        volume.value = typeof s.volume === 'number' ? s.volume : 1;
        isMuted.value = !!s.isMuted;
        shuffle.value = !!s.shuffle;
        repeat.value = s.repeat || 'none';
        if (s.equalizerBands) equalizerBands.value = s.equalizerBands;
        if (s.equalizerPreset) eqPreset.value = s.equalizerPreset;
        nextTrackName.value = s.nextTrackName || '';
        nextTrackArtist.value = s.nextTrackArtist || '';
      }
      if (typeof d.opacity === 'number') bgAlpha.value = d.opacity;
      if (d.cssVars) applyCssVars(d.cssVars);
    });
    const cleanup2 = api.on('audio-pip:vizData', (...args: unknown[]) => {
      const d = args[0] as number[];
      if (d && d.length > 0) vizData.value = d;
    });
    const cleanup3 = api.on('audio-pip:theme', (...args: unknown[]) => {
      applyCssVars(args[0] as Record<string, string>);
      handlers.updateAccent();
    });
    const onMouseOver = () => {
      if (revealTimer) clearTimeout(revealTimer);
      revealTimer = setTimeout(() => {
        revealTimer = null;
        api?.send('audio-pip:unpeek');
      }, HOVER_REVEAL_MS);
    };
    const onMouseOut = (e: MouseEvent) => {
      if (revealTimer) {
        clearTimeout(revealTimer);
        revealTimer = null;
      }
      if (!e.relatedTarget) api?.send('audio-pip:peekDelay');
    };
    window.addEventListener('mouseover', onMouseOver);
    window.addEventListener('mouseout', onMouseOut);
    cleanup = () => {
      cleanup1();
      cleanup2();
      cleanup3();
      if (revealTimer) clearTimeout(revealTimer);
      window.removeEventListener('mouseover', onMouseOver);
      window.removeEventListener('mouseout', onMouseOut);
    };
  });

  onUnmounted(() => {
    cleanup?.();
  });

  return {
    trackName,
    artist,
    coverData,
    coverType,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    shuffle,
    repeat,
    equalizerBands,
    eqPreset,
    vizData,
    nextTrackName,
    nextTrackArtist,
    mode,
    edge,
    peeked,
    bgAlpha,
    fmt,
    progressPct,
    volPct,
    volLabel,
    isVideoCover,
    videoCoverSrc,
    pipAlpha,
    showMain,
    onBackgroundClick,
    send,
    onProgressClick,
    onVolumeInput,
    selectEqPreset
  };
}
