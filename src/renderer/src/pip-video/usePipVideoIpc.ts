import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import { formatDuration } from '@shared/formatDuration';
import type { usePipVideoSubtitle } from './usePipVideoSubtitle';
import type { PipSubtitleData } from './usePipVideoSubtitle';

export interface PipVideoRefs {
  videoRef: Ref<HTMLVideoElement | null>;
  progressRef: Ref<HTMLDivElement | null>;
}

export function usePipVideoIpc(sub: ReturnType<typeof usePipVideoSubtitle>, refs: PipVideoRefs) {
  const api = window.api;
  const { videoRef, progressRef } = refs;
  const currentTime = ref('0:00');
  const duration = ref('0:00');
  const progress = ref(0);
  const showOverlay = ref(false);
  const settingsOpen = ref(false);
  const brightness = ref(100);
  const contrast = ref(100);

  const labels: Record<string, Record<string, string>> = {
    settings: { en: 'Settings', pl: 'Ustawienia' },
    subtitles: { en: 'Subtitles', pl: 'Napisy' },
    brightness: { en: 'Brightness', pl: 'Jasność' },
    contrast: { en: 'Contrast', pl: 'Kontrast' },
    close: { en: 'Close', pl: 'Zamknij' },
    maximize: { en: 'Maximize', pl: 'Maksymalizuj' }
  };
  const currentLocale = ref(navigator.language.startsWith('pl') ? 'pl' : 'en');
  function t(key: string): string {
    return labels[key][currentLocale.value] || labels[key].en;
  }

  let pendingStart = 0;
  let waitingForPlay = false;
  let cleanups: (() => void)[] = [];

  const videoFilter = computed(() => {
    const parts: string[] = [];
    if (brightness.value !== 100) parts.push(`brightness(${brightness.value}%)`);
    if (contrast.value !== 100) parts.push(`contrast(${contrast.value}%)`);
    return parts.length > 0 ? parts.join(' ') : 'none';
  });

  const fmt = formatDuration;

  function applyCssVars(vars: Record<string, string> | undefined) {
    if (!vars) return;
    const root = document.documentElement;
    for (const [key, val] of Object.entries(vars)) {
      root.style.setProperty(key, val);
    }
  }

  function onVideoMeta() {
    const v = videoRef.value;
    if (!v) return;
    duration.value = fmt(v.duration);
    if (pendingStart > 0) v.currentTime = pendingStart;
    if (!waitingForPlay) v.play().catch(() => {});
  }

  function onTimeUpdate() {
    const v = videoRef.value;
    if (!v) return;
    progress.value = v.duration ? (v.currentTime / v.duration) * 100 : 0;
    currentTime.value = fmt(v.currentTime);
  }

  function onVideoEnded() {
    api?.send('pip:ended');
  }

  function onProgressClick(e: MouseEvent) {
    const v = videoRef.value;
    const bar = progressRef.value;
    if (!v || !bar) return;
    const r = bar.getBoundingClientRect();
    v.currentTime = ((e.clientX - r.left) / r.width) * v.duration;
  }

  function sendMaximize() {
    api?.send('pip:maximize', videoRef.value?.currentTime || 0);
  }

  onMounted(() => {
    const v = videoRef.value;
    if (v) v.crossOrigin = 'anonymous';

    if (!api) return;

    const c1 = api.on('pip:videoSrc', (...args: unknown[]) => {
      const { src, start } = args[0] as { src: string; start: number };
      pendingStart = start || 0;
      waitingForPlay = true;
      sub.clearSubtitle();
      if (videoRef.value) videoRef.value.src = src;
    });
    cleanups.push(c1);

    const c2 = api.on('pip:play', (...args: unknown[]) => {
      const startTime = args[0] as number;
      waitingForPlay = false;
      const v = videoRef.value;
      if (!v) return;
      if (startTime > 0) v.currentTime = startTime;
      v.play().catch(() => {});
    });
    cleanups.push(c2);

    const c3 = api.on('pip:requestTime', () => {
      api.send('pip:timeUpdate', videoRef.value?.currentTime || 0);
    });
    cleanups.push(c3);

    const c4 = api.on('pip:pause', () => {
      videoRef.value?.pause();
    });
    cleanups.push(c4);

    const c5 = api.on('pip:clear', () => {
      sub.clearSubtitle();
      waitingForPlay = false;
      const v = videoRef.value;
      if (!v) return;
      v.pause();
      v.removeAttribute('src');
      v.load();
    });
    cleanups.push(c5);

    const c6 = api.on('pip:subtitle', (...args: unknown[]) => {
      sub.receiveSubtitle(args[0] as PipSubtitleData | null);
    });
    cleanups.push(c6);

    const c7 = api.on('pip:clearSubtitle', () => {
      sub.clearSubtitle();
    });
    cleanups.push(c7);

    const c8 = api.on('pip:theme', (...args: unknown[]) => {
      applyCssVars(args[0] as Record<string, string>);
    });
    cleanups.push(c8);

    const c9 = api.on('pip:locale', (...args: unknown[]) => {
      currentLocale.value = ((args[0] as string) || 'en').startsWith('pl') ? 'pl' : 'en';
    });
    cleanups.push(c9);
  });

  onUnmounted(() => {
    cleanups.forEach((fn) => fn());
    cleanups = [];
  });

  return {
    api,
    currentTime,
    duration,
    progress,
    showOverlay,
    settingsOpen,
    brightness,
    contrast,
    videoFilter,
    t,
    onVideoMeta,
    onTimeUpdate,
    onVideoEnded,
    onProgressClick,
    sendMaximize
  };
}
