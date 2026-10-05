import { ref, onScopeDispose } from 'vue';
import type { MusicbrainzRelease } from '@shared/types/ipc';
import type { MediaFile } from '@renderer/types/media';

export interface MusicbrainzBatchResult {
  path: string;
  name: string;
  status: 'pending' | 'ok' | 'error';
  msg?: string;
}

export interface MusicbrainzIncludeFields {
  title: boolean;
  artist: boolean;
  album: boolean;
  year: boolean;
  genre: boolean;
  track: boolean;
  cover: boolean;
}

interface BatchRelease extends MusicbrainzRelease {
  _coverData?: number[];
}

export function useMusicBrainzBatch(
  getRelease: () => BatchRelease | null,
  getFields: () => MusicbrainzIncludeFields,
  getTracks: () => MediaFile[] | undefined
) {
  const batchProgress = ref(0);
  const batchResults = ref<MusicbrainzBatchResult[]>([]);
  const batchRunning = ref(false);
  const batchCancelled = ref(false);
  // Timer kroku batcha. Bez anulowania przy rozłączeniu zakresu rekurencyjny
  // `setTimeout` dalej pisał pliki po odmontowaniu widoku.
  let stepTimer: ReturnType<typeof setTimeout> | null = null;

  function clearStepTimer(): void {
    if (stepTimer) {
      clearTimeout(stepTimer);
      stepTimer = null;
    }
  }

  onScopeDispose(() => {
    batchCancelled.value = true;
    batchRunning.value = false;
    clearStepTimer();
  });

  function startBatch() {
    const rel = getRelease();
    const list = getTracks();
    if (!rel || !list || list.length === 0) return;
    const fields = getFields();
    batchRunning.value = true;
    batchCancelled.value = false;
    batchProgress.value = 0;
    batchResults.value = list.map((t) => ({
      path: t.path,
      name: t.name,
      status: 'pending' as const
    }));
    clearStepTimer();
    let idx = 0;
    const next = async () => {
      if (batchCancelled.value || idx >= list.length) {
        batchRunning.value = false;
        clearStepTimer();
        return;
      }
      const tr = list[idx];
      const mbTrack = rel.media?.[0]?.tracks?.[idx] || rel.media?.[0]?.tracks?.[0];
      try {
        const payload: Record<string, unknown> = {};
        if (fields.album) payload.album = rel.title;
        if (fields.artist)
          payload.artist =
            rel['artist-credit']?.[0]?.name || rel['artist-credit']?.[0]?.artist?.name;
        if (fields.year && rel.date) payload.year = rel.date.slice(0, 4);
        if (fields.title && mbTrack?.title) payload.title = mbTrack.title;
        if (fields.track) payload.track = String(idx + 1);
        // zapisz tagi
        const tagRes = await window.api?.writeTags(tr.path, payload as Record<string, string>);
        if (tagRes && tagRes.success === false) {
          throw new Error(tagRes.error || 'writeTags failed');
        }
        if (fields.cover && rel._coverData) {
          await window.api?.writeCover(tr.path, rel._coverData);
        }
        batchResults.value[idx] = { ...batchResults.value[idx], status: 'ok' };
      } catch (e) {
        batchResults.value[idx] = {
          ...batchResults.value[idx],
          status: 'error',
          msg: String(e).slice(0, 80)
        };
      }
      batchProgress.value = idx + 1;
      idx++;
      // Sprawdź anulowanie PO zapisie (np. rozłączenie zakresu w trakcie żądania),
      // żeby nie zakolejkować kolejnego kroku.
      if (batchCancelled.value) {
        batchRunning.value = false;
        return;
      }
      clearStepTimer();
      stepTimer = setTimeout(next, 1100); // throttle 1 req/s
    };
    void next();
  }

  function cancelBatch() {
    batchCancelled.value = true;
    batchRunning.value = false;
    clearStepTimer();
  }

  return { batchProgress, batchResults, batchRunning, batchCancelled, startBatch, cancelBatch };
}
