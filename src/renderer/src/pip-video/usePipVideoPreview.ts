import { onMounted, onUnmounted, type Ref } from 'vue';
import { createVideoPreviewCore } from '@renderer/utils/videoPreview';

interface PreviewRefs {
  videoRef: Ref<HTMLVideoElement | null>;
  progressRef: Ref<HTMLDivElement | null>;
}

// Podgląd klatek w oknie PiP — cienka nakładka na wspólny rdzeń (`utils/videoPreview`)
// z mniejszym rozmiarem i nieco większym opóźnieniem seeka niż w odtwarzaczu.
export function usePipVideoPreview(refs: PreviewRefs) {
  const core = createVideoPreviewCore({
    width: 160,
    height: 90,
    quality: 0.85,
    seekDebounceMs: 80,
    videoRef: refs.videoRef,
    progressRef: refs.progressRef as Ref<HTMLElement | null>
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
    handleMouseMove: core.handleMouseMove,
    handleMouseLeave: core.handleMouseLeave
  };
}
