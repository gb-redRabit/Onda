import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { EQ_LIMITS, type EqBand, type EqBandType } from '@renderer/utils/constants/audio';
import { freqToRatio } from '@renderer/utils/eqCurve';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

import EqBandRow from '../EqBandRow.vue';

let wrapper: VueWrapper | null = null;

function band(overrides: Partial<EqBand> = {}): EqBand {
  return {
    type: 'peaking',
    frequency: 1000,
    gain: 3,
    q: 1,
    enabled: true,
    ...overrides
  } as EqBand;
}

const types: EqBandType[] = ['peaking', 'lowshelf', 'highshelf'];

function setup(props: Record<string, unknown> = {}) {
  wrapper = mount(EqBandRow, {
    props: {
      band: band(),
      index: 2,
      color: '#ff0000',
      soloed: false,
      hovered: false,
      canRemove: true,
      snapEnabled: false,
      bandTypes: types,
      typeLabel: (type: EqBandType) => `label:${type}`,
      ...props
    },
    global: { mocks: { $t: (key: string) => key } }
  });
  return wrapper;
}

function lastPatch() {
  const calls = wrapper!.emitted('patch');
  return (calls?.at(-1)?.[0] ?? {}) as Partial<EqBand>;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.useRealTimers();
});

describe('rendering', () => {
  it('renders the band index, type options and values', () => {
    setup();

    expect(wrapper!.get('[data-testid="eq-band-row"]').text()).toContain('3');
    const select = wrapper!.get('[data-testid="eq-type-2"]');
    expect(select.findAll('option').map((option) => option.text())).toEqual([
      'label:peaking',
      'label:lowshelf',
      'label:highshelf'
    ]);
    expect((select.element as HTMLSelectElement).value).toBe('peaking');
    expect(wrapper!.text()).toContain('1000 equalizer.hz');
    expect(wrapper!.get('[data-testid="eq-freq-2"]').attributes('style')).toContain(
      'accent-color: rgb(255, 0, 0)'
    );
  });

  it('uses the marker shape for the band type', () => {
    setup({ band: band({ type: 'lowshelf' }) });
    const marker = wrapper!.get('[aria-hidden="true"]');
    expect(marker.attributes('style')).toContain('border-radius: 50% 50% 18% 18%');
  });

  it('dims disabled bands', () => {
    setup({ band: band({ enabled: false }) });
    const row = wrapper!.get('[data-testid="eq-band-row"]');
    expect(row.classes()).toContain('opacity-50');
    expect(wrapper!.get('[data-testid="eq-enable-2"]').attributes('aria-pressed')).toBe('false');
  });

  it('tints hovered rows', () => {
    setup({ hovered: true });
    const style = wrapper!.get('[data-testid="eq-band-row"]').attributes('style') ?? '';
    expect(style).toContain('color-mix');
    expect(style).toContain('8%');
  });

  it('marks soloed bands', () => {
    setup({ soloed: true });
    const solo = wrapper!.get('[data-testid="eq-solo-2"]');
    expect(solo.classes()).toContain('bg-primary');
    expect(solo.attributes('aria-pressed')).toBe('true');
  });
});

describe('simple actions', () => {
  it('changes the type', async () => {
    setup();
    const select = wrapper!.get('[data-testid="eq-type-2"]');
    (select.element as HTMLSelectElement).value = 'highshelf';
    await select.trigger('change');

    expect(lastPatch()).toEqual({ type: 'highshelf' });
  });

  it('toggles enablement based on the current state', async () => {
    setup({ band: band({ enabled: false }) });
    await wrapper!.get('[data-testid="eq-enable-2"]').trigger('click');
    expect(lastPatch()).toEqual({ enabled: true });
  });

  it('emits solo and remove', async () => {
    setup();
    await wrapper!.get('[data-testid="eq-solo-2"]').trigger('click');
    await wrapper!.get('[data-testid="eq-remove-2"]').trigger('click');

    expect(wrapper!.emitted('toggle-solo')).toHaveLength(1);
    expect(wrapper!.emitted('remove')).toHaveLength(1);
  });

  it('disables removal when not allowed', () => {
    setup({ canRemove: false });
    expect(wrapper!.get('[data-testid="eq-remove-2"]').attributes('disabled')).toBeDefined();
  });
});

