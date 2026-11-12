import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string) => `t:${key}`),
  state: null as Record<string, unknown> | null
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('@renderer/stores/lyrics', () => ({ useLyricsStore: () => h.state }));

import LyricsPanel from '../LyricsPanel.vue';

let wrapper: VueWrapper | null = null;

function line(text: string, timeMs: number) {
  return { text, timeMs };
}

function setup(overrides: Record<string, unknown> = {}, props: Record<string, unknown> = {}) {
  h.state = reactive({
    loading: false,
    error: '',
    result: { kind: 'none', lines: [] },
    lines: [],
    activeIndex: -1,
    delayMs: 0,
    fontScale: 1,
    stepMs: 50,
    fontStep: 0.1,
    adjustFontScale: vi.fn(),
    adjustDelay: vi.fn(),
    resetDelay: vi.fn(),
    seekToLine: vi.fn(),
    ...overrides
  });

  wrapper = mount(LyricsPanel, {
    props,
    global: { stubs: { Transition: false } }
  });
  return wrapper;
}

function buttonByLabel(label: string) {
  return wrapper!.get(`[aria-label="t:lyrics.${label}"]`);
}

beforeEach(() => {
  h.t.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('variants', () => {
  it('uses the default glass styling for unknown variants', () => {
    setup();
    const root = wrapper!.get('[data-testid="lyrics-panel"]');
    expect(root.classes()).toContain('backdrop-blur-xl');
    expect(root.attributes('aria-label')).toBe('t:lyrics.title');
  });

  it('applies the minimal variant palette and border', () => {
    setup({}, { variant: 'minimal' });

    const root = wrapper!.get('[data-testid="lyrics-panel"]');
    expect(root.classes()).toContain('bg-transparent');
    expect(root.find('footer').classes()).toContain('border-transparent');
  });

  it('applies the solid and gradient variants', () => {
    setup({}, { variant: 'solid' });
    expect(wrapper!.get('[data-testid="lyrics-panel"]').classes()).toContain('shadow-xl');

    wrapper!.unmount();
    setup({}, { variant: 'gradient' });
    expect(wrapper!.get('[data-testid="lyrics-panel"]').classes()).toContain('from-base-300/95');
    expect(wrapper!.find('footer').classes()).toContain('border-hairline/60');
  });

  it('scales the content font with the store value', () => {
    setup({ fontScale: 1.4 });

    const style = wrapper!.get('[data-testid="lyrics-panel"] > div').attributes('style') ?? '';
    const size = Number.parseFloat(style.replace('font-size:', ''));
    expect(size).toBeCloseTo(2.1, 5);
  });
});

describe('content states', () => {
  it('shows the loading indicator first', () => {
    setup({ loading: true, error: 'lyrics.loadError' });

    expect(wrapper!.text()).toContain('t:lyrics.loading');
    expect(wrapper!.find('[data-testid="lyrics-error"]').exists()).toBe(false);
  });

  it('shows a translated error', () => {
    setup({ error: 'lyrics.loadError' });

    expect(wrapper!.get('[data-testid="lyrics-error"]').text()).toBe('t:lyrics.loadError');
  });

  it('shows the empty state when there are no lines', () => {
    setup({ result: { kind: 'synced', lines: [] }, lines: [] });

    expect(wrapper!.get('[data-testid="lyrics-empty"]').text()).toBe('t:lyrics.empty');
  });

  it('renders plain lyrics as paragraphs', () => {
    const lines = [line('first', 0), line('second', 0)];
    setup({ result: { kind: 'plain', lines }, lines });

    const paragraphs = wrapper!.findAll('div.h-full p');
    expect(paragraphs.map((p) => p.text())).toEqual(['first', 'second']);
    expect(wrapper!.find('[data-testid="lyrics-current"]').exists()).toBe(false);
  });

  it('renders the current and next synced line', () => {
    const lines = [line('one', 0), line('two', 1000), line('three', 2000)];
    setup({ result: { kind: 'synced', lines }, lines, activeIndex: 1 });

    expect(wrapper!.get('[data-testid="lyrics-current"]').text()).toBe('two');
    expect(wrapper!.get('[data-testid="lyrics-next"]').text()).toBe('three');
  });

  it('clamps a negative active index to the first line', () => {
    const lines = [line('one', 0), line('two', 1000)];
    setup({ result: { kind: 'synced', lines }, lines, activeIndex: -1 });

    expect(wrapper!.get('[data-testid="lyrics-current"]').text()).toBe('one');
  });

  it('omits the next line at the end of the track', () => {
    const lines = [line('one', 0)];
    setup({ result: { kind: 'synced', lines }, lines, activeIndex: 0 });

    expect(wrapper!.get('[data-testid="lyrics-current"]').text()).toBe('one');
    expect(wrapper!.find('[data-testid="lyrics-next"]').exists()).toBe(false);
  });
});

describe('interactions', () => {
  it('seeks to the tapped current and next lines', async () => {
    const lines = [line('one', 0), line('two', 1000)];
    const state = setup({ result: { kind: 'synced', lines }, lines, activeIndex: 0 });
    const store = h.state as { seekToLine: ReturnType<typeof vi.fn> };

    await state.get('[data-testid="lyrics-current"]').trigger('click');
    await state.get('[data-testid="lyrics-next"]').trigger('click');

    expect(store.seekToLine).toHaveBeenNthCalledWith(1, 0);
    expect(store.seekToLine).toHaveBeenNthCalledWith(2, 1);
  });

  it('adjusts the font scale within bounds', async () => {
    setup({ fontScale: 1 });
    const store = h.state as { adjustFontScale: ReturnType<typeof vi.fn> };

    await buttonByLabel('zoomOut').trigger('click');
    await buttonByLabel('zoomIn').trigger('click');

    expect(store.adjustFontScale).toHaveBeenNthCalledWith(1, -0.1);
    expect(store.adjustFontScale).toHaveBeenNthCalledWith(2, 0.1);
  });

  it('disables zoom buttons at the scale limits', () => {
    setup({ fontScale: 0.8 });
    expect(buttonByLabel('zoomOut').attributes('disabled')).toBeDefined();
    expect(buttonByLabel('zoomIn').attributes('disabled')).toBeUndefined();
  });

  it('disables zoom-in at the maximum scale', () => {
    setup({ fontScale: 2 });
    expect(buttonByLabel('zoomIn').attributes('disabled')).toBeDefined();
    expect(buttonByLabel('zoomOut').attributes('disabled')).toBeUndefined();
  });

  it('adjusts and resets the delay', async () => {
    setup({ delayMs: 250 });
    const store = h.state as {
      adjustDelay: ReturnType<typeof vi.fn>;
      resetDelay: ReturnType<typeof vi.fn>;
    };

    await buttonByLabel('earlier').trigger('click');
    await buttonByLabel('later').trigger('click');

    expect(store.adjustDelay).toHaveBeenNthCalledWith(1, -50);
    expect(store.adjustDelay).toHaveBeenNthCalledWith(2, 50);
    expect(wrapper!.text()).toContain('+250 ms');

    const resetButtons = wrapper!.findAll('[aria-label="t:lyrics.resetOffset"]');
    await resetButtons[0].trigger('click');
    await resetButtons[1].trigger('click');

    expect(store.resetDelay).toHaveBeenCalledTimes(2);
  });

  it('formats negative delays with a minus sign', () => {
    setup({ delayMs: -150 });
    expect(wrapper!.text()).toContain('\u2212150 ms');
  });
});
