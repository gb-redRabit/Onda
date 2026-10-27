import { ref } from 'vue';
import { logger } from '@shared/logger';
import type { LoudnessAnalysisResult, LoudnessProgress } from '@shared/types/ipc/channels-library';

// Analiza żyje poza komponentem: użytkownik może opuścić Ustawienia, a job w main
// nadal działa. Wspólny stan pozwala wrócić i zobaczyć aktualny postęp.
const running = ref(false);
const current = ref(0);
const total = ref(0);
const error = ref<string | null>(null);
const result = ref<LoudnessAnalysisResult | null>(null);
let subscribed = false;

function subscribe(): void {
  if (subscribed) return;
  subscribed = true;
  window.api?.on('library:loudness:progress', (...args: unknown[]) => {
    const progress = args[0] as LoudnessProgress | undefined;
    if (!progress) return;
    if (typeof progress.current === 'number') current.value = progress.current;
    if (typeof progress.total === 'number') total.value = progress.total;
  });
}

export function useLoudnessAnalysis() {
  subscribe();

  async function analyze(): Promise<void> {
    if (running.value) return;
    running.value = true;
    current.value = 0;
    total.value = 0;
    error.value = null;
    result.value = null;
    try {
      const res = await window.api?.invoke('library:analyzeLoudness');
      result.value = res ?? null;
      if (res?.error) error.value = res.error;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      logger.warn('library', 'loudness analysis invoke failed', e);
    } finally {
      running.value = false;
    }
  }

  async function cancel(): Promise<void> {
    await window.api?.invoke('library:loudnessCancel');
  }

  return { running, current, total, error, result, analyze, cancel };
}
