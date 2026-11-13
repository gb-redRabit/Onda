import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  buildJob: vi.fn()
}));

vi.mock('@renderer/utils/onlineJob', () => ({ buildJob: h.buildJob }));

import { buildChannelJobs } from '../onlineChannelJobs';

const item = (id: string) => ({ id, title: id }) as never;

beforeEach(() => {
  h.buildJob.mockReset().mockImplementation((source: { id: string }, prefs: unknown) => ({
    url: source.id,
    prefs
  }));
});

describe('buildChannelJobs', () => {
  it('builds a job per unseen item and assigns the channel', () => {
    const existing = new Set<string | undefined>();

    const jobs = buildChannelJobs(
      [item('a'), item('b')],
      'ch-1',
      'Channel',
      { format: 'mp3' } as never,
      existing,
      new Set()
    );

    expect(jobs).toEqual([
      { url: 'a', prefs: { format: 'mp3' }, channelId: 'ch-1', channelTitle: 'Channel' },
      { url: 'b', prefs: { format: 'mp3' }, channelId: 'ch-1', channelTitle: 'Channel' }
    ]);
    expect([...existing]).toEqual(['a', 'b']);
  });

  it('skips missing ids, queued and downloaded items', () => {
    const existing = new Set<string | undefined>(['b']);

    const jobs = buildChannelJobs(
      [item('a'), item('b'), { title: 'no id' } as never, item('c')],
      'ch',
      undefined,
      undefined,
      existing,
      new Set(['c'])
    );

    expect(jobs).toEqual([{ url: 'a', prefs: undefined, channelId: 'ch' }]);
    expect([...existing]).toEqual(['b', 'a']);
  });

  it('skips duplicates inside the same list', () => {
    const jobs = buildChannelJobs(
      [item('a'), item('a')],
      'ch',
      'T',
      undefined,
      new Set(),
      new Set()
    );

    expect(jobs).toHaveLength(1);
  });

  it('keeps channel fields already produced by buildJob', () => {
    h.buildJob.mockReturnValue({ url: 'a', channelId: 'own', channelTitle: 'Own title' });

    const jobs = buildChannelJobs([item('a')], 'ch', 'Channel', undefined, new Set(), new Set());

    expect(jobs[0]).toMatchObject({ channelId: 'own', channelTitle: 'Own title' });
  });

  it('handles an empty list', () => {
    expect(buildChannelJobs([], 'ch', 'T', undefined, new Set(), new Set())).toEqual([]);
  });
});
