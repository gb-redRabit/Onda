import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick, ref } from 'vue';

const hMock = vi.hoisted(() => ({
  notify: vi.fn(),
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: hMock.t }) }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => ({ notify: hMock.notify }) }));

import ErrorBoundary from '../ErrorBoundary.vue';

const failing = ref(true);
const thrownValue = ref<unknown>(new Error('kaboom'));

const Child = defineComponent({
  name: 'FailingChild',
  setup() {
    if (failing.value) throw thrownValue.value;
    return () => h('div', { 'data-testid': 'healthy' }, 'ok');
  }
});

function mountBoundary() {
  return mount(ErrorBoundary, {
    slots: { default: () => h(Child) },
    global: { mocks: { $t: (key: string) => key } }
  });
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  failing.value = true;
  thrownValue.value = new Error('kaboom');
  hMock.notify.mockClear();
  hMock.t.mockClear();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('captures a child error, notifies and renders the fallback', async () => {
    const wrapper = mountBoundary();
    await nextTick();

    expect(hMock.notify).toHaveBeenCalledWith('error', 'errorBoundary.notifTitle', 'kaboom');
    expect(wrapper.text()).toContain('errorBoundary.title');
    expect(wrapper.text()).toContain('kaboom');
    expect(wrapper.text()).toContain('errorBoundary.retry');
  });

  it('retries by remounting the slot', async () => {
    const wrapper = mountBoundary();
    await nextTick();

    failing.value = false;
    await wrapper.get('button').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-testid="healthy"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('kaboom');
  });

  it('renders a healthy child directly', () => {
    failing.value = false;
    const wrapper = mountBoundary();

    expect(wrapper.find('[data-testid="healthy"]').exists()).toBe(true);
    expect(hMock.notify).not.toHaveBeenCalled();
  });

  it('stringifies non-Error throws', async () => {
    thrownValue.value = 'plain failure';
    const wrapper = mountBoundary();
    await nextTick();

    expect(hMock.notify).toHaveBeenCalledWith('error', 'errorBoundary.notifTitle', 'plain failure');
    expect(wrapper.text()).toContain('errorBoundary.title');
  });
});
