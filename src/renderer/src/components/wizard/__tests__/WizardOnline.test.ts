import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return { ...actual, useI18n: () => ({ t: (key: string) => key }) };
});

const h = vi.hoisted(() => ({
  ensureLoaded: vi.fn(),
  status: null as any
}));

vi.mock('@renderer/composables/useYoutubeAuth', () => ({
  useYoutubeAuth: () => ({ status: h.status, ensureLoaded: h.ensureLoaded })
}));

const StepStub = defineComponent({
  name: 'WizardStep',
  props: { title: { type: String }, description: { type: String } },
  template: '<div data-testid="step">{{ title }}</div>'
});
const AuthStub = defineComponent({
  name: 'YTAuthButton',
  template: '<button data-testid="auth" />'
});

import WizardOnline from '../WizardOnline.vue';

function mountOnline(loggedIn = false) {
  h.status = { value: { loggedIn, method: 'none' } };
  // Components use status.loggedIn directly (not .value) in the template.
  h.status = { loggedIn };
  return mount(WizardOnline, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { WizardStep: StepStub, YTAuthButton: AuthStub }
    }
  });
}

describe('WizardOnline', () => {
  it('loads the auth status on mount', () => {
    mountOnline();

    expect(h.ensureLoaded).toHaveBeenCalledTimes(1);
  });

  it('shows the logged-out state', () => {
    const wrapper = mountOnline(false);
    const text = wrapper.text();

    expect(text).toContain('wizard.onlineTitle');
    expect(text).toContain('settings.authStatusLoggedOut');
    expect(text).toContain('wizard.onlineHint');
    expect(wrapper.find('[data-testid="auth"]').exists()).toBe(true);
    expect(wrapper.find('.bg-primary\\/15').exists()).toBe(true);
  });

  it('shows the logged-in state', () => {
    const wrapper = mountOnline(true);

    expect(wrapper.text()).toContain('settings.authStatusLoggedIn');
    expect(wrapper.text()).not.toContain('settings.authStatusLoggedOut');
    expect(wrapper.find('.bg-success\\/15').exists()).toBe(true);
  });

  it('ignores a missing auth status method', () => {
    const wrapper = mountOnline(true);
    expect(wrapper.find('[data-testid="step"]').exists()).toBe(true);
  });
});
