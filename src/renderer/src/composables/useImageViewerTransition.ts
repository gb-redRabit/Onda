import { ref, reactive, nextTick } from 'vue';
import type { Ref } from 'vue';
import { computeEnterStart, computeOldExit } from '@renderer/utils/imageTransitions';
import { useTimeoutFn } from './useTimers';
import type { FileItem } from '@renderer/types/explorer';

const NON_RANDOM_TYPES = [
  'fade',
  'slide',
  'zoom',
  'swirl',
  'slideUp',
  'slideDown',
  'zoomOut'
] as const;

const REST_STYLE = { opacity: 1, transform: 'translateX(0) scale3d(1,1,1)', filter: 'blur(0px)' };

export interface ImageViewerTransitionDeps {
  files: Ref<FileItem[]>;
  currentIndex: Ref<number>;
  displaySrc: Ref<string>;
  loadAt: (idx: number) => void;
  preloadNext: () => void;
}

export function useImageViewerTransition(deps: ImageViewerTransitionDeps) {
  const oldSrc = ref('');
  const imgError = ref(false);
  const transitionType = ref<string>('fade');
  const activeTransition = ref<string>('fade');
  const transitionDuration = ref(500);
  const direction = ref<'next' | 'prev'>('next');
  const transitioning = ref(false);

  const newStyle = reactive({ ...REST_STYLE });
  const oldStyle = reactive({ ...REST_STYLE, opacity: 0 });

  const { start: startTransition, stop: stopTransition } = useTimeoutFn(
    endTransition,
    transitionDuration.value
  );

  function endTransition() {
    Object.assign(oldStyle, REST_STYLE);
    oldSrc.value = '';
    transitioning.value = false;
  }

  function onImageLoaded() {
    if (!transitioning.value) return;
    nextTick(() => {
      Object.assign(newStyle, REST_STYLE);
      Object.assign(oldStyle, computeOldExit(activeTransition.value, direction.value));
      startTransition();
    });
  }

  function onImageError() {
    if (transitioning.value) {
      imgError.value = true;
      endTransition();
    }
  }

  function navigateTo(newIdx: number, dir: 'prev' | 'next') {
    if (transitioning.value || newIdx === deps.currentIndex.value) return;
    direction.value = dir;
    if (transitionType.value === 'random') {
      activeTransition.value = NON_RANDOM_TYPES[Math.floor(Math.random() * NON_RANDOM_TYPES.length)];
    } else {
      activeTransition.value = transitionType.value;
    }
    if (deps.displaySrc.value) oldSrc.value = deps.displaySrc.value;
    deps.currentIndex.value = newIdx;
    transitioning.value = true;
    imgError.value = false;

    const enterStart = computeEnterStart(activeTransition.value, direction.value);
    Object.assign(newStyle, { opacity: 0, transform: enterStart.transform, filter: enterStart.filter });

    const file = deps.files.value[newIdx];
    if (!file) {
      transitioning.value = false;
      return;
    }

    deps.loadAt(newIdx);
    deps.preloadNext();
  }

  function next(hasNext: Ref<boolean>) {
    if (!hasNext.value) return;
    const idx = deps.currentIndex.value + 1;
    navigateTo(idx >= deps.files.value.length ? 0 : idx, 'next');
  }

  function prev(hasPrev: Ref<boolean>) {
    if (!hasPrev.value) return;
    const idx = deps.currentIndex.value - 1;
    navigateTo(idx < 0 ? deps.files.value.length - 1 : idx, 'prev');
  }

  function goTo(idx: number) {
    if (idx === deps.currentIndex.value) return;
    navigateTo(idx, idx > deps.currentIndex.value ? 'next' : 'prev');
  }

  return {
    oldSrc,
    imgError,
    transitionType,
    activeTransition,
    transitionDuration,
    direction,
    transitioning,
    newStyle,
    oldStyle,
    navigateTo,
    next,
    prev,
    goTo,
    endTransition,
    onImageLoaded,
    onImageError,
    stopTransition
  };
}
