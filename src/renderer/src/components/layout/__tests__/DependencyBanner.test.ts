import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';

const h = vi.hoisted(() => ({
  push: vi.fn(),
  issues: null as any,
  visible: null as any,
  check: vi.fn(),
  dismiss: vi.fn(),
  unsubscribe: vi.fn()
}));

vi.mock('vue-router', () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock('@renderer/composables/useMissingDependencies', () => ({
  useMissingDependencies: () => ({
    issues: h.issues,
    visible: h.visible,
    check: h.check,
    dismiss: h.dismiss,
    unsubscribe: h.unsubscribe
  })
}));

import DependencyBanner from '../DependencyBanner.vue';

const idleCallbacks: { cb: () => void; options?: { timeout?: number } }[] = [];
const originalIdle = window.requestIdleCallback;
let wrapper: ReturnType<typeof mount> | null = null;

function setIssues(issues: unknown[], visible = true) {
  h.issues = ref(issues);
  h.visible = ref(visible);
}

function mountBanner() {
  wrapper = mount(DependencyBanner, {
    global: {
      mocks: { $t: (key: string, params?: { tools: string }) => `${key}:${params?.tools ?? ''}` }
    }
  });
  return wrapper;
}

beforeEach(() => {
  h.push.mockClear();
  h.check.mockReset().mockResolvedValue(undefined);
  h.dismiss.mockClear();
  h.unsubscribe.mockClear();
  idleCallbacks.length = 0;
  setIssues([
    { tool: 'yt-dlp', name: 'yt-dlp', required: true, broken: false },
    { tool: 'ffmpeg', name: 'FFmpeg', required: false, broken: true },
    { tool: 'ffprobe', name: 'ffprobe', required: false, broken: false }
  ]);
  window.requestIdleCallback = ((cb: () => void, options?: { timeout?: number }) => {
    idleCallbacks.push({ cb, options });
    return 1;
  }) as typeof window.requestIdleCallback;
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
  window.requestIdleCallback = originalIdle;
  vi.useRealTimers();
});

describe('DependencyBanner', () => {
  it('renders nothing when hidden', () => {
    setIssues([], false);

    expect(mountBanner().html()).toBe('<!--v-if-->');
  });

  it('lists the affected tools with their states', () => {
    const wrapper = mountBanner();
    const chips = wrapper.findAll('span.text-2xs.px-1\\.5');

    expect(wrapper.find('[data-testid="dependency-banner"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('deps.message:yt-dlp, FFmpeg, ffprobe');
    expect(chips).toHaveLength(3);
    expect(chips[0].text()).toContain('deps.required');
    expect(chips[0].classes()).toContain('bg-error/15');
    expect(chips[1].text()).toContain('deps.broken');
    expect(chips[1].classes()).toContain('bg-base-content/10');
    expect(chips[2].text()).toContain('deps.optional');
  });

  it('opens the dependency settings tab', async () => {
    const wrapper = mountBanner();
    const manage = wrapper.findAll('button')[0];

    await manage.trigger('click');

    expect(h.push).toHaveBeenCalledWith({ path: '/settings', query: { tab: 'dependencies' } });
  });

  it('dismisses the banner', async () => {
    const wrapper = mountBanner();

    await wrapper.findAll('button')[1].trigger('click');

    expect(h.dismiss).toHaveBeenCalledTimes(1);
  });

  it('checks dependencies on idle and on window focus', async () => {
    mountBanner();
    expect(idleCallbacks).toHaveLength(1);
    expect(idleCallbacks[0].options).toEqual({ timeout: 3000 });

    idleCallbacks[0].cb();
    expect(h.check).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('focus'));
    expect(h.check).toHaveBeenCalledTimes(2);
  });

  it('falls back to a timeout without requestIdleCallback', () => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      value: undefined
    });
    expect(typeof window.requestIdleCallback).toBe('undefined');

    mountBanner();
    expect(h.check).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(h.check).toHaveBeenCalledTimes(1);
  });

  it('cleans up on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const wrapper = mountBanner();

    wrapper.unmount();

    expect(remove).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(h.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
