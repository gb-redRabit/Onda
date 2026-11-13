import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Puzzle, Triangle } from '@lucide/vue';

import { pluginIcon, resolveElementDecoration } from '../audioView';
import { getPlayerPiPHandler, setPlayerPiPHandler } from '../../composables/playerPiPHandler';

describe('resolveElementDecoration', () => {
  it('prefers a live plugin decoration', () => {
    const element = { id: 'cover', decoration: 'original' } as never;

    expect(resolveElementDecoration(element, { cover: 'live' })).toBe('live');
  });

  it('falls back to the element decoration', () => {
    expect(resolveElementDecoration({ id: 'cover', decoration: 'original' } as never, {})).toBe(
      'original'
    );
    expect(
      resolveElementDecoration({ id: 'cover', decoration: 'original' } as never, {
        cover: undefined
      })
    ).toBe('original');
    expect(resolveElementDecoration({ id: 'cover' } as never, {})).toBeUndefined();
  });
});

describe('pluginIcon', () => {
  it('maps known plugin icon names', () => {
    expect(pluginIcon('Triangle')).toBe(Triangle);
  });

  it('falls back to the puzzle icon', () => {
    expect(pluginIcon('Unknown')).toBe(Puzzle);
    expect(pluginIcon()).toBe(Puzzle);
    expect(pluginIcon('')).toBe(Puzzle);
  });
});

describe('player PiP handler registry', () => {
  beforeEach(async () => {
    const module = await import('../../composables/playerPiPHandler');
    module.setPlayerPiPHandler(null);
  });

  it('starts empty', () => {
    expect(getPlayerPiPHandler()).toBeNull();
  });

  it('stores and clears the handler', () => {
    const handler = vi.fn();
    setPlayerPiPHandler(handler);

    expect(getPlayerPiPHandler()).toBe(handler);

    setPlayerPiPHandler(null);
    expect(getPlayerPiPHandler()).toBeNull();
  });
});
