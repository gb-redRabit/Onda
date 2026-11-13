import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';

const h = vi.hoisted(() => ({
  push: vi.fn(),
  show: null as any,
  status: null as any,
  version: null as any,
  progress: null as any,
  download: vi.fn(),
  install: vi.fn(),
  dismiss: vi.fn()
}));

vi.mock('vue-router', () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock('@renderer/composables/useUpdater', () => ({
  useUpdater: () => ({
    show: h.show,
    status: h.status,
    version: h.version,
    progress: h.progress,
    download: h.download,
    install: h.install,
    dismiss: h.dismiss
  })
}));

import UpdateBanner from '../UpdateBanner.vue';

function mountBanner(
  state: {
    show?: boolean;
    status?: string;
    version?: string;
    progress?: number;
  } = {}
) {
  h.show = ref(state.show ?? true);
  h.status = ref(state.status ?? 'available');
  h.version = ref(state.version ?? '1.2.3');
  h.progress = ref(state.progress ?? 0);
  return mount(UpdateBanner, {
    global: { mocks: { $t: (key: string) => key } }
  });
}

beforeEach(() => {
  h.push.mockClear();
  h.download.mockClear();
  h.install.mockClear();
  h.dismiss.mockClear();
});

describe('UpdateBanner', () => {
  it('renders nothing when hidden', () => {
    expect(mountBanner({ show: false }).html()).toBe('<!--v-if-->');
  });

  it('shows an available update with the version', () => {
    const wrapper = mountBanner();

    expect(wrapper.find('[data-testid="update-banner"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('settings.updateToastAvailableTitle');
    expect(wrapper.text()).toContain('settings.updateToastAvailableMessage');
  });

  it('downloads an available update', async () => {
    const wrapper = mountBanner();
    const download = wrapper.findAll('button')[0];

    await download.trigger('click');

    expect(h.download).toHaveBeenCalledTimes(1);
  });

  it('shows progress while downloading', () => {
    const wrapper = mountBanner({ status: 'downloading', progress: 42.6 });

    expect(wrapper.text()).toContain('settings.downloading 43%');
    expect(wrapper.find('.bg-primary').attributes('style')).toContain('width: 42.6%');
  });

  it('offers restart when downloaded', async () => {
    const wrapper = mountBanner({ status: 'downloaded' });
    const install = wrapper.findAll('button')[0];

    expect(wrapper.text()).toContain('settings.updateToastReadyTitle');
    expect(wrapper.text()).toContain('settings.restartInstall');

    await install.trigger('click');
    expect(h.install).toHaveBeenCalledTimes(1);
  });

  it('opens the updates settings', async () => {
    const wrapper = mountBanner();
    const manage = wrapper.findAll('button').at(-2)!;

    await manage.trigger('click');

    expect(h.push).toHaveBeenCalledWith({ path: '/settings', query: { tab: 'updates' } });
  });

  it('dismisses the banner', async () => {
    const wrapper = mountBanner();

    await wrapper.get('[aria-label="common.close"]').trigger('click');

    expect(h.dismiss).toHaveBeenCalledTimes(1);
  });
});
