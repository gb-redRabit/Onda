import type { Ref } from 'vue';
import { useOnlineStore } from '@renderer/stores/online';
import { useSettingsStore } from '@renderer/stores/settings';
import type { OnlineConfigTarget } from '@renderer/utils/onlineConfigDialog';
import type { YouTubeResolvedItem, YouTubeVideo } from '@renderer/types/online';

// Resolved-list selection + queueing actions. `toastAdded` is injected from the
// view so the success notification format stays in one place.
export function useOnlineQueueing(
  configTarget: Ref<OnlineConfigTarget>,
  rangeStart: Ref<number>,
  rangeEnd: Ref<number>,
  toastAdded: () => void
) {
  const yt = useOnlineStore();
  const settings = useSettingsStore();

  function toggleSelect(id: string) {
    const next = new Set(yt.selectedResolved);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    yt.selectedResolved = next;
  }

  function toggleSelectAll() {
    if (!yt.resolved) return;
    const all = yt.resolved.items.map((i) => i.id);
    const allSelected = all.length > 0 && all.every((id) => yt.selectedResolved.has(id));
    yt.selectedResolved = allSelected ? new Set() : new Set(all);
  }

  // Selects a 1-based inclusive range of resolved items (e.g. 1-100, 101-200).
  function selectRange() {
    if (!yt.resolved) return;
    const total = yt.resolved.items.length;
    const start = Math.max(1, Math.min(total, Math.floor(Number(rangeStart.value) || 1)));
    const end = Math.max(start, Math.min(total, Math.floor(Number(rangeEnd.value) || total)));
    yt.selectedResolved = new Set(
      yt.resolved.items
        .slice(start - 1, end)
        .filter((i) => i.isPlayable !== false)
        .map((i) => i.id)
    );
  }

  function addSelectedToQueue() {
    if (!yt.resolved || yt.selectedResolved.size === 0) return;
    // Smart Mode: download immediately with defaults; otherwise open the dialog.
    if (settings.download.smartMode) {
      void yt.queueFromResolved([...yt.selectedResolved]);
      toastAdded();
    } else {
      configTarget.value = { mode: 'resolved' };
    }
  }

  function queueResolvedItem(item: YouTubeResolvedItem) {
    configTarget.value = { mode: 'single', video: item };
  }

  function queueChannelVideo(v: YouTubeVideo) {
    configTarget.value = { mode: 'single', video: v };
  }

  // Quick download (Smart Mode): queue with defaults without the dialog.
  function quickQueueResolved(item: YouTubeResolvedItem) {
    if (settings.download.smartMode) {
      void yt.queueVideo(item);
      toastAdded();
    } else {
      configTarget.value = { mode: 'single', video: item };
    }
  }

  function quickQueueVideo(v: YouTubeVideo) {
    if (settings.download.smartMode) {
      void yt.queueVideo(v);
      toastAdded();
    } else {
      configTarget.value = { mode: 'single', video: v };
    }
  }

  return {
    toggleSelect,
    toggleSelectAll,
    selectRange,
    addSelectedToQueue,
    queueResolvedItem,
    queueChannelVideo,
    quickQueueResolved,
    quickQueueVideo
  };
}
