import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import type { MediaSource } from '@renderer/types/sources';

const state = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  locale: null as any,
  plural: vi.fn(() => 'many'),
  moveItem: vi.fn()
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t, locale: state.locale }) }));
vi.mock('@renderer/utils/plural', () => ({ pluralCategory: state.plural }));
vi.mock('@renderer/utils/sourcesView', () => ({ moveItem: state.moveItem }));

const IconButtonStub = defineComponent({
  name: 'IconButtonStub',
  props: { icon: [Object, Function], label: String, variant: String },
  template: '<button :aria-label="label" />'
});

import SourcesSidebar from '../SourcesSidebar.vue';

let wrapper: VueWrapper | null = null;

function source(id: string, name: string, endpoints = 2): MediaSource {
  return {
    id,
    name,
    endpoints: Array.from({ length: endpoints }, (_, i) => ({ id: `e${i}` }))
  } as never;
}

function setup(props: Record<string, unknown> = {}) {
  wrapper = mount(SourcesSidebar, {
    props: {
      sources: [source('a', 'Alpha'), source('b', 'Beta'), source('c', 'Gamma')],
      activeSourceId: null,
      testStatus: {},
      checking: {},
      ...props
    },
    global: {
      stubs: { IconButton: IconButtonStub },
      directives: { activate: {} },
      mocks: { $t: (key: string) => key }
    }
  });
  return wrapper;
}

function items() {
  return wrapper!.findAll('[data-testid^="sources-item-"]');
}

function item(id: string) {
  return wrapper!.get(`[data-testid="sources-item-${id}"]`);
}

function drag(type: string, data?: Record<string, unknown>) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const dataTransfer = {
    setData: vi.fn(),
    effectAllowed: '',
    dropEffect: ''
  };
  Object.defineProperty(event, 'dataTransfer', { value: data ?? dataTransfer });
  return { event, dataTransfer };
}

beforeEach(() => {
  state.t.mockClear();
  state.locale = ref('pl');
  state.plural.mockReset();
  state.plural.mockReturnValue('many');
  state.moveItem.mockReset();
  state.moveItem.mockImplementation((list: MediaSource[], from: number, to: number) => {
    const copy = [...list];
    const [moved] = copy.splice(from, 1);
    copy.splice(to, 0, moved);
    return copy;
  });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.restoreAllMocks();
});

describe('header actions', () => {
  it('emits export, import, guide and add', async () => {
    setup();
    const labels = [
      'sources.exportSources',
      'sources.importSources',
      'sources.guide.title',
      'sources.addSource'
    ];

    for (const label of labels) {
      await wrapper!.get(`[aria-label="${label}"]`).trigger('click');
    }

    expect(wrapper!.emitted('exportAll')).toHaveLength(1);
    expect(wrapper!.emitted('importAll')).toHaveLength(1);
    expect(wrapper!.emitted('guide')).toHaveLength(1);
    expect(wrapper!.emitted('add')).toHaveLength(1);
  });

  it('removes actions from the list itself', () => {
    setup();
    expect(items()).toHaveLength(3);
    expect(wrapper!.text()).toContain('sources.title');
  });
});

describe('list rendering', () => {
  it('shows names and pluralised endpoint counts', () => {
    setup();
    expect(wrapper!.text()).toContain('Alpha');
    expect(state.plural).toHaveBeenCalledWith('pl', 2);
    expect(state.t).toHaveBeenCalledWith('sources.endpointCountMany', { count: 2 });
  });

  it('uses all plural categories', () => {
    state.plural.mockReturnValueOnce('one').mockReturnValueOnce('few').mockReturnValueOnce('many');
    setup();

    expect(state.t).toHaveBeenCalledWith('sources.endpointCountOne', { count: 2 });
    expect(state.t).toHaveBeenCalledWith('sources.endpointCountFew', { count: 2 });
    expect(state.t).toHaveBeenCalledWith('sources.endpointCountMany', { count: 2 });
  });

  it('marks the active source', () => {
    setup({ activeSourceId: 'b' });

    expect(item('b').classes()).toContain('bg-primary/10');
    expect(item('b').attributes('aria-current')).toBe('true');
    expect(item('a').attributes('aria-current')).toBeUndefined();
  });

  it('selects a source on click', async () => {
    setup();
    await item('b').trigger('click');

    expect(wrapper!.emitted('select')).toEqual([['b']]);
  });

  it('shows an empty message', () => {
    setup({ sources: [] });
    expect(wrapper!.text()).toContain('sources.emptyList');
  });
});