describe('frequency controls', () => {
  it('steps frequency with arrows and shift', async () => {
    setup();
    const slider = wrapper!.get('[data-testid="eq-freq-2"]');

    await slider.trigger('keydown', { key: 'ArrowUp' });
    expect(lastPatch()).toEqual({ frequency: 1010 });

    await slider.trigger('keydown', { key: 'ArrowRight', shiftKey: true });
    expect(lastPatch()).toEqual({ frequency: 1050 });

    await slider.trigger('keydown', { key: 'ArrowLeft' });
    expect(lastPatch()).toEqual({ frequency: 990 });
  });

  it('jumps to the frequency bounds', async () => {
    setup();
    const slider = wrapper!.get('[data-testid="eq-freq-2"]');

    await slider.trigger('keydown', { key: 'Home' });
    expect(lastPatch()).toEqual({ frequency: EQ_LIMITS.minFrequency });

    await slider.trigger('keydown', { key: 'End' });
    expect(lastPatch()).toEqual({ frequency: EQ_LIMITS.maxFrequency });
  });

  it('ignores unrelated keys', async () => {
    setup();
    await wrapper!.get('[data-testid="eq-freq-2"]').trigger('keydown', { key: 'a' });
    expect(wrapper!.emitted('patch')).toBeUndefined();
  });

  it('snaps frequencies when enabled', async () => {
    setup({ snapEnabled: true });
    await wrapper!.get('[data-testid="eq-freq-2"]').trigger('keydown', { key: 'ArrowUp' });
    expect(lastPatch()).toEqual({ frequency: 1000 });
  });

  it('converts slider input to a frequency', async () => {
    setup();
    const slider = wrapper!.get('[data-testid="eq-freq-2"]');
    (slider.element as HTMLInputElement).value = String(
      freqToRatio(500, EQ_LIMITS.minFrequency, EQ_LIMITS.maxFrequency)
    );
    await slider.trigger('input');

    const frequency = lastPatch().frequency!;
    expect(frequency).toBeGreaterThanOrEqual(EQ_LIMITS.minFrequency);
    expect(frequency).toBeLessThanOrEqual(EQ_LIMITS.maxFrequency);
    expect(Number.isInteger(frequency)).toBe(true);
  });
});

describe('Q controls', () => {
  it('shows the Q slider only for peaking bands', () => {
    setup();
    expect(wrapper!.find('[data-testid="eq-q-2"]').exists()).toBe(true);
    expect(wrapper!.find('[data-testid="eq-slope-2"]').exists()).toBe(false);
  });

  it('steps, clamps and jumps Q', async () => {
    setup();
    const slider = wrapper!.get('[data-testid="eq-q-2"]');

    await slider.trigger('keydown', { key: 'ArrowUp' });
    expect(lastPatch()).toEqual({ q: 1.1 });

    await slider.trigger('keydown', { key: 'ArrowDown', shiftKey: true });
    expect(lastPatch()).toEqual({ q: 0.3 });

    await slider.trigger('keydown', { key: 'End' });
    expect(lastPatch()).toEqual({ q: 8 });

    await slider.trigger('keydown', { key: 'Home' });
    expect(lastPatch()).toEqual({ q: 0.3 });
  });

  it('clamps slider input', async () => {
    setup();
    const slider = wrapper!.get('[data-testid="eq-q-2"]');
    (slider.element as HTMLInputElement).value = '20';
    await slider.trigger('input');
    expect(lastPatch()).toEqual({ q: EQ_LIMITS.maxQ });
  });

  it('ignores unsupported Q keys', async () => {
    setup();
    await wrapper!.get('[data-testid="eq-q-2"]').trigger('keydown', { key: 'x' });
    expect(wrapper!.emitted('patch')).toBeUndefined();
  });
});

