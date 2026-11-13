import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';

const h = vi.hoisted(() => ({
  createCore: vi.fn(),
  core: {
    setup: vi.fn(),
    teardown: vi.fn(),
    setHiddenVideoRef: vi.fn(),
    previewVisible: { value: false },
    previewTime: { value: 0 },
    previewDataUrl: { value: '' },
    previewLeft: { value: 0 },
    previewTimeLabel: { value: '' },
    handleMouseMove: vi.fn(),
    handleMouseLeave: vi.fn()
  } as any
}));

vi.mock('@renderer/utils/videoPreview', () => ({
  createVideoPreviewCore: h.createCore
}));

import { useVideoPreview } from '../useVideoPreview';

function mountPreview() {
  const videoRef = ref<HTMLVideoElement | null>(null);
  const progressRef = ref<HTMLElement | null>(null);
  let api: ReturnType<typeof useVideoPreview> | null = null;

  const Host = defineComponent({
    setup() {
      api = useVideoPreview(videoRef, progressRef);
      return () => null;
    }
  });
  const wrapper = mount(Host);
  return { wrapper, videoRef, progressRef, api: api! };
}

beforeEach(() => {
  h.createCore.mockReset().mockReturnValue(h.core);
  h.core.setup.mockClear();
  h.core.teardown.mockClear();
});

describe('useVideoPreview', () => {
  it('creates the core with player sizing and refs', () => {
    const { videoRef, progressRef } = mountPreview();

    expect(h.createCore).toHaveBeenCalledWith({
      width: 320,
      height: 180,
      quality: 0.8,
      seekDebounceMs: 60,
      videoRef,
      progressRef
    });
  });

  it('runs setup on mount and teardown on unmount', () => {
    const { wrapper } = mountPreview();

    expect(h.core.setup).toHaveBeenCalledTimes(1);
    expect(h.core.teardown).not.toHaveBeenCalled();

    wrapper.unmount();
    expect(h.core.teardown).toHaveBeenCalledTimes(1);
  });

  it('exposes the core members', () => {
    const { api } = mountPreview();

    expect(api.setHiddenVideoRef).toBe(h.core.setHiddenVideoRef);
    expect(api.previewVisible).toBe(h.core.previewVisible);
    expect(api.previewTime).toBe(h.core.previewTime);
    expect(api.previewDataUrl).toBe(h.core.previewDataUrl);
    expect(api.previewLeft).toBe(h.core.previewLeft);
    expect(api.previewTimeLabel).toBe(h.core.previewTimeLabel);
    expect(api.onMouseMove).toBe(h.core.handleMouseMove);
    expect(api.onMouseLeave).toBe(h.core.handleMouseLeave);
  });
});
