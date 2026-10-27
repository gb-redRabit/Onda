import { onBeforeUnmount, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUIStore } from '@renderer/stores/ui';
import type { ToolMessage } from '@shared/types/tools';

function payloadName(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object' || !('name' in payload)) return undefined;
  return typeof payload.name === 'string' ? payload.name : undefined;
}

export function useToolMessages(): void {
  const ui = useUIStore();
  const { t } = useI18n();
  let off: (() => void) | null = null;

  onMounted(() => {
    off =
      window.api?.on('tools:message', (payload: unknown) => {
        const message = payload as ToolMessage;
        if (message.type === 'conversion-complete') {
          ui.notify(
            'success',
            t('tools.conversionComplete'),
            payloadName(message.payload) ?? undefined
          );
        } else if (message.type === 'clip-complete') {
          ui.notify('success', t('tools.clipComplete'), payloadName(message.payload) ?? undefined);
        } else if (message.type === 'concat-complete') {
          ui.notify(
            'success',
            t('tools.concatComplete'),
            payloadName(message.payload) ?? undefined
          );
        }
      }) ?? null;
  });

  onBeforeUnmount(() => {
    off?.();
    off = null;
  });
}
