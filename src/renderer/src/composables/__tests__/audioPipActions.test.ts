import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  player: {
    togglePlay: vi.fn(),
    nextTrack: vi.fn(),
    prevTrack: vi.fn(),
    toggleShuffle: vi.fn(),
    cycleRepeat: vi.fn(),
    setVolume: vi.fn(),
    toggleMute: vi.fn()
  },
  fx: { equalizerPreset: 'flat' },
  applyEqBands: vi.fn(),
  clone: vi.fn((bands: unknown) => ({ cloned: bands }))
}));

vi.mock('@renderer/composables/useAudioPlayer', () => ({
  useAudioPlayer: () => ({ applyEqBands: h.applyEqBands })
}));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => h.player }));
vi.mock('@renderer/stores/audioFx', () => ({ useAudioFxStore: () => h.fx }));
vi.mock('@renderer/utils/constants', () => ({
  EQUALIZER_PRESETS: {
    flat: [0, 0, 0],
    bass: [6, 3, 0]
  },
  cloneEqBands: h.clone
}));

import { dispatchAudioPipAction } from '../audioPipActions';

beforeEach(() => {
  vi.clearAllMocks();
  h.fx.equalizerPreset = 'flat';
});

describe('transport actions', () => {
  it('maps playback actions to the player store', () => {
    dispatchAudioPipAction('playPause');
    dispatchAudioPipAction('next');
    dispatchAudioPipAction('prev');
    dispatchAudioPipAction('shuffle');
    dispatchAudioPipAction('repeat');
    dispatchAudioPipAction('mute');

    expect(h.player.togglePlay).toHaveBeenCalled();
    expect(h.player.nextTrack).toHaveBeenCalled();
    expect(h.player.prevTrack).toHaveBeenCalled();
    expect(h.player.toggleShuffle).toHaveBeenCalled();
    expect(h.player.cycleRepeat).toHaveBeenCalled();
    expect(h.player.toggleMute).toHaveBeenCalled();
  });

  it('ignores unknown actions', () => {
    dispatchAudioPipAction('somethingElse');
    dispatchAudioPipAction('');

    expect(h.player.togglePlay).not.toHaveBeenCalled();
    expect(h.applyEqBands).not.toHaveBeenCalled();
  });
});

describe('volume', () => {
  it('parses and applies a valid volume', () => {
    dispatchAudioPipAction('volume:0.5');
    dispatchAudioPipAction('volume:1');
    dispatchAudioPipAction('volume:0');

    expect(h.player.setVolume).toHaveBeenNthCalledWith(1, 0.5);
    expect(h.player.setVolume).toHaveBeenNthCalledWith(2, 1);
    expect(h.player.setVolume).toHaveBeenNthCalledWith(3, 0);
  });

  it('ignores malformed volume values', () => {
    dispatchAudioPipAction('volume:loud');
    dispatchAudioPipAction('volume:');

    expect(h.player.setVolume).not.toHaveBeenCalled();
  });
});

describe('equalizer presets', () => {
  it('applies a known preset and updates the store label', () => {
    dispatchAudioPipAction('eqPreset:bass');

    expect(h.fx.equalizerPreset).toBe('bass');
    expect(h.clone).toHaveBeenCalledWith([6, 3, 0]);
    expect(h.applyEqBands).toHaveBeenCalledWith({ cloned: [6, 3, 0] });
  });

  it('ignores unknown presets', () => {
    dispatchAudioPipAction('eqPreset:missing');

    expect(h.fx.equalizerPreset).toBe('flat');
    expect(h.applyEqBands).not.toHaveBeenCalled();
  });

  it('handles an empty preset name', () => {
    dispatchAudioPipAction('eqPreset:');
    expect(h.applyEqBands).not.toHaveBeenCalled();
  });
});
