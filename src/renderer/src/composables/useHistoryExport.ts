import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  HistoryExportFormat,
  HistoryExportMediaType,
  HistoryExportResult,
  HistoryExportSort
} from '@shared/types/tools';
import type { ToolStatus } from '@renderer/components/tools/ToolWindowShell.vue';

/** Stan eksportu historii odtwarzania: formularz, uruchomienie i wynik. */
export function useHistoryExport() {
  const { t } = useI18n();
  const format = ref<HistoryExportFormat>('csv');
  const type = ref<HistoryExportMediaType>('all');
  const sort = ref<HistoryExportSort>('lastPlayed');
  const onlyPlayed = ref(true);
  const outputPath = ref('');
  const busy = ref(false);
  const errorMsg = ref('');
  const result = ref<HistoryExportResult | null>(null);

  const status = computed<ToolStatus | null>(() => {
    if (busy.value) return { tone: 'busy', text: t('tools.historyExportRunning') };
    if (errorMsg.value) return { tone: 'error', text: errorMsg.value };
    return null;
  });

  function extensionFor(value: HistoryExportFormat): string {
    return value === 'json' ? 'json' : 'csv';
  }

  async function pickFolder(): Promise<void> {
    const paths = (await window.api.invoke('dialog:openFolder')) as string[];
    if (paths.length > 0) {
      outputPath.value = `${paths[0].replace(/\\/g, '/')}/onda-history.${extensionFor(format.value)}`;
    }
  }

  async function run(): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    errorMsg.value = '';
    result.value = null;
    try {
      const res = await window.api.exportHistory({
        format: format.value,
        type: type.value,
        sort: sort.value,
        onlyPlayed: onlyPlayed.value,
        outputPath: outputPath.value.trim() || undefined
      });
      if (res.canceled) return;
      if (!res.success) {
        errorMsg.value = res.error || t('tools.historyExportError');
        return;
      }
      result.value = res;
    } catch (error) {
      errorMsg.value = error instanceof Error ? error.message : String(error);
    } finally {
      busy.value = false;
    }
  }

  function openOutput(): void {
    if (result.value?.path) void window.api.invoke('shell:showItemInFolder', result.value.path);
  }

  watch(format, (value) => {
    outputPath.value = outputPath.value.replace(/\.(csv|json)$/i, `.${extensionFor(value)}`);
  });

  return {
    format,
    type,
    sort,
    onlyPlayed,
    outputPath,
    busy,
    errorMsg,
    result,
    status,
    pickFolder,
    run,
    openOutput
  };
}
