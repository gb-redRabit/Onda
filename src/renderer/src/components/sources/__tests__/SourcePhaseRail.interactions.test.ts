import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

import SourcePhaseRail from '../SourcePhaseRail.vue';
import type { PhaseItem } from '../sourcePhases';

const phases: PhaseItem[] = [
  { key: 'source', kind: 'source', label: 'My API', status: null },
  { key: 'e1', kind: 'endpoint', label: 'Lista', type: 'list', status: 'ok' },
  { key: 'e2', kind: 'endpoint', label: 'Odcinki', type: 'page', status: 'invalid' },
  { key: 'e3', kind: 'endpoint', label: 'Broken', type: 'list', status: 'fail' },
  { key: 'test', kind: 'test', label: 'Test', status: null }
];

let wrapper: VueWrapper | null = null;

function mountRail(active = 1) {
  wrapper = mount(SourcePhaseRail, {
    props: { phases, active },
    attachTo: document.body,
    global: { mocks: { $t: (key: string) => key } }
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
  it('renders labels, kinds and status icons', () => {
    mountRail();

    expect(tabs()).toHaveLength(5);
    expect(wrapper!.get('[role="tablist"]').attributes('aria-label')).toBe('sources.levels');
    expect(wrapper!.text()).toContain('sources.phaseSource');
    expect(wrapper!.text()).toContain('sources.phaseTest');
    expect(wrapper!.html()).toContain('lucide-circle-check');
    expect(wrapper!.html()).toContain('lucide-circle-alert');
    expect(wrapper!.html()).toContain('lucide-circle-x');
  });

  it('distinguishes list and page endpoints in the subtitle', () => {
    mountRail();

    expect(tabs()[1].text()).toContain('sources.typeList');
    expect(tabs()[2].text()).toContain('sources.typePage');
  });

  it('marks the active tab and shows delete only for endpoints', () => {
    mountRail(1);

    expect(tabs()[1].attributes('aria-selected')).toBe('true');
    expect(tabs()[1].attributes('tabindex')).toBe('0');
    expect(tabs()[0].attributes('tabindex')).toBe('-1');
    expect(wrapper!.findAll('[aria-label="common.delete"]')).toHaveLength(3);
  });
});

describe('selection', () => {
  it('selects on click, add button and endpoint removal', async () => {
    mountRail();

    await tabs()[2].trigger('click');
    await wrapper!.get('[data-testid="sources-phase-add"]').trigger('click');
    await wrapper!.findAll('[aria-label="common.delete"]')[0].trigger('click');

    expect(wrapper!.emitted('select')).toEqual([[2]]);
    expect(wrapper!.emitted('add')).toHaveLength(1);
    expect(wrapper!.emitted('remove')).toEqual([[1]]);
  });

  it('supports Enter and Space without double selecting', async () => {
    mountRail();

    await tabs()[0].trigger('keydown', { key: 'Enter' });
    await tabs()[0].trigger('keydown', { key: ' ' });

    expect(wrapper!.emitted('select')).toEqual([[0], [0]]);
  });

  it('moves with arrow keys and wraps', async () => {
    mountRail();

    await tabs()[1].trigger('keydown', { key: 'ArrowDown' });
    await tabs()[1].trigger('keydown', { key: 'ArrowRight' });
    await tabs()[1].trigger('keydown', { key: 'ArrowUp' });
    await tabs()[1].trigger('keydown', { key: 'ArrowLeft' });

    expect(wrapper!.emitted('select')).toEqual([[2], [2], [0], [0]]);
  });

  it('jumps Home and End', async () => {
    mountRail();

    await tabs()[2].trigger('keydown', { key: 'Home' });
    await tabs()[2].trigger('keydown', { key: 'End' });

    expect(wrapper!.emitted('select')).toEqual([[0], [4]]);
  });

  it('ignores other keys and prevents default for navigation', async () => {
    mountRail();
    const ignored = new KeyboardEvent('keydown', { key: 'a', cancelable: true });
    tabs()[0].element.dispatchEvent(ignored);
    expect(ignored.defaultPrevented).toBe(false);

    const nav = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });
    tabs()[0].element.dispatchEvent(nav);
    await wrapper!.vm.$nextTick();

    expect(nav.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(tabs()[1].element);
  });
});
