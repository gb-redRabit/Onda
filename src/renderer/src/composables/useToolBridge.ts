import { onMounted, onUnmounted, ref } from 'vue';
import type { ToolWindowContext } from '@shared/types/tools';

function isToolWindowContext(value: unknown): value is ToolWindowContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as { toolId?: unknown; params?: unknown };
  return (
    typeof candidate.toolId === 'string' &&
    !!candidate.params &&
    typeof candidate.params === 'object' &&
    !Array.isArray(candidate.params)
  );
}

export function useToolBridge() {
  const context = ref<ToolWindowContext | null>(null);
  let offContext: (() => void) | null = null;

  onMounted(async () => {
    // Nasłuch przed pierwszym `getContext`, żeby nie zgubić pushu z main,
    // gdy narzędzie jest już otwarte i użytkownik wybiera nowe pliki.
    offContext = window.api.on('tools:context', (payload: unknown) => {
      if (isToolWindowContext(payload)) context.value = payload;
    });
    try {
      const initial = (await window.api.invoke('tools:getContext')) as ToolWindowContext | null;
      if (isToolWindowContext(initial) && !context.value) context.value = initial;
    } catch {
      if (!context.value) context.value = null;
    }
  });

  onUnmounted(() => {
    offContext?.();
    offContext = null;
  });

  async function sendToMain(type: string, payload?: unknown): Promise<boolean> {
    try {
      return await window.api.invoke('tools:sendToMain', { type, payload });
    } catch {
      return false;
    }
  }

  return { context, sendToMain };
}
