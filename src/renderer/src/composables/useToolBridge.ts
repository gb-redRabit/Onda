import { onMounted, ref } from 'vue';
import type { ToolWindowContext } from '@shared/types/tools';

export function useToolBridge() {
  const context = ref<ToolWindowContext | null>(null);

  onMounted(async () => {
    try {
      context.value = (await window.api.invoke('tools:getContext')) as ToolWindowContext | null;
    } catch {
      context.value = null;
    }
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
