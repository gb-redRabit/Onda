import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';

// No IntersectionObserver in this environment: the module must fall back to a
// no-op observer and never throw on mount/unmount.
delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;

vi.mock('@renderer/utils/thumbLoader', () => ({
  thumbTasks: [],
  cachedThumb: () => undefined,
  setCachedThumb: vi.fn(),
  cachedIcon: () => undefined,
  setCachedIcon: vi.fn(),
  isUsableImageDataUrl: () => false,
  processThumbQueue: vi.fn(),
  thumbTaskDone: vi.fn()
}));
vi.mock('@shared/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
}));

const { useThumbnail } = await import('../useThumbnail');

describe('useThumbnail without IntersectionObserver', () => {
  it('mounts and unmounts without observing anything', () => {
    let root: HTMLElement | null = null;
    const Comp = defineComponent({
      setup() {
        const thumb = useThumbnail(ref('/music/a.jpg'), false, false);
        return () =>
          h('div', {
            ref: (el: unknown) => {
              thumb.rootEl.value = el as HTMLElement | null;
              root = el as HTMLElement | null;
            }
          });
      }
    });

    const wrapper = mount(Comp, { attachTo: document.body });
    expect(root).toBeTruthy();
    expect(() => wrapper.unmount()).not.toThrow();
  });
});
