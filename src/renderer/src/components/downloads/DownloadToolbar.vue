<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Download, Pause, Play, Trash2, Upload, X, Gauge, SlidersHorizontal } from '@lucide/vue';
import { useOnlineStore } from '@renderer/stores/online';
import { useSettingsStore } from '@renderer/stores/settings';
import { usePromptDialog } from '@renderer/composables/usePromptDialog';
import ExplorerPromptDialog from '@renderer/components/explorer/ExplorerPromptDialog.vue';
import Button from '@renderer/components/ui/Button.vue';
import Input from '@renderer/components/ui/Input.vue';
import PageHeader from '@renderer/components/ui/PageHeader.vue';
import Select from '@renderer/components/ui/Select.vue';

defineProps<{ activeCount: number; pausedCount: number; hasFinished: boolean }>();

const yt = useOnlineStore();
const settings = useSettingsStore();
const { t } = useI18n();
const prompt = usePromptDialog();

async function clearFinished(): Promise<void> {
  if (!(await prompt.showConfirm(t('downloads.clearFinishedConfirm')))) return;
  await yt.clearFinishedDownloads();
}

/** Limity w KB/s; 0 = bez limitu. Wartość jest stosowana przez yt-dlp (`--limit-rate`). */
const SPEED_OPTIONS = [0, 1024, 2048, 5120, 10240];

function setSpeedLimit(kb: number): void {
  settings.updateNetwork({ downloadSpeedLimit: kb });
}

const scheduleTime = ref('');
const scheduledAt = ref<number | null>(null);
const showOptions = ref(false);

async function applySchedule() {
  const m = scheduleTime.value.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return;
  const d = new Date();
  d.setHours(h, min, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  await yt.scheduleStart(d.getTime());
  scheduledAt.value = d.getTime();
}

async function clearSchedule() {
  await yt.scheduleStart(null);
  scheduledAt.value = null;
  scheduleTime.value = '';
}

onMounted(async () => {
  scheduledAt.value = await yt.getScheduledStart();
});
</script>

<template>
  <div class="border-b border-hairline/80 bg-base-100/(--glass-alpha) backdrop-blur">
    <PageHeader :title="t('downloads.title')" :icon="Download">
      <template #actions>
        <span
          v-if="activeCount"
          class="rounded-full bg-primary/12 px-2.5 py-0.5 text-xs font-medium text-primary-text"
          >{{ t('downloads.filterActive') }}: {{ activeCount }}</span
        >
        <Button v-if="activeCount" variant="outline" size="sm" @click="yt.pauseAll">
          <template #leading><Pause :size="13" /></template>
          {{ t('downloads.pauseAll') }}
        </Button>
        <Button v-if="pausedCount" variant="outline" size="sm" @click="yt.resumeAll">
          <template #leading><Play :size="13" /></template>
          {{ t('downloads.resumeAll') }}
        </Button>
        <Button
          v-if="hasFinished"
          variant="outline"
          size="sm"
          data-testid="downloads-clear-finished"
          @click="clearFinished"
        >
          <template #leading><Trash2 :size="13" /></template>
          {{ t('downloads.clearFinished') }}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          :pressed="showOptions || !!scheduledAt || settings.network.downloadSpeedLimit > 0"
          :label="t('downloads.speedLimit')"
          :aria-expanded="showOptions"
          @click="showOptions = !showOptions"
        >
          <SlidersHorizontal :size="14" />
        </Button>
      </template>
    </PageHeader>

    <div
      v-show="showOptions"
      class="flex flex-wrap items-center gap-2.5 border-t border-hairline/60 bg-base-200/35 px-5 py-2.5 text-xs"
    >
      <div class="flex items-center gap-1.5 text-xs text-base-content/70">
        <Gauge :size="13" class="text-base-content/50" />
        <Select
          :model-value="settings.network.downloadSpeedLimit"
          size="sm"
          class="h-7"
          :aria-label="t('downloads.speedLimit')"
          @update:model-value="setSpeedLimit(Number($event))"
        >
          <option v-for="kb in SPEED_OPTIONS" :key="kb" :value="kb">
            {{ kb === 0 ? t('settings.speedUnlimited') : `${kb / 1024} MB/s` }}
          </option>
        </Select>
      </div>

      <div class="h-4 w-px bg-base-300/80" />

      <div class="flex items-center gap-1.5">
        <Input
          v-model="scheduleTime"
          type="time"
          size="sm"
          class="h-7 w-28"
          :aria-label="t('downloads.scheduleStart')"
        />
        <Button
          variant="outline"
          size="sm"
          class="h-7"
          :disabled="!scheduleTime"
          @click="applySchedule"
        >
          {{ t('downloads.scheduleSet') }}
        </Button>
        <Button
          v-if="scheduledAt"
          variant="ghost"
          size="icon"
          :label="t('downloads.scheduleClear')"
          @click="clearSchedule"
        >
          <X :size="12" />
        </Button>
      </div>

      <div class="flex-1" />

      <Button variant="outline" size="sm" class="h-7" @click="yt.exportQueue">
        <template #leading><Upload :size="12" /></template>
        {{ t('downloads.exportQueue') }}
      </Button>
      <Button variant="outline" size="sm" class="h-7" @click="yt.importQueue">
        <template #leading><Download :size="12" /></template>
        {{ t('downloads.importQueue') }}
      </Button>
    </div>

    <ExplorerPromptDialog
      :visible="prompt.promptVisible.value"
      :is-confirm="prompt.promptIsConfirm.value"
      :message="prompt.promptMessage.value"
      :value="prompt.promptValue.value"
      @update:value="prompt.promptValue.value = $event"
      @confirm="prompt.promptConfirm"
      @cancel="prompt.promptCancel"
    />
  </div>
</template>
