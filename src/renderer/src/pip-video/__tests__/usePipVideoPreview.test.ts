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

import { usePipVideoPreview } from '../usePipVideoPreview';

function mountPreview() {
  const videoRef = ref<HTMLVideoElement | null>(null);
  const progressRef = ref<HTMLDivElement | null>(null);
  let api: ReturnType<typeof usePipVideoPreview> | null = null;

  const Host = defineComponent({
    setup() {
      api = usePipVideoPreview({ videoRef, progressRef });
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

describe('usePipVideoPreview', () => {
  it('creates the core with the smaller PiP sizing', () => {
    const { videoRef, progressRef } = mountPreview();

    expect(h.createCore).toHaveBeenCalledWith({
      width: 160,
      height: 90,
      quality: 0.85,
      seekDebounceMs: 80,
      videoRef,
      progressRef
    });
  });

  it('binds setup and teardown to the component lifecycle', () => {
    const { wrapper } = mountPreview();

    expect(h.core.setup).toHaveBeenCalledTimes(1);
    wrapper.unmount();
    expect(h.core.teardown).toHaveBeenCalledTimes(1);
  });

  it('exposes the core members', () => {
    const { api } = mountPreview();

    expect(api.setHiddenVideoRef).toBe(h.core.setHiddenVideoRef);
    expect(api.previewVisible).toBe(h.core.previewVisible);
    expect(api.handleMouseMove).toBe(h.core.handleMouseMove);
    expect(api.handleMouseLeave).toBe(h.core.handleMouseLeave);
  });
});
