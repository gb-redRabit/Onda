<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Download, Pause, Play, Trash2, Upload, X, Gauge, SlidersHorizontal } from '@lucide/vue';
import { useOnlineStore } from '@renderer/stores/online';
import { useSettingsStore } from '@renderer/stores/settings';
import { usePromptDialog } from '@renderer/composables/usePromptDialog';
import ExplorerPromptDialog from '@renderer/components/explorer/ExplorerPromptDialog.vue';

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
  <div class="border-b border-base-300/80 bg-base-100/(--glass-alpha) backdrop-blur">
    <div class="ui-page-header flex flex-wrap items-center gap-3 px-5 py-3.5">
      <div
        class="grid h-8 w-8 shrink-0 place-items-center rounded-field bg-primary/10 text-primary-text"
      >
        <Download :size="17" />
      </div>
      <h1 class="shrink-0 text-base font-semibold tracking-tight text-base-content">
        {{ t('downloads.title') }}
      </h1>
      <span
        v-if="activeCount"
        class="rounded-full bg-primary/12 px-2.5 py-0.5 text-xs font-medium text-primary-text"
        >{{ activeCount }} {{ t('status.active') }}</span
      >
      <div class="flex-1" />
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-if="activeCount"
          type="button"
          class="fx-noise flex h-8 items-center gap-1.5 rounded-field border border-base-300 bg-base-100 px-3 text-xs font-medium text-base-content/75 hover:bg-base-content/8 hover:text-base-content transition-colors"
          :title="t('downloads.pauseAll')"
          @click="yt.pauseAll"
        >
          <Pause :size="13" />
          {{ t('downloads.pauseAll') }}
        </button>
        <button
          v-if="pausedCount"
          type="button"
          class="fx-noise flex h-8 items-center gap-1.5 rounded-field border border-base-300 bg-base-100 px-3 text-xs font-medium text-base-content/75 hover:bg-base-content/8 hover:text-base-content transition-colors"
          :title="t('downloads.resumeAll')"
          @click="yt.resumeAll"
        >
          <Play :size="13" />
          {{ t('downloads.resumeAll') }}
        </button>
        <button
          v-if="hasFinished"
          type="button"
          data-testid="downloads-clear-finished"
          class="fx-noise flex h-8 items-center gap-1.5 rounded-field border border-base-300 bg-base-100 px-3 text-xs font-medium text-base-content/75 hover:bg-base-content/8 hover:text-base-content transition-colors"
          @click="clearFinished"
        >
          <Trash2 :size="13" />
          {{ t('downloads.clearFinished') }}
        </button>
        <button
          type="button"
          class="fx-noise flex h-8 w-8 items-center justify-center rounded-field border transition-colors"
          :class="
            showOptions || scheduledAt || settings.network.downloadSpeedLimit > 0
              ? 'border-primary/40 bg-primary/14 text-primary-text'
              : 'border-base-300 bg-base-100 text-base-content/65 hover:bg-base-content/8 hover:text-base-content'
          "
          :title="t('downloads.speedLimit')"
          :aria-label="t('downloads.speedLimit')"
          :aria-expanded="showOptions"
          @click="showOptions = !showOptions"
        >
          <SlidersHorizontal :size="14" />
        </button>
      </div>
    </div>

    <div
      v-show="showOptions"
      class="flex flex-wrap items-center gap-2.5 border-t border-base-300/60 bg-base-200/35 px-5 py-2.5 text-xs"
    >
      <div class="flex items-center gap-1.5 text-xs text-base-content/70">
        <Gauge :size="13" class="text-base-content/50" />
        <select
          :value="settings.network.downloadSpeedLimit"
          class="h-7 rounded-field border border-base-300 bg-base-100 px-2 text-xs focus:border-primary focus:outline-none"
          :title="t('downloads.speedLimit')"
          :aria-label="t('downloads.speedLimit')"
          @change="setSpeedLimit(Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="kb in SPEED_OPTIONS" :key="kb" :value="kb">
            {{ kb === 0 ? t('settings.speedUnlimited') : `${kb / 1024} MB/s` }}
          </option>
        </select>
      </div>

      <div class="h-4 w-px bg-base-300/80" />

      <div class="flex items-center gap-1.5">
        <input
          v-model="scheduleTime"
          type="time"
          class="h-7 rounded-field border border-base-300 bg-base-100 px-2 text-xs focus:border-primary focus:outline-none"
          :title="t('downloads.scheduleStart')"
          :aria-label="t('downloads.scheduleStart')"
        />
        <button
          type="button"
          class="fx-noise h-7 rounded-field border border-base-300 bg-base-100 px-2.5 text-xs text-base-content/75 hover:bg-base-content/8 hover:text-base-content transition-colors disabled:opacity-40"
          :disabled="!scheduleTime"
          @click="applySchedule"
        >
          {{ t('downloads.scheduleSet') }}
        </button>
        <button
          v-if="scheduledAt"
          type="button"
          class="fx-noise flex h-7 w-7 items-center justify-center rounded-field border border-base-300 bg-base-100 text-xs text-base-content/70 hover:bg-base-content/8 transition-colors"
          :title="t('downloads.scheduleClear')"
          :aria-label="t('downloads.scheduleClear')"
          @click="clearSchedule"
        >
          <X :size="12" />
        </button>
      </div>

      <div class="flex-1" />

      <button
        type="button"
        class="fx-noise flex h-7 items-center gap-1.5 rounded-field border border-base-300 bg-base-100 px-2.5 text-xs text-base-content/75 hover:bg-base-content/8 hover:text-base-content transition-colors"
        :title="t('downloads.exportQueue')"
        @click="yt.exportQueue"
      >
        <Upload :size="12" />
        {{ t('downloads.exportQueue') }}
      </button>
      <button
        type="button"
        class="fx-noise flex h-7 items-center gap-1.5 rounded-field border border-base-300 bg-base-100 px-2.5 text-xs text-base-content/75 hover:bg-base-content/8 hover:text-base-content transition-colors"
        :title="t('downloads.importQueue')"
        @click="yt.importQueue"
      >
        <Download :size="12" />
        {{ t('downloads.importQueue') }}
      </button>
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
