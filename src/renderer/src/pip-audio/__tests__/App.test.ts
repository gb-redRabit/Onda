import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { computed, ref } from 'vue';

const h = vi.hoisted(() => ({
  state: null as any,
  viz: { setCanvas: vi.fn(), updateAccent: vi.fn() },
  usePipAudioState: vi.fn(),
  usePipVisualizer: vi.fn()
}));

vi.mock('../usePipAudioState', () => ({ usePipAudioState: h.usePipAudioState }));
vi.mock('../usePipVisualizer', () => ({ usePipVisualizer: h.usePipVisualizer }));

import PipAudioApp from '../App.vue';

const CardStub = {
  name: 'PipCardLayout',
  props: ['state'],
  template: '<div data-testid="card" />'
};
const BarStub = { name: 'PipBarLayout', props: ['state'], template: '<div data-testid="bar" />' };
const StackStub = {
  name: 'PipStackLayout',
  props: ['state'],
  template: '<div data-testid="stack" />'
};

function makeState(over: Record<string, unknown> = {}) {
  return {
    isPlaying: ref(true),
    dock: ref('bottom'),
    layoutKind: ref('card'),
    edge: ref(null),
    peeked: ref(false),
    has: vi.fn(() => false),
    progressPct: ref(42.6),
    showMain: vi.fn(),
    onProgressClick: vi.fn(),
    onProgressKeydown: vi.fn(),
    vizData: ref([]),
    isVertical: computed(() => false),
    ...over
  } as never;
}

function mountApp() {
  return mount(PipAudioApp, {
    global: {
      stubs: { PipCardLayout: CardStub, PipBarLayout: BarStub, PipStackLayout: StackStub }
    }
  });
}

beforeEach(() => {
  h.state = makeState();
  h.usePipAudioState.mockReset().mockReturnValue(h.state);
  h.usePipVisualizer.mockReset().mockReturnValue(h.viz);
  h.viz.setCanvas.mockClear();
  h.viz.updateAccent.mockClear();
});

describe('audio PiP App', () => {
  it('renders the card layout by default', () => {
    const wrapper = mountApp();

    expect(wrapper.find('[data-testid="pip-audio-root"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="card"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="bar"]').exists()).toBe(false);
  });

  it('renders the horizontal bar layout', () => {
    h.state.layoutKind.value = 'bar-h';
    const wrapper = mountApp();

    expect(wrapper.find('[data-testid="bar"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="card"]').exists()).toBe(false);
  });

  it('renders the vertical stack layout', () => {
    h.state.layoutKind.value = 'stack-v';
    const wrapper = mountApp();

    expect(wrapper.find('[data-testid="stack"]').exists()).toBe(true);
  });

  it('wires the accent updater from the visualizer', () => {
    mountApp();

    expect(h.usePipVisualizer).toHaveBeenCalledWith(h.state.vizData, h.state.isVertical);
    expect(h.viz.updateAccent).toBeTypeOf('function');
  });

  it('shows the visualizer canvas only when enabled', () => {
    expect(mountApp().find('canvas').exists()).toBe(false);

    h.state.has.mockImplementation((id: string) => id === 'viz');
    expect(mountApp().find('canvas').exists()).toBe(true);
  });

  it('renders the peek progress bar with a horizontal fill', () => {
    h.state.peeked.value = true;
    h.state.edge.value = 'bottom';
    const wrapper = mountApp();
    const slider = wrapper.get('[role="slider"]');

    expect(wrapper.find('[data-testid="card"]').exists()).toBe(false);
    expect(slider.attributes('aria-valuenow')).toBe('43');
    expect(slider.get('div').attributes('style')).toContain('width: 42.6%');
  });

  it('uses a vertical fill on side edges', async () => {
    h.state.peeked.value = true;
    h.state.edge.value = 'left';
    const wrapper = mountApp();

    expect(wrapper.get('[role="slider"] div').attributes('style')).toContain('height: 42.6%');
  });

  it('keeps the normal layout when peeked without an edge', () => {
    h.state.peeked.value = true;
    const wrapper = mountApp();

    expect(wrapper.find('[data-testid="card"]').exists()).toBe(true);
    expect(wrapper.find('[role="slider"]').exists()).toBe(false);
  });

  it('forwards peek progress interactions', async () => {
    h.state.peeked.value = true;
    h.state.edge.value = 'right';
    const wrapper = mountApp();

    await wrapper.get('[role="slider"]').trigger('click');
    await wrapper.get('[role="slider"]').trigger('keydown');

    expect(h.state.onProgressClick).toHaveBeenCalled();
    expect(h.state.onProgressKeydown).toHaveBeenCalled();
  });

  it('opens the main window on a background double click', async () => {
    const wrapper = mountApp();

    await wrapper.get('[data-testid="pip-audio-root"]').trigger('dblclick');

    expect(h.state.showMain).toHaveBeenCalledTimes(1);
  });

  it('ignores double clicks on buttons and inputs', async () => {
    const wrapper = mountApp();
    const root = wrapper.get('[data-testid="pip-audio-root"]').element;
    root.insertAdjacentHTML('beforeend', '<button id="inside">x</button><input id="field" />');

    root.querySelector('#inside')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    root.querySelector('#field')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(h.state.showMain).not.toHaveBeenCalled();
  });
});
