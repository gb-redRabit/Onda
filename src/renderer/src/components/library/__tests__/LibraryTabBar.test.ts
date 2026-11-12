import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';

import LibraryTabBar from '../LibraryTabBar.vue';
import type { TabId } from '@renderer/utils/libraryTabs';

const IconStub = defineComponent({
  name: 'TabIcon',
  props: ['size'],
  template: '<i data-testid="tab-icon" />'
});

const tabs = [
  { id: 'overview', label: 'Overview', count: 3, icon: IconStub },
  { id: 'tracks', label: 'Tracks', count: 12, icon: IconStub },
  { id: 'albums', label: 'Albums', count: 0, icon: IconStub }
] as const;

let wrapper: VueWrapper | null = null;

function mountBar(modelValue: TabId = 'tracks') {
  wrapper = mount(LibraryTabBar, {
    props: { tabs: tabs as never, modelValue },
    attachTo: document.body,
    global: { mocks: { $t: (key: string) => key } }
  });
  return wrapper;
}

function buttons() {
  return wrapper!.findAll('[role="tab"]');
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('rendering', () => {
  it('renders every tab with ARIA wiring', () => {
    mountBar('tracks');

    expect(buttons().map((item) => item.attributes('aria-label'))).toEqual([
      'Overview',
      'Tracks',
      'Albums'
    ]);
    expect(buttons()[1].attributes('aria-selected')).toBe('true');
    expect(buttons()[1].attributes('tabindex')).toBe('0');
    expect(buttons()[0].attributes('tabindex')).toBe('-1');
    expect(buttons()[0].attributes('aria-controls')).toBe('library-panel-overview');
    expect(wrapper!.get('[role="tablist"]').attributes('aria-label')).toBe('library.title');
  });

  it('shows labels, counts and a title with the count', () => {
    mountBar();

    expect(buttons()[0].text()).toContain('Overview');
    expect(buttons()[0].text()).toContain('3');
    expect(buttons()[0].attributes('title')).toBe('Overview (3)');
    expect(wrapper!.findAll('[data-testid="tab-icon"]')).toHaveLength(3);
  });

  it('highlights the selected tab', () => {
    mountBar('albums');

    expect(buttons()[2].classes()).toContain('bg-primary/18');
    expect(buttons()[0].classes()).toContain('text-base-content/65');
  });
});

describe('selection', () => {
  it('emits the clicked tab', async () => {
    mountBar();

    await buttons()[2].trigger('click');

    expect(wrapper!.emitted('update:modelValue')).toEqual([['albums']]);
  });

  it('moves with arrows and wraps around', async () => {
    mountBar('tracks');

    await buttons()[1].trigger('keydown', { key: 'ArrowRight' });
    await buttons()[1].trigger('keydown', { key: 'ArrowDown' });
    await buttons()[1].trigger('keydown', { key: 'ArrowLeft' });
    await buttons()[1].trigger('keydown', { key: 'ArrowUp' });

    expect(wrapper!.emitted('update:modelValue')).toEqual([
      ['albums'],
      ['albums'],
      ['overview'],
      ['overview']
    ]);
  });

  it('jumps to the first and last tab', async () => {
    mountBar('tracks');

    await buttons()[1].trigger('keydown', { key: 'Home' });
    await buttons()[1].trigger('keydown', { key: 'End' });

    expect(wrapper!.emitted('update:modelValue')).toEqual([['overview'], ['albums']]);
  });

  it('ignores other keys', async () => {
    mountBar();
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });

    buttons()[0].element.dispatchEvent(event);

    expect(wrapper!.emitted('update:modelValue')).toBeUndefined();
    expect(event.defaultPrevented).toBe(false);
  });

  it('prevents default and focuses the next tab', async () => {
    mountBar('tracks');
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });

    buttons()[1].element.dispatchEvent(event);
    await wrapper!.vm.$nextTick();

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons()[2].element);
  });
});