describe('slope controls', () => {
  it('shows the slope slider for shelf bands', () => {
    setup({ band: band({ type: 'lowshelf', slope: 1.2 }) });
    expect(wrapper!.find('[data-testid="eq-q-2"]').exists()).toBe(false);
    const slope = wrapper!.get('[data-testid="eq-slope-2"]');
    expect((slope.element as HTMLInputElement).value).toBe('1.2');
  });

  it('defaults the slope to one', () => {
    setup({ band: band({ type: 'highshelf' }) });
    expect(wrapper!.text()).toContain('1');
  });

  it('clamps slope input', async () => {
    setup({ band: band({ type: 'lowshelf' }) });
    const slope = wrapper!.get('[data-testid="eq-slope-2"]');

    (slope.element as HTMLInputElement).value = '5';
    await slope.trigger('input');
    expect(lastPatch()).toEqual({ slope: 2 });

    (slope.element as HTMLInputElement).value = '0';
    await slope.trigger('input');
    expect(lastPatch()).toEqual({ slope: 0.3 });
  });
});

describe('gain controls', () => {
  it('steps, pages, jumps and resets gain', async () => {
    setup();
    const gain = wrapper!.get('[data-testid="eq-band-2"]');

    await gain.trigger('keydown', { key: 'ArrowUp' });
    expect(lastPatch()).toEqual({ gain: 4 });
    await gain.trigger('keydown', { key: 'ArrowDown' });
    expect(lastPatch()).toEqual({ gain: 2 });
    await gain.trigger('keydown', { key: 'PageUp' });
    expect(lastPatch()).toEqual({ gain: 9 });
    await gain.trigger('keydown', { key: 'PageDown' });
    expect(lastPatch()).toEqual({ gain: -3 });
    await gain.trigger('keydown', { key: 'Home' });
    expect(lastPatch()).toEqual({ gain: EQ_LIMITS.minGain });
    await gain.trigger('keydown', { key: 'End' });
    expect(lastPatch()).toEqual({ gain: EQ_LIMITS.maxGain });
    await gain.trigger('keydown', { key: '0' });
    expect(lastPatch()).toEqual({ gain: 0 });
  });

  it('clamps gain at the bounds', async () => {
    setup({ band: band({ gain: 18 }) });
    await wrapper!.get('[data-testid="eq-band-2"]').trigger('keydown', { key: 'ArrowUp' });
    expect(lastPatch()).toEqual({ gain: 18 });
  });

  it('ignores other gain keys', async () => {
    setup();
    await wrapper!.get('[data-testid="eq-band-2"]').trigger('keydown', { key: 'Enter' });
    expect(wrapper!.emitted('patch')).toBeUndefined();
  });

  it('updates gain by dragging and releases listeners', async () => {
    setup();
    const gain = wrapper!.get('[data-testid="eq-band-2"]');
    gain.element.getBoundingClientRect = () =>
      ({ left: 10, width: 100, top: 0, height: 10 }) as DOMRect;
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');

    await gain.trigger('mousedown', { clientX: 60 });
    expect(lastPatch()).toEqual({ gain: 0 });
    expect(add).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(add).toHaveBeenCalledWith('mouseup', expect.any(Function));

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 110 }));
    expect(lastPatch()).toEqual({ gain: 18 });

    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(remove).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('mouseup', expect.any(Function));
  });

  it('exposes accessible gain values', () => {
    setup({ band: band({ gain: -3 }) });
    const gain = wrapper!.get('[data-testid="eq-band-2"]');
    expect(gain.attributes('aria-valuenow')).toBe('-3');
    expect(gain.attributes('aria-valuetext')).toBe('-3 dB');
  });
});
