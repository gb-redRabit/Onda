import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';

const mocks = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  player: null as any,
  formatDuration: vi.fn((value: number) => `T${value}`)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: mocks.t }) }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => mocks.player }));
vi.mock('@renderer/utils/formatters', () => ({ formatDuration: mocks.formatDuration }));

import AbRepeatButton from '../AbRepeatButton.vue';

let wrapper: VueWrapper | null = null;

function mountButton(currentTime = 42) {
  wrapper = mount(AbRepeatButton, { props: { currentTime } });
  return wrapper;
}

function button() {
  return wrapper!.get('[data-testid="ab-repeat-button"]');
}

beforeEach(() => {
  mocks.player = reactive({
    abA: null as number | null,
    abB: null as number | null,
    setAbA: vi.fn(),
    setAbB: vi.fn(),
    clearAb: vi.fn()
  });
  mocks.t.mockClear();
  mocks.formatDuration.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('idle state', () => {
  it('offers setting point A', async () => {
    mountButton(42);

    expect(button().attributes('data-state')).toBe('idle');
    expect(button().text()).toBe('');
    expect(button().attributes('title')).toBe('playerView.abRepeat — playerView.abSetA');
    expect(button().classes()).toContain('text-neutral-content/60');

    await button().trigger('click');

    expect(mocks.player.setAbA).toHaveBeenCalledWith(42);
    expect(mocks.player.setAbB).not.toHaveBeenCalled();
    expect(mocks.player.clearAb).not.toHaveBeenCalled();
  });
});

describe('A set', () => {
  it('shows A and offers setting point B', async () => {
    mocks.player.abA = 12;
    mountButton(42);

    expect(button().attributes('data-state')).toBe('a');
    expect(button().text()).toBe('A T12');
    expect(button().attributes('title')).toBe('playerView.abRepeat — playerView.abSetB');
    expect(button().classes()).toContain('text-neutral-content');
    expect(mocks.formatDuration).toHaveBeenCalledWith(12);

    await button().trigger('click');

    expect(mocks.player.setAbB).toHaveBeenCalledWith(42);
  });
});

describe('A–B set', () => {
  it('shows the range and clears it', async () => {
    mocks.player.abA = 12;
    mocks.player.abB = 30;
    mountButton(42);

    expect(button().attributes('data-state')).toBe('ab');
    expect(button().text()).toBe('T12–T30');
    expect(button().attributes('title')).toBe('playerView.abRepeat — playerView.abClear');
    expect(button().classes()).toContain('text-primary-text');

    await button().trigger('click');

    expect(mocks.player.clearAb).toHaveBeenCalledTimes(1);
    expect(mocks.player.setAbA).not.toHaveBeenCalled();
    expect(mocks.player.setAbB).not.toHaveBeenCalled();
  });
});
