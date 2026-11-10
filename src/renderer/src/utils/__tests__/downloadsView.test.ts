import { describe, expect, it } from 'vitest';
import type { DownloadTask } from '@renderer/types/online';

import {
  buildDownloadFilters,
  groupDownloads,
  visibleDownloads,
  type DownloadGroups
} from '../downloadsView';

function task(overrides: Partial<DownloadTask> = {}): DownloadTask {
  return {
    id: 't1',
    title: 'Video',
    channelId: 'ch1',
    status: 'pending',
    ...overrides
  } as DownloadTask;
}

describe('groupDownloads', () => {
  it('groups statuses in a single pass and counts paused items', () => {
    const groups = groupDownloads([
      task({ id: 'downloading', status: 'downloading' }),
      task({ id: 'pending', status: 'pending' }),
      task({ id: 'paused', status: 'paused' }),
      task({ id: 'done', status: 'completed' }),
      task({ id: 'error', status: 'error' }),
      task({ id: 'cancelled', status: 'cancelled' }),
      task({ id: 'unknown', status: 'queued' as never })
    ]);

    expect(groups.active.map((d) => d.id)).toEqual(['downloading', 'pending', 'paused']);
    expect(groups.completed.map((d) => d.id)).toEqual(['done']);
    expect(groups.failed.map((d) => d.id)).toEqual(['error', 'cancelled']);
    expect(groups.pausedCount).toBe(1);
  });

  it('handles an empty list', () => {
    expect(groupDownloads([])).toEqual({
      active: [],
      completed: [],
      failed: [],
      pausedCount: 0
    });
  });
});

describe('visibleDownloads', () => {
  const all = [
    task({ id: 'a', title: 'Alpha Song', channelId: 'ch1', status: 'downloading' }),
    task({ id: 'b', title: 'Beta Clip', channelId: 'ch2', status: 'completed' }),
    task({ id: 'c', title: 'Gamma', channelId: 'ch1', status: 'error' }),
    task({ id: 'd', title: undefined as never, channelId: 'ch2', status: 'pending' })
  ];
  const groups: DownloadGroups = groupDownloads(all);

  it('selects the requested group', () => {
    expect(visibleDownloads(all, groups, 'all', '', '').map((d) => d.id)).toEqual([
      'a',
      'b',
      'c',
      'd'
    ]);
    expect(visibleDownloads(all, groups, 'active', '', '').map((d) => d.id)).toEqual(['a', 'd']);
    expect(visibleDownloads(all, groups, 'completed', '', '').map((d) => d.id)).toEqual(['b']);
    expect(visibleDownloads(all, groups, 'failed', '', '').map((d) => d.id)).toEqual(['c']);
  });

  it('filters by channel', () => {
    expect(visibleDownloads(all, groups, 'all', 'ch1', '').map((d) => d.id)).toEqual(['a', 'c']);
  });

  it('searches titles case-insensitively and tolerates missing titles', () => {
    expect(visibleDownloads(all, groups, 'all', '', '  ALPHA  ').map((d) => d.id)).toEqual(['a']);
    expect(visibleDownloads(all, groups, 'all', '', 'song').map((d) => d.id)).toEqual(['a']);
    expect(visibleDownloads(all, groups, 'all', '', 'missing')).toEqual([]);
  });

  it('combines channel and search filters', () => {
    expect(visibleDownloads(all, groups, 'active', 'ch2', 'beta').map((d) => d.id)).toEqual([]);
    expect(visibleDownloads(all, groups, 'all', 'ch2', '').map((d) => d.id)).toEqual(['b', 'd']);
  });
});

describe('buildDownloadFilters', () => {
  it('builds counts for each filter', () => {
    const all = [
      task({ status: 'downloading' }),
      task({ status: 'completed' }),
      task({ status: 'error' }),
      task({ status: 'paused' })
    ];

    expect(buildDownloadFilters(all, groupDownloads(all))).toEqual([
      { id: 'all', labelKey: 'downloads.filterAll', count: 4 },
      { id: 'active', labelKey: 'downloads.filterActive', count: 2 },
      { id: 'completed', labelKey: 'downloads.filterCompleted', count: 1 },
      { id: 'failed', labelKey: 'downloads.filterFailed', count: 1 }
    ]);
  });
});
