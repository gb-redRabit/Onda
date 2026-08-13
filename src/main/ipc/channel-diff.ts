export interface ChannelVideoRef {
  id: string;
}

export interface ChannelDiffInput<T extends ChannelVideoRef = ChannelVideoRef> {
  // Channel videos, newest first (as returned by yt-dlp `--flat-playlist`).
  items: T[];
  downloadedVideoIds: string[];
  queuedVideoIds: string[];
  baselineVideoId?: string;
}

export interface ChannelDiffResult<T extends ChannelVideoRef = ChannelVideoRef> {
  // Videos newer than the baseline (or all videos when there is no baseline)
  // that are neither downloaded nor queued.
  newArrivals: T[];
  // Count of videos not yet downloaded (regardless of queued/baseline state).
  remainingCount: number;
  // True when the baseline video was found in the scanned list — lets a paginated
  // scanner stop early once the baseline is reached.
  reachedBaseline: boolean;
}

// Separates a channel's videos into "new", "not downloaded" and "downloaded"
// using the subscription's persisted state. Uploads are newest-first, so "new"
// means every video that appears BEFORE the baseline in the list.
export function computeChannelDiff<T extends ChannelVideoRef>(
  input: ChannelDiffInput<T>
): ChannelDiffResult<T> {
  const known = new Set(input.downloadedVideoIds);
  const queued = new Set(input.queuedVideoIds);
  const baselineIndex = input.baselineVideoId
    ? input.items.findIndex((i) => i.id === input.baselineVideoId)
    : -1;
  const newArrivals = input.items.filter(
    (item, idx) =>
      !known.has(item.id) &&
      !queued.has(item.id) &&
      (baselineIndex === -1 || idx < baselineIndex)
  );
  const remainingCount = input.items.filter((item) => !known.has(item.id)).length;
  return { newArrivals, remainingCount, reachedBaseline: baselineIndex !== -1 };
}
