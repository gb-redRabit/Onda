import type { SubscriptionDownloadPrefs, YouTubeVideo } from '@renderer/types/online';
import type { IpcDownloadJobInput } from '@shared/types/ipc';
import { buildJob } from '@renderer/utils/onlineJob';

// Builds download jobs for a flat channel listing, skipping ids already queued
// or already downloaded. Flat listings carry no channel_id per entry, so each
// job is attributed to the channel being downloaded. `existingIds` is mutated
// so duplicate ids within the same listing are skipped too.
export function buildChannelJobs(
  items: YouTubeVideo[],
  channelId: string,
  channelTitle: string | undefined,
  prefs: SubscriptionDownloadPrefs | undefined,
  existingIds: Set<string | undefined>,
  downloadedIds: Set<string>
): IpcDownloadJobInput[] {
  const jobs: IpcDownloadJobInput[] = [];
  for (const item of items) {
    if (!item.id || existingIds.has(item.id) || downloadedIds.has(item.id)) continue;
    const job = buildJob(item, prefs);
    if (!job.channelId) job.channelId = channelId;
    if (!job.channelTitle && channelTitle) job.channelTitle = channelTitle;
    jobs.push(job);
    existingIds.add(item.id);
  }
  return jobs;
}