describe('status dots', () => {
  it('labels checking, success, error and unknown states', () => {
    setup({
      checking: { a: true },
      testStatus: { b: { success: true }, c: { success: false, error: 'bad' } }
    });

    const dot = (id: string) => item(id).get('[role="img"]');
    expect(dot('a').attributes('aria-label')).toBe('sources.testChecking');
    expect(dot('a').classes()).toContain('bg-warning');
    expect(dot('b').attributes('aria-label')).toBe('sources.testSourceOk');
    expect(dot('b').classes()).toContain('bg-success');
    expect(dot('c').attributes('aria-label')).toBe('bad');
    expect(dot('c').classes()).toContain('bg-error');
  });

  it('shows an unknown status before a test', () => {
    setup();
    const dot = item('a').get('[role="img"]');
    expect(dot.attributes('aria-label')).toBe('sources.testNotRun');
    expect(dot.classes()).toContain('bg-base-300');
  });
});

describe('row actions', () => {
  it('edits and removes without selecting', async () => {
    setup();
    const stop = vi.spyOn(Event.prototype, 'stopPropagation');

    await item('a').get('[data-testid="sources-edit-item"]').trigger('click');
    await item('a').get('[aria-label="common.delete"]').trigger('click');

    expect(stop).toHaveBeenCalled();
    expect(wrapper!.emitted('edit')).toHaveLength(1);
    expect(wrapper!.emitted('remove')).toEqual([['a']]);
    expect(wrapper!.emitted('select')).toBeUndefined();
  });

  it('reorders with the arrow buttons', async () => {
    setup();

    const up = (id: string) => item(id).get('[aria-label="sources.moveUp"]');
    const down = (id: string) => item(id).get('[aria-label="sources.moveDown"]');
    expect(up('a').attributes('disabled')).toBeDefined();
    expect(down('c').attributes('disabled')).toBeDefined();

    await down('a').trigger('click');
    expect(wrapper!.emitted('reorder')).toEqual([[['b', 'a', 'c']]]);

    await up('c').trigger('click');
    expect(wrapper!.emitted('reorder')).toHaveLength(2);
  });

  it('ignores moves beyond the list', async () => {
    setup();
    const up = item('a').get('[aria-label="sources.moveUp"]').element as HTMLButtonElement;
    const down = item('c').get('[aria-label="sources.moveDown"]').element as HTMLButtonElement;

    up.removeAttribute('disabled');
    up.click();
    down.removeAttribute('disabled');
    down.click();

    expect(state.moveItem).not.toHaveBeenCalled();
    expect(wrapper!.emitted('reorder')).toBeUndefined();
  });
});

describe('drag and drop', () => {
  it('starts a drag with the row index', async () => {
    setup();
    const { event, dataTransfer } = drag('dragstart');

    item('b').element.dispatchEvent(event);
    await wrapper!.vm.$nextTick();

    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', '1');
    expect(dataTransfer.effectAllowed).toBe('move');
    expect(item('b').classes()).toContain('opacity-50');
  });

  it('accepts drag over', () => {
    setup();
    const { event, dataTransfer } = drag('dragover');

    item('c').element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(dataTransfer.dropEffect).toBe('move');
  });

  it('reorders on drop', () => {
    setup();
    item('a').element.dispatchEvent(drag('dragstart').event);
    item('c').element.dispatchEvent(drag('drop').event);

    expect(state.moveItem).toHaveBeenCalled();
    expect(wrapper!.emitted('reorder')).toEqual([[['b', 'c', 'a']]]);
  });

  it('ignores drops without a drag or onto the same row', () => {
    setup();
    item('c').element.dispatchEvent(drag('drop').event);
    expect(wrapper!.emitted('reorder')).toBeUndefined();

    item('b').element.dispatchEvent(drag('dragstart').event);
    item('b').element.dispatchEvent(drag('drop').event);
    expect(wrapper!.emitted('reorder')).toBeUndefined();
  });

  it('clears the drag state on dragend', async () => {
    setup();
    item('b').element.dispatchEvent(drag('dragstart').event);
    item('b').element.dispatchEvent(drag('dragend').event);
    await wrapper!.vm.$nextTick();

    expect(item('b').classes()).not.toContain('opacity-50');
  });
});
