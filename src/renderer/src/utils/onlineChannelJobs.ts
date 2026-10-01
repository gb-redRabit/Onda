import type { SubscriptionDownloadPrefs, YouTubeVideo } from '@renderer/types/online';
import type { IpcDownloadJobInput } from '@shared/types/ipc';
import { buildJob } from '@renderer/utils/onlineJob';

// Buduje zadania pobierania dla płaskiej listy kanału, pomijając id już zakolejkowane
// lub już pobrane. Płaskie listy nie niosą channel_id per wpis, więc każde
// zadanie jest przypisane do kanału, który jest pobierany. `existingIds` jest mutowane,
// więc duplikaty id w tej samej liście też są pomijane.
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
