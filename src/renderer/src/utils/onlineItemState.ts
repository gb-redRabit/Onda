import type { DownloadTask } from '@renderer/types/online';

export type OnlineItemDownloadState = 'queuing' | 'downloading' | 'done' | null;

export function resolveDownloadState(
  videoId: string,
  queuingId: string | null,
  status: DownloadTask['status'] | null | undefined,
  coverStatus: string | null | undefined
): OnlineItemDownloadState {
  if (queuingId === videoId) return 'queuing';
  if (status === 'downloading' || status === 'pending' || status === 'paused') {
    return 'downloading';
  }
  if (status === 'completed' && coverStatus === 'fetching') {
    return 'downloading';
  }
  if (status === 'completed') return 'done';
  return null;
}
