import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';

import PlayerSpeedMenu from '../PlayerSpeedMenu.vue';

let wrapper: VueWrapper | null = null;

function setup(speed = 1) {
  wrapper = mount(PlayerSpeedMenu, {
    props: { speed },
    global: { mocks: { $t: (key: string) => key } }
  });
  return wrapper;
}

function triggerButton() {
  return wrapper!.get('button[aria-haspopup="true"]');
}

function menu() {
  return wrapper!.find('.absolute.bottom-full');
}

function resetButton() {
  return wrapper!.findAll('button').find((button) => button.text().includes('player.speedReset'))!;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.restoreAllMocks();
});

describe('label and trigger', () => {
  it('formats integer and fractional speeds', () => {
    setup(1);
    expect(triggerButton().text()).toContain('1x');

    wrapper!.unmount();
    setup(1.25);
    expect(triggerButton().text()).toContain('1.25x');

    wrapper!.unmount();
    setup(0.3333);
    expect(triggerButton().text()).toContain('0.33x');
  });

  it('highlights non-default speeds', async () => {
    setup(2);
    expect(triggerButton().classes()).toContain('text-primary-text');

    await wrapper!.setProps({ speed: 1 });
    expect(triggerButton().classes()).not.toContain('text-primary-text');
    expect(triggerButton().attributes('aria-expanded')).toBe('false');
  });
});

describe('menu', () => {
  it('opens and closes from the trigger', async () => {
    setup();
    expect(menu().exists()).toBe(false);

    await triggerButton().trigger('click');
    expect(menu().exists()).toBe(true);
    expect(triggerButton().attributes('aria-expanded')).toBe('true');

    await triggerButton().trigger('click');
    expect(menu().exists()).toBe(false);
  });

  it('renders every preset and marks the active one', async () => {
    setup(1.5);
    await triggerButton().trigger('click');

    const presets = menu()
      .findAll('button')
      .filter((button) => button.text().endsWith('x'));
    expect(presets).toHaveLength(9);
    const active = presets.find((button) => button.text() === '1.5x')!;
    expect(active.classes()).toContain('bg-primary');
  });

  it('emits a preset and closes the menu', async () => {
    setup();
    await triggerButton().trigger('click');

    const preset = menu()
      .findAll('button')
      .find((button) => button.text() === '2.5x')!;
    await preset.trigger('click');

    expect(wrapper!.emitted('setSpeed')).toEqual([[2.5]]);
    expect(menu().exists()).toBe(false);
  });

  it('clamps custom slider values', async () => {
    setup();
    await triggerButton().trigger('click');
    const slider = menu().get('input[type="range"]');

    (slider.element as HTMLInputElement).value = '5';
    await slider.trigger('input');
    (slider.element as HTMLInputElement).value = '0.1';
    await slider.trigger('input');
    (slider.element as HTMLInputElement).value = '1.234';
    await slider.trigger('input');

    expect(wrapper!.emitted('setSpeed')).toEqual([[3], [0.25], [1.23]]);
  });

  it('disables the reset button at the default preset', async () => {
    setup(1);
    await triggerButton().trigger('click');
    expect(resetButton().attributes('disabled')).toBeDefined();

    await wrapper!.setProps({ speed: 1.5 });
    expect(resetButton().attributes('disabled')).toBeUndefined();

    await resetButton().trigger('click');
    expect(wrapper!.emitted('setSpeed')).toEqual([[1]]);
  });
});

describe('dismissal', () => {
  it('closes on Escape only while open', async () => {
    setup();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(menu().exists()).toBe(false);

    await triggerButton().trigger('click');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper!.vm.$nextTick();
    expect(menu().exists()).toBe(false);
  });

  it('closes on an outside mousedown but not inside', async () => {
    setup();
    await triggerButton().trigger('click');

    triggerButton().element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await wrapper!.vm.$nextTick();
    expect(menu().exists()).toBe(true);

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await wrapper!.vm.$nextTick();
    expect(menu().exists()).toBe(false);
  });

  it('removes document listeners on unmount', async () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    setup();
    await triggerButton().trigger('click');

    wrapper!.unmount();
    wrapper = null;

    expect(remove).toHaveBeenCalledWith('mousedown', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
