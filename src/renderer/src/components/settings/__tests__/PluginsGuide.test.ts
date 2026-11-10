import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { Check, Copy } from '@lucide/vue';

const state = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  sections: null as any,
  writeText: vi.fn()
}));

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: state.t,
    tm: (key: string) => (key === 'plugins.guide.sections' ? state.sections : undefined)
  })
}));

const ModalStub = defineComponent({
  name: 'ModalShellStub',
  props: { labelledBy: String, backdropTestid: String, panelClass: String },
  emits: ['close', 'escape'],
  template: `<div data-testid="modal">
    <button data-testid="modal-close" @click="$emit('close')" />
    <button data-testid="modal-escape" @click="$emit('escape')" />
    <slot />
  </div>`
});

import PluginsGuide from '../PluginsGuide.vue';

let wrapper: VueWrapper | null = null;

function sections() {
  return [
    {
      heading: '«manifest» basics',
      body: 'Line one',
      list: ['Use key', 'Avoid «braces»'],
      code: 'const x = «foo»;',
      code2: 'api.ui.set()'
    },
    {
      heading: 'Second',
      body: 'Hidden body',
      list: ['other']
    },
    { heading: 'Third', code: 'only code' }
  ];
}

function setup() {
  wrapper = mount(PluginsGuide, {
    global: { stubs: { ModalShell: ModalStub } }
  });
  return wrapper;
}

function searchInput() {
  return wrapper!.get('[data-testid="plugins-guide-search"]');
}

beforeEach(() => {
  state.t.mockClear();
  state.sections = sections();
  state.writeText.mockReset();
  state.writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: state.writeText }
  });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('rendering', () => {
  it('renders headings, bodies, lists and code blocks', () => {
    setup();

    expect(wrapper!.text()).toContain('plugins.guide.title');
    expect(wrapper!.text()).toContain('plugins.guide.intro');
    expect(wrapper!.get('[data-testid="plugins-guide-heading-0"]').text()).toBe(
      '{manifest} basics'
    );
    expect(wrapper!.get('[data-testid="plugins-guide-heading-1"]').text()).toBe('Second');
    expect(wrapper!.text()).toContain('Line one');
    expect(wrapper!.text()).toContain('{braces}');
    expect(wrapper!.text()).toContain('const x = {foo};');
    expect(wrapper!.text()).toContain('api.ui.set()');
    expect(wrapper!.get('[data-testid="plugins-guide-count"]').text()).toBe('3 / 3');
    expect(wrapper!.findAll('[data-testid="plugins-guide-copy"]')).toHaveLength(3);
  });

  it('handles missing guide sections', () => {
    state.sections = null;
    setup();

    expect(wrapper!.get('[data-testid="plugins-guide-count"]').text()).toBe('0 / 0');
    expect(wrapper!.find('[data-testid="plugins-guide-empty"]').exists()).toBe(true);
  });
});

describe('search', () => {
  it('filters by heading, body and list text', async () => {
    setup();
    const input = searchInput();

    await input.setValue('KEY');
    expect(wrapper!.text()).toContain('Line one');
    expect(wrapper!.get('[data-testid="plugins-guide-count"]').text()).toBe('1 / 3');
    expect(wrapper!.text()).not.toContain('plugins.guide.intro');
    expect(wrapper!.find('[data-testid="plugins-guide-search-clear"]').exists()).toBe(true);

    await input.setValue('hidden');
    expect(wrapper!.get('[data-testid="plugins-guide-count"]').text()).toBe('1 / 3');

    await input.setValue('nothing-matches');
    expect(wrapper!.find('[data-testid="plugins-guide-empty"]').exists()).toBe(true);
  });

  it('keeps original numbering when filtered', async () => {
    setup();
    await searchInput().setValue('Second');

    expect(wrapper!.get('[data-testid="plugins-guide-heading-1"]').text()).toBe('Second');
  });

  it('clears the query and focuses the input', async () => {
    setup();
    const input = searchInput();
    await input.setValue('Second');
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');

    await wrapper!.get('[data-testid="plugins-guide-search-clear"]').trigger('click');

    expect((input.element as HTMLInputElement).value).toBe('');
    expect(focus).toHaveBeenCalled();
    expect(wrapper!.get('[data-testid="plugins-guide-count"]').text()).toBe('3 / 3');
  });
});

describe('copying', () => {
  it('copies code with brace conversion and resets the icon', async () => {
    vi.useFakeTimers();
    setup();
    const buttons = wrapper!.findAll('[data-testid="plugins-guide-copy"]');

    await buttons[0].trigger('click');
    await Promise.resolve();

    expect(state.writeText).toHaveBeenCalledWith('const x = {foo};');
    expect(
      wrapper!.findAll('[data-testid="plugins-guide-copy"]')[0].findComponent(Check).exists()
    ).toBe(true);
    expect(
      wrapper!.findAll('[data-testid="plugins-guide-copy"]')[1].findComponent(Copy).exists()
    ).toBe(true);

    vi.advanceTimersByTime(1500);
    await wrapper!.vm.$nextTick();
    expect(
      wrapper!.findAll('[data-testid="plugins-guide-copy"]')[0].findComponent(Copy).exists()
    ).toBe(true);
  });

  it('tracks each code block independently', async () => {
    vi.useFakeTimers();
    setup();
    const buttons = wrapper!.findAll('[data-testid="plugins-guide-copy"]');

    await buttons[1].trigger('click');
    await Promise.resolve();

    expect(state.writeText).toHaveBeenCalledWith('api.ui.set()');
    expect(
      wrapper!.findAll('[data-testid="plugins-guide-copy"]')[1].findComponent(Check).exists()
    ).toBe(true);
  });

  it('resets when copying fails', async () => {
    state.writeText.mockRejectedValueOnce(new Error('denied'));
    setup();

    await wrapper!.get('[data-testid="plugins-guide-copy"]').trigger('click');
    await Promise.resolve();

    expect(
      wrapper!.findAll('[data-testid="plugins-guide-copy"]')[0].findComponent(Copy).exists()
    ).toBe(true);
  });
});

describe('closing', () => {
  it('emits close from the header button and modal', async () => {
    setup();

    await wrapper!.get('[data-testid="plugins-guide-close"]').trigger('click');
    await wrapper!.get('[data-testid="modal-close"]').trigger('click');
    await wrapper!.get('[data-testid="modal-escape"]').trigger('click');

    expect(wrapper!.emitted('close')).toHaveLength(3);
  });
});
