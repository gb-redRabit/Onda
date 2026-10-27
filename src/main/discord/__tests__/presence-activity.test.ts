import { describe, expect, it } from 'vitest';
import type { PresenceState } from '../../../shared/types/discord';
import { buildActivity } from '../presence-activity';

function state(partial: Partial<PresenceState>): PresenceState {
  return { title: 'Song', kind: 'audio', isPlaying: true, ...partial };
}

describe('buildActivity', () => {
  it('returns null when paused, empty or no state', () => {
    expect(buildActivity(null)).toBeNull();
    expect(buildActivity(state({ isPlaying: false }))).toBeNull();
  });

  it('maps audio to a listening activity with details/state', () => {
    const activity = buildActivity(state({ title: 'Song', artist: 'Artist', album: 'Album' }));
    expect(activity).toMatchObject({
      type: 2,
      details: 'Song',
      state: 'Artist',
      assets: { large_image: 'onda_logo', large_text: 'Album' }
    });
  });

  it('falls back to the album when there is no artist', () => {
    const activity = buildActivity(state({ title: 'Song', album: 'Album' }));
    expect(activity).toMatchObject({ state: 'Album', assets: { large_text: 'Album' } });
  });

  it('uses the watching type for video and a cover URL when provided', () => {
    const activity = buildActivity(
      state({ kind: 'video', coverUrl: 'https://example.com/cover.png' })
    );
    expect(activity?.type).toBe(3);
    expect(activity?.assets?.large_image).toBe('https://example.com/cover.png');
  });

  it('adds a progress bar for a finite duration and clamps the position', () => {
    const now = Date.now();
    const activity = buildActivity(state({ positionSec: 30, durationSec: 120 }));
    expect(activity?.timestamps).toBeDefined();
    expect(Math.abs((activity?.timestamps?.start ?? 0) - (now - 30_000))).toBeLessThan(1000);
    expect(Math.abs((activity?.timestamps?.end ?? 0) - (now + 90_000))).toBeLessThan(1000);
  });

  it('omits the progress bar for streams', () => {
    expect(buildActivity(state({ kind: 'stream' }))?.timestamps).toBeUndefined();
  });

  it('truncates long text to 128 characters', () => {
    const activity = buildActivity(state({ title: 'x'.repeat(300) }));
    expect(activity?.details).toHaveLength(128);
    expect(activity?.details.endsWith('…')).toBe(true);
  });
});
