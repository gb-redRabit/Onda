import type { DownloadTask } from '@renderer/types/online';

// Pure download-list helpers extracted from `views/DownloadsView.vue`
// (plan 2.8): single-pass grouping + filtering of the download queue.

export type DownloadFilter = 'all' | 'active' | 'completed' | 'failed';

export interface DownloadGroups {
  active: DownloadTask[];
  completed: DownloadTask[];
  failed: DownloadTask[];
  pausedCount: number;
}

// Single pass over the list instead of four separate filters on every progress
// event (plan 1.6).
export function groupDownloads(downloads: DownloadTask[]): DownloadGroups {
  const active: DownloadTask[] = [];
  const completed: DownloadTask[] = [];
  const failed: DownloadTask[] = [];
  let pausedCount = 0;
  for (const d of downloads) {
    if (d.status === 'downloading' || d.status === 'pending' || d.status === 'paused') {
      active.push(d);
    } else if (d.status === 'completed') {
      completed.push(d);
    } else if (d.status === 'error' || d.status === 'cancelled') {
      failed.push(d);
    }
    if (d.status === 'paused') pausedCount++;
  }
  return { active, completed, failed, pausedCount };
}

export function visibleDownloads(
  all: DownloadTask[],
  groups: DownloadGroups,
  filter: DownloadFilter,
  channelFilter: string,
  searchQuery: string
): DownloadTask[] {
  let list: DownloadTask[];
  switch (filter) {
    case 'active':
      list = groups.active;
      break;
    case 'completed':
      list = groups.completed;
      break;
    case 'failed':
      list = groups.failed;
      break;
    default:
      list = all;
  }
  if (channelFilter) {
    list = list.filter((d) => d.channelId === channelFilter);
  }
  const q = searchQuery.toLowerCase().trim();
  if (q) list = list.filter((d) => (d.title || '').toLowerCase().includes(q));
  return list;
}

export function buildDownloadFilters(
  all: DownloadTask[],
  groups: DownloadGroups
): Array<{ id: DownloadFilter; labelKey: string; count: number }> {
  return [
    { id: 'all', labelKey: 'downloads.filterAll', count: all.length },
    { id: 'active', labelKey: 'downloads.filterActive', count: groups.active.length },
    { id: 'completed', labelKey: 'downloads.filterCompleted', count: groups.completed.length },
    { id: 'failed', labelKey: 'downloads.filterFailed', count: groups.failed.length }
  ];
}
