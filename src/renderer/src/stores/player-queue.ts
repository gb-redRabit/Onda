import { ref, computed } from 'vue';
import type { MediaFile } from '@renderer/types/media';

export function usePlayerQueue(enrich: (track: MediaFile) => void) {
  const queue = ref<MediaFile[]>([]);
  const pendingQueue = ref<MediaFile[]>([]);
  const queueVisible = ref(false);

  const queueLength = computed(() => queue.value.length + pendingQueue.value.length);
  const displayQueue = computed(() => [...pendingQueue.value, ...queue.value]);

  function addToQueue(track: MediaFile) {
    queue.value.push(track);
    enrich(track);
  }
  function addToQueueMultiple(tracks: MediaFile[]) {
    queue.value.push(...tracks);
    tracks.forEach(enrich);
  }
  function removeFromQueue(index: number) {
    if (index < pendingQueue.value.length) {
      pendingQueue.value.splice(index, 1);
    } else {
      queue.value.splice(index - pendingQueue.value.length, 1);
    }
  }
  function clearQueue() {
    queue.value = [];
    pendingQueue.value = [];
  }
  function flushPendingQueue() {
    if (pendingQueue.value.length) {
      pendingQueue.value.forEach(enrich);
    }
  }
  function reorderQueue(from: number, to: number) {
    const items = displayQueue.value;
    if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return;
    const item = items[from];
    const pendingLen = pendingQueue.value.length;
    const fromInPending = from < pendingLen;
    const sourceArr = fromInPending ? pendingQueue.value : queue.value;
    const sourceIdx = fromInPending ? from : from - pendingLen;
    sourceArr.splice(sourceIdx, 1);
    const newPendingLen = pendingQueue.value.length;
    const adjustedTo = from < to ? to - 1 : to;
    const toInPending = adjustedTo < newPendingLen;
    const destArr = toInPending ? pendingQueue.value : queue.value;
    const destIdx = toInPending ? adjustedTo : adjustedTo - newPendingLen;
    destArr.splice(destIdx, 0, item);
  }
  function insertInQueue(index: number, track: MediaFile) {
    queue.value.splice(index, 0, track);
    enrich(track);
  }
  function toggleQueue() {
    queueVisible.value = !queueVisible.value;
  }

  return {
    queue,
    pendingQueue,
    queueVisible,
    queueLength,
    displayQueue,
    addToQueue,
    addToQueueMultiple,
    removeFromQueue,
    clearQueue,
    flushPendingQueue,
    reorderQueue,
    insertInQueue,
    toggleQueue
  };
}
