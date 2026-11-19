import { computed, ref, shallowRef, triggerRef } from 'vue';
import type { MediaFile } from '@renderer/types/media';

export function usePlayerQueue(enrich: (track: MediaFile) => void) {
  // Płytka reaktywność: elementy MediaFile nie są proxowane (duże kolejki
  // „Odtwórz wszystko”), a każdą mutację tablicy jawnie sygnalizujemy `triggerRef`.
  const queue = shallowRef<MediaFile[]>([]);
  const pendingQueue = shallowRef<MediaFile[]>([]);
  const queueVisible = ref(false);

  const queueLength = computed(() => queue.value.length + pendingQueue.value.length);
  const displayQueue = computed(() => [...pendingQueue.value, ...queue.value]);

  function addToQueue(track: MediaFile) {
    queue.value.push(track);
    triggerRef(queue);
    enrich(track);
  }
  function addToQueueMultiple(tracks: MediaFile[]) {
    queue.value.push(...tracks);
    triggerRef(queue);
    tracks.forEach(enrich);
  }
  function removeFromQueue(index: number) {
    if (index < pendingQueue.value.length) {
      pendingQueue.value.splice(index, 1);
      triggerRef(pendingQueue);
    } else {
      queue.value.splice(index - pendingQueue.value.length, 1);
      triggerRef(queue);
    }
  }
  function clearQueue() {
    queue.value = [];
    pendingQueue.value = [];
  }
  function enrichPendingQueue() {
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
    // Docelowy dział ustalamy po liczbie pending PRZED usunięciem: ruch w dół
    // w obrębie pending musi tam zostać, a nie przeskoczyć do queue.
    const toInPending = to < pendingLen;
    const destArr = toInPending ? pendingQueue.value : queue.value;
    const destIdx = toInPending ? to : to - newPendingLen;
    destArr.splice(destIdx, 0, item);
    triggerRef(fromInPending ? pendingQueue : queue);
    if (toInPending !== fromInPending) triggerRef(toInPending ? pendingQueue : queue);
  }
  function insertInQueue(index: number, track: MediaFile) {
    queue.value.splice(index, 0, track);
    triggerRef(queue);
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
    enrichPendingQueue,
    reorderQueue,
    insertInQueue,
    toggleQueue
  };
}
