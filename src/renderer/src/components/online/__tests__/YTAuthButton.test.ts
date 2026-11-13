import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';

const h = vi.hoisted(() => ({
  status: null as any,
  refresh: vi.fn(),
  ensureLoaded: vi.fn(),
  invoke: vi.fn()
}));

vi.mock('@renderer/composables/useYoutubeAuth', () => ({
  useYoutubeAuth: () => ({
    status: h.status,
    refresh: h.refresh,
    ensureLoaded: h.ensureLoaded
  })
}));

const ButtonStub = defineComponent({
  name: 'OnlineButton',
  props: {
    variant: { type: String },
    size: { type: String },
    title: { type: String }
  },
  emits: ['click'],
  template:
    '<button data-testid="auth" :data-variant="variant" @click="$emit(\'click\')"><slot /></button>'
});

import YTAuthButton from '../YTAuthButton.vue';

function mountButton() {
  return mount(YTAuthButton, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { OnlineButton: ButtonStub }
    }
  });
}

beforeEach(() => {
  h.status = reactive({ loggedIn: false });
  h.refresh.mockReset().mockResolvedValue(undefined);
  h.ensureLoaded.mockReset().mockResolvedValue(undefined);
  h.invoke.mockReset().mockResolvedValue(undefined);
  (window as unknown as { api: { invoke: typeof h.invoke } }).api = { invoke: h.invoke };
});

describe('YTAuthButton', () => {
  it('loads auth status on mount', () => {
    mountButton();

    expect(h.ensureLoaded).toHaveBeenCalledTimes(1);
  });

  it('shows the logged-out state', () => {
    const wrapper = mountButton();
    const button = wrapper.getComponent(ButtonStub);

    expect(button.props()).toMatchObject({
      variant: 'primary',
      size: 'sm',
      title: 'settings.googleAccountDesc'
    });
    expect(wrapper.text()).toContain('settings.loginWithGoogle');
  });

  it('shows the logged-in state', () => {
    h.status.loggedIn = true;
    const wrapper = mountButton();
    const button = wrapper.getComponent(ButtonStub);

    expect(button.props()).toMatchObject({
      variant: 'secondary',
      title: 'settings.authStatusLoggedIn'
    });
    expect(wrapper.text()).toContain('settings.authStatusLoggedIn');
  });

  it('logs in and refreshes the status', async () => {
    const wrapper = mountButton();

    await wrapper.get('[data-testid="auth"]').trigger('click');

    expect(h.invoke).toHaveBeenCalledWith('yt:login');
    expect(h.refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes even when the login window fails', async () => {
    h.invoke.mockRejectedValue(new Error('closed'));
    const wrapper = mountButton();

    await wrapper.get('[data-testid="auth"]').trigger('click');

    expect(h.refresh).toHaveBeenCalledTimes(1);
  });
});
