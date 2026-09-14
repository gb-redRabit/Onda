import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useOnlineStore } from '@renderer/stores/online';
import { useDownloadProfiles } from '@renderer/composables/useDownloadProfiles';
import { parseBatchInputAll } from '@shared/platform';
import { countSkippedBatchLines } from '@renderer/utils/onlineView';
import { pickTextFile, batchResultMessage } from '@renderer/utils/onlineBatch';

// Batch download panel: pasted/imported links, parsed entries, profile choice
// and submission.
export function useOnlineBatch() {
  const yt = useOnlineStore();
  const { profiles } = useDownloadProfiles();
  const { t } = useI18n();

  const batchOpen = ref(false);
  const batchText = ref('');
  const batchBusy = ref(false);
  const batchResult = ref('');
  const batchProfileId = ref('');

  const batchEntries = computed(() => parseBatchInputAll(batchText.value));

  // Lines that were dropped by the parser (channels, prefixes, junk).
  const batchSkippedCount = computed(() =>
    countSkippedBatchLines(batchText.value, batchEntries.value.length)
  );

  // SoundCloud links ignore download profiles — hide the selector for them.
  const batchHasSc = computed(() => batchEntries.value.some((e) => e.platform === 'soundcloud'));

  async function submitBatch() {
    const entries = batchEntries.value;
    if (!entries.length) return;
    batchBusy.value = true;
    batchResult.value = '';
    try {
      const profile = profiles.value.find((p) => p.id === batchProfileId.value);
      const queued = await yt.queueBatch(
        entries.map((e) => e.url),
        profile?.config
      );
      batchResult.value = batchResultMessage(t, queued, batchSkippedCount.value);
      if (queued > 0) batchText.value = '';
    } catch {
      batchResult.value = t('youtube.batchError');
    } finally {
      batchBusy.value = false;
    }
  }

  async function importBatchFile() {
    const content = await pickTextFile(t);
    if (content) batchText.value = content;
  }

  return {
    batchOpen,
    batchText,
    batchBusy,
    batchResult,
    batchProfileId,
    batchEntries,
    batchSkippedCount,
    batchHasSc,
    submitBatch,
    importBatchFile
  };
}
