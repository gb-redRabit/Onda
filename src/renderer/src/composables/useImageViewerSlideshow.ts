import { ref, computed } from 'vue';
import type { Ref } from 'vue';
import { useIntervalFn, useRafFn, useTimeoutFn } from './useTimers';
import type { FileItem } from '@renderer/types/explorer';

export interface SlideshowDeps {
  files: FileItem[];
  currentIndex: Ref<number>;
  hasNext: Ref<boolean>;
  loop: Ref<boolean>;
  uiVisible: Ref<boolean>;
  showBottom: Ref<boolean>;
  settingsOpen: Ref<boolean>;
  usingHighRes: Ref<boolean>;
  kenStyle: { scale: number; translateX: number; translateY: number };
  navigate: (idx: number, dir: 'next' | 'prev') => void;
  next: () => void;
  loadAt: (idx: number) => void;
  resetIdleTimer: () => void;
  stopIdle: () => void;
}

export function useImageViewerSlideshow(deps: SlideshowDeps) {
  const slideshowActive = ref(false);
  const slideshowInterval = ref(3000);
  const slideshowProgress = ref(0);
  const kenBurns = ref(false);
  const shuffleSlideshow = ref(false);
  const autoHideUI = ref(true);
  let shuffleOrder: number[] = [];

  const progressStep = computed(() => 100 / (slideshowInterval.value / 16));

  const { pause: pauseProgress, resume: resumeProgress } = useIntervalFn(
    () => {
      slideshowProgress.value = Math.min(slideshowProgress.value + progressStep.value, 100);
    },
    16,
    { immediate: false }
  );

  const { pause: pauseKen, resume: resumeKen } = useRafFn(() => {
    if (!kenBurns.value || !slideshowActive.value) {
      pauseKen();
      return;
    }
    const elapsed = performance.now() % slideshowInterval.value;
    const t = elapsed / slideshowInterval.value;
    deps.kenStyle.scale = 1 + t * 0.15;
    deps.kenStyle.translateX = t * 2;
    deps.kenStyle.translateY = t * 1;
  });

  function runProgress() {
    pauseProgress();
    slideshowProgress.value = 0;
    resumeProgress();
    if (kenBurns.value) resumeKen();
  }

  function startSlideshow() {
    slideshowActive.value = true;
    deps.settingsOpen.value = false;
    slideshowProgress.value = 0;
    deps.showBottom.value = false;
    deps.uiVisible.value = true;
    if (deps.files.length < 2) {
      stopSlideshow();
      return;
    }
    if (autoHideUI.value) deps.resetIdleTimer();
    if (shuffleSlideshow.value) {
      shuffleOrder = [...Array(deps.files.length).keys()].filter(
        (i) => i !== deps.currentIndex.value
      );
      for (let i = shuffleOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffleOrder[i], shuffleOrder[j]] = [shuffleOrder[j], shuffleOrder[i]];
      }
    }
    runProgress();
    scheduleAdvance();
  }

  const { start: scheduleAdvance, stop: cancelAdvance } = useTimeoutFn(() => {
    if (!slideshowActive.value) return;
    if (shuffleSlideshow.value && shuffleOrder.length > 0) {
      const nextIdx = shuffleOrder.shift()!;
      deps.navigate(nextIdx, 'next');
      runProgress();
      scheduleAdvance();
    } else if (deps.hasNext.value) {
      deps.next();
      runProgress();
      scheduleAdvance();
    } else if (deps.loop.value) {
      deps.loadAt(0);
      runProgress();
      scheduleAdvance();
    } else {
      stopSlideshow();
    }
  }, slideshowInterval.value);

  function stopSlideshow() {
    slideshowActive.value = false;
    slideshowProgress.value = 0;
    deps.showBottom.value = true;
    deps.uiVisible.value = true;
    deps.stopIdle();
    deps.kenStyle.scale = 1;
    deps.kenStyle.translateX = 0;
    deps.kenStyle.translateY = 0;
    pauseKen();
    cancelAdvance();
    pauseProgress();
  }

  function toggleSlideshow() {
    if (slideshowActive.value) stopSlideshow();
    else startSlideshow();
  }

  function changeInterval(ms: number) {
    slideshowInterval.value = ms;
    if (slideshowActive.value) {
      stopSlideshow();
      startSlideshow();
    }
  }

  return {
    slideshowActive,
    slideshowInterval,
    slideshowProgress,
    kenBurns,
    shuffleSlideshow,
    autoHideUI,
    toggleSlideshow,
    startSlideshow,
    stopSlideshow,
    changeInterval,
    runProgress
  };
}
