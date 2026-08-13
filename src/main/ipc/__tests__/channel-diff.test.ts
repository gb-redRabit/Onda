import { describe, it, expect } from 'vitest';
import { computeChannelDiff } from '../channel-diff';

describe('computeChannelDiff', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

  it('returns all unknown videos as new when there is no baseline', () => {
    const result = computeChannelDiff({
      items,
      downloadedVideoIds: ['b'],
      queuedVideoIds: [],
      baselineVideoId: undefined
    });
    expect(result.newArrivals.map((i) => i.id)).toEqual(['a', 'c', 'd']);
    expect(result.remainingCount).toBe(3);
    expect(result.reachedBaseline).toBe(false);
  });

  it('limits new arrivals to videos before the baseline', () => {
    const result = computeChannelDiff({
      items,
      downloadedVideoIds: [],
      queuedVideoIds: [],
      baselineVideoId: 'c'
    });
    expect(result.newArrivals.map((i) => i.id)).toEqual(['a', 'b']);
    expect(result.reachedBaseline).toBe(true);
  });

  it('excludes queued videos from new arrivals but keeps them in remaining', () => {
    const result = computeChannelDiff({
      items,
      downloadedVideoIds: [],
      queuedVideoIds: ['a'],
      baselineVideoId: undefined
    });
    expect(result.newArrivals.map((i) => i.id)).toEqual(['b', 'c', 'd']);
    expect(result.remainingCount).toBe(4);
  });

  it('counts remaining as not-downloaded regardless of baseline/queued', () => {
    const result = computeChannelDiff({
      items,
      downloadedVideoIds: ['a', 'd'],
      queuedVideoIds: ['b'],
      baselineVideoId: 'b'
    });
    expect(result.remainingCount).toBe(2);
    expect(result.newArrivals).toEqual([]);
  });

  it('handles an empty channel', () => {
    const result = computeChannelDiff({
      items: [],
      downloadedVideoIds: [],
      queuedVideoIds: [],
      baselineVideoId: 'x'
    });
    expect(result.newArrivals).toEqual([]);
    expect(result.remainingCount).toBe(0);
    expect(result.reachedBaseline).toBe(false);
  });
});
