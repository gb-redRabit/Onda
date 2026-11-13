import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

const h = vi.hoisted(() => ({
  appearance: { audioPipAutoShow: false, audioPipDock: 'bottom' as string },
  updateAppearance: vi.fn()
}));

vi.mock('@renderer/stores/settings', () => ({
  useSettingsStore: () => ({ appearance: h.appearance, updateAppearance: h.updateAppearance })
}));

import WizardPip from '../WizardPip.vue';

const global = {
  mocks: { $t: (key: string) => key },
  stubs: { WizardStep: true }
};

function mountPip() {
  return mount(WizardPip, { global });
}

function dockButton(wrapper: ReturnType<typeof mountPip>, id: string) {
  const button = wrapper.findAll('button').find((b) => b.text() === id);
  if (!button) throw new Error(`dock button not found: ${id}`);
  return button;
}

beforeEach(() => {
  h.appearance.audioPipAutoShow = false;
  h.appearance.audioPipDock = 'bottom';
  h.updateAppearance.mockClear();
});

describe('WizardPip', () => {
  it('lists the three dock positions and highlights the active one', () => {
    const wrapper = mountPip();
    const labels = wrapper
      .findAll('button')
      .map((b) => b.text())
      .filter((text) => ['bottom-right', 'bottom', 'right'].includes(text));

    expect(labels).toEqual(['bottom-right', 'bottom', 'right']);
    expect(dockButton(wrapper, 'bottom').classes()).toContain('border-primary');
    expect(dockButton(wrapper, 'right').classes()).toContain('border-hairline');
  });

  it('moves the PiP dock when another position is clicked', async () => {
    const wrapper = mountPip();

    await dockButton(wrapper, 'right').trigger('click');

    expect(h.updateAppearance).toHaveBeenCalledWith({ audioPipDock: 'right' });
  });

  it('toggles auto-show through the settings switch', async () => {
    const wrapper = mountPip();
    const toggle = wrapper.find('[role="switch"]');

    expect(toggle.attributes('aria-checked')).toBe('false');
    await toggle.trigger('click');

    expect(h.updateAppearance).toHaveBeenCalledWith({ audioPipAutoShow: true });
  });

  it('reflects an enabled auto-show setting', () => {
    h.appearance.audioPipAutoShow = true;

    expect(mountPip().find('[role="switch"]').attributes('aria-checked')).toBe('true');
  });
});
