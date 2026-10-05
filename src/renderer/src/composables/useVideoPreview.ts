import { onMounted, onUnmounted, type Ref } from 'vue';
import { createVideoPreviewCore } from '@renderer/utils/videoPreview';

// Podgląd klatek na pasku przewijania odtwarzacza wideo. Cała logika żyje we wspólnym
// rdzeniu (`utils/videoPreview`) współdzielonym z oknem PiP; różni się tylko rozmiarem
// i opóźnieniem seeka.
export function useVideoPreview(
  videoRef: Ref<HTMLVideoElement | null>,
  progressRef: Ref<HTMLElement | null>
) {
  const core = createVideoPreviewCore({
    width: 320,
    height: 180,
    quality: 0.8,
    seekDebounceMs: 60,
    videoRef,
    progressRef
  });

  onMounted(core.setup);
  onUnmounted(core.teardown);

  return {
    setHiddenVideoRef: core.setHiddenVideoRef,
    previewVisible: core.previewVisible,
    previewTime: core.previewTime,
    previewDataUrl: core.previewDataUrl,
    previewLeft: core.previewLeft,
    previewTimeLabel: core.previewTimeLabel,
    onMouseMove: core.handleMouseMove,
    onMouseLeave: core.handleMouseLeave
  };
}
