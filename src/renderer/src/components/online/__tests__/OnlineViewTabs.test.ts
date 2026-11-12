import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

import OnlineViewTabs from '../OnlineViewTabs.vue';

const BadgeStub = defineComponent({
  name: 'OnlineBadge',
  props: ['variant', 'size'],
  template: '<span data-testid="badge"><slot /></span>'
});

let wrapper: VueWrapper | null = null;

function mountTabs(props: Record<string, unknown> = {}) {
  wrapper = mount(OnlineViewTabs, {
    props: { modelValue: 'discover', ...props },
    attachTo: document.body,
    global: { stubs: { OnlineBadge: BadgeStub } }
  });
  return wrapper;
}

function tabs() {
  return wrapper!.findAll('[role="tab"]');
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('rendering', () => {
  it('renders all three tabs with aria wiring', () => {
    mountTabs({ modelValue: 'subscriptions' });

    expect(tabs().map((tab) => tab.text())).toEqual([
      'youtube.discoverTab',
      'youtube.subscriptionsTab',
      'providers.tab'
    ]);
    expect(tabs()[1].attributes('aria-selected')).toBe('true');
    expect(tabs()[1].attributes('tabindex')).toBe('0');
    expect(tabs()[0].attributes('tabindex')).toBe('-1');
    expect(tabs()[0].attributes('aria-controls')).toBe('online-panel-discover');
    expect(wrapper!.get('[role="tablist"]').attributes('aria-label')).toBe('nav.online');
  });

  it('shows the subscription badge only with a positive count', () => {
    mountTabs({ subscriptionCount: 7 });

    expect(wrapper!.findComponent(BadgeStub).text()).toBe('7');

    wrapper!.unmount();
    mountTabs({ subscriptionCount: 0 });
    expect(wrapper!.findComponent(BadgeStub).exists()).toBe(false);
  });

  it('renders the toolbar slot', () => {
    mountTabs();
    wrapper!.unmount();
    wrapper = mount(OnlineViewTabs, {
      props: { modelValue: 'discover' },
      slots: { default: '<span data-testid="toolbar-extra">extra</span>' },
      global: { stubs: { OnlineBadge: BadgeStub } }
    });

    expect(wrapper.get('[data-testid="toolbar-extra"]').text()).toBe('extra');
  });
});

describe('selection', () => {
  it('emits the clicked tab', async () => {
    mountTabs();

    await tabs()[2].trigger('click');

    expect(wrapper!.emitted('update:modelValue')).toEqual([['links']]);
  });

  it('moves with arrow keys and wraps around', async () => {
    mountTabs({ modelValue: 'discover' });

    await tabs()[0].trigger('keydown', { key: 'ArrowRight' });
    await tabs()[0].trigger('keydown', { key: 'ArrowDown' });
    await tabs()[0].trigger('keydown', { key: 'ArrowLeft' });
    await tabs()[0].trigger('keydown', { key: 'ArrowUp' });

    expect(wrapper!.emitted('update:modelValue')).toEqual([
      ['subscriptions'],
      ['subscriptions'],
      ['links'],
      ['links']
    ]);
  });

  it('jumps to the first and last tab with Home and End', async () => {
    mountTabs({ modelValue: 'subscriptions' });

    await tabs()[1].trigger('keydown', { key: 'Home' });
    await tabs()[1].trigger('keydown', { key: 'End' });

    expect(wrapper!.emitted('update:modelValue')).toEqual([['discover'], ['links']]);
  });

  it('ignores unrelated keys', async () => {
    mountTabs();
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });

    tabs()[0].element.dispatchEvent(event);

    expect(wrapper!.emitted('update:modelValue')).toBeUndefined();
    expect(event.defaultPrevented).toBe(false);
  });

  it('prevents default and focuses the next tab', async () => {
    mountTabs({ modelValue: 'discover' });
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });

    tabs()[0].element.dispatchEvent(event);
    await wrapper!.vm.$nextTick();

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(tabs()[1].element);
  });
});
