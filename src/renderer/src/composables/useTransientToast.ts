import { ref, getCurrentInstance, onUnmounted } from 'vue';

// Transient view-level toast with a single timer (plan 6.3), extracted from
// SourcesView. The matching presentational component is `TransientToast.vue`.

export interface TransientToastState {
  msg: string;
  ok: boolean;
}

export function useTransientToast(durationMs = 3500) {
  const toast = ref<TransientToastState | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function dismiss(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    toast.value = null;
  }

  function showToast(msg: string, ok = true): void {
    toast.value = { msg, ok };
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      toast.value = null;
    }, durationMs);
  }

  if (getCurrentInstance()) onUnmounted(dismiss);

  return { toast, showToast, dismiss };
}
