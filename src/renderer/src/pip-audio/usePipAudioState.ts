import { ref, computed, onMounted, onUnmounted } from 'vue';
import { toMediaServerUrl } from '@renderer/utils/mediaUrl';
import { formatDuration } from '@renderer/utils/formatters';
import { EQUALIZER_PRESETS, EQUALIZER_PRESET_LABELS } from '@renderer/utils/constants';
import type { AudioPipDock, AudioPipElementId, AudioPipLayoutKind } from '@shared/types/pip';

interface PipUpdate {
  dock?: AudioPipDock;
  layoutKind?: AudioPipLayoutKind;
  elements?: AudioPipElementId[];
  edge?: 'top' | 'bottom' | 'left' | 'right' | null;
  peeked?: boolean;
  isPreview?: boolean;
  state?: PipState;
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
  const dock = ref<AudioPipDock>('bottom-right');
  const layoutKind = ref<AudioPipLayoutKind>('card');
  const elements = ref<AudioPipElementId[]>([
    'cover',
    'trackInfo',
    'controls',
    'progress',
    'volume'
  ]);
  const edge = ref<'top' | 'bottom' | 'left' | 'right' | null>(null);
  const peeked = ref(false);
  const isPreview = ref(false);

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

  const has = (id: AudioPipElementId): boolean => elements.value.includes(id);
  const isVertical = computed(() => layoutKind.value === 'bar-v');
  const isBar = computed(() => layoutKind.value !== 'card');

  function showMain() {
    api?.send('audio-pip:showMain');
  }

  function send(action: string) {
    api?.send('audio-pip:action', action);
  }

  function onProgressClick(e: MouseEvent) {
    const bar = e.currentTarget as HTMLElement;
    const r = bar.getBoundingClientRect();
    const horizontal = layoutKind.value !== 'bar-v';
    const pct = horizontal
      ? Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
      : Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
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
  const HOVER_REVEAL_MS = 250;

  onMounted(() => {
    if (!api) return;
    const cleanup1 = api.on('audio-pip:update', (...args: unknown[]) => {
      const d = args[0] as PipUpdate | undefined;
      if (!d) return;
      if (d.dock) dock.value = d.dock;
      if (d.layoutKind) layoutKind.value = d.layoutKind;
      else if (d.dock) {
        layoutKind.value =
          d.dock === 'left' || d.dock === 'right'
            ? 'bar-v'
            : d.dock === 'top' || d.dock === 'bottom'
              ? 'bar-h'
              : 'card';
      }
      if (d.elements) elements.value = [...d.elements];
      if (d.edge !== undefined) edge.value = d.edge ?? null;
      if (d.peeked !== undefined) peeked.value = d.peeked;
      if (d.isPreview !== undefined) isPreview.value = !!d.isPreview;
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
      if (d.cssVars) applyCssVars(d.cssVars);
    });
    const cleanup2 = api.on('audio-pip:vizData', (...args: unknown[]) => {
      if (!elements.value.includes('viz')) return;
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
    dock,
    layoutKind,
    elements,
    edge,
    peeked,
    isPreview,
    fmt,
    progressPct,
    volPct,
    volLabel,
    isVideoCover,
    videoCoverSrc,
    has,
    isVertical,
    isBar,
    showMain,
    send,
    onProgressClick,
    onVolumeInput,
    selectEqPreset
  };
}
