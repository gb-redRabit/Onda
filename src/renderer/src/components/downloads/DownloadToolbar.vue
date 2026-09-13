<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Download, Pause, Play, Trash2, Upload, X } from '@lucide/vue';
import { useOnlineStore } from '@renderer/stores/online';

defineProps<{ activeCount: number; pausedCount: number; hasFinished: boolean }>();

const yt = useOnlineStore();
const { t } = useI18n();

const scheduleTime = ref('');
const scheduledAt = ref<number | null>(null);

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
  <div class="p-4 border-b border-base-300 flex items-center gap-3">
    <Download :size="24" class="text-primary" />
    <h1 class="text-xl font-bold">{{ t('downloads.title') }}</h1>
    <span
      v-if="activeCount"
      class="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium"
      >{{ activeCount }} {{ t('status.active') }}</span
    >
    <div class="flex-1" />
    <button
      v-if="activeCount"
      class="fx-noise flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field border border-base-300 text-xs text-base-content/70 hover:bg-base-content/10 transition-colors"
      :title="t('downloads.pauseAll')"
      @click="yt.pauseAll"
    >
      <Pause :size="12" />
      {{ t('downloads.pauseAll') }}
    </button>
    <button
      v-if="pausedCount"
      class="fx-noise flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field border border-base-300 text-xs text-base-content/70 hover:bg-base-content/10 transition-colors"
      :title="t('downloads.resumeAll')"
      @click="yt.resumeAll"
    >
      <Play :size="12" />
      {{ t('downloads.resumeAll') }}
    </button>
    <button
      class="fx-noise flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field border border-base-300 text-xs text-base-content/70 hover:bg-base-content/10 transition-colors"
      :title="t('downloads.exportQueue')"
      @click="yt.exportQueue"
    >
      <Upload :size="12" />
      {{ t('downloads.exportQueue') }}
    </button>
    <button
      class="fx-noise flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field border border-base-300 text-xs text-base-content/70 hover:bg-base-content/10 transition-colors"
      :title="t('downloads.importQueue')"
      @click="yt.importQueue"
    >
      <Download :size="12" />
      {{ t('downloads.importQueue') }}
    </button>
    <div class="flex items-center gap-1">
      <input
        v-model="scheduleTime"
        type="time"
        class="px-2 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-xs focus:border-primary focus:outline-none"
        :title="t('downloads.scheduleStart')"
      />
      <button
        class="fx-noise px-2 py-1.5 fx-depth rounded-field border border-base-300 text-xs text-base-content/70 hover:bg-base-content/10 transition-colors"
        :disabled="!scheduleTime"
        @click="applySchedule"
      >
        {{ t('downloads.scheduleSet') }}
      </button>
      <button
        v-if="scheduledAt"
        class="fx-noise px-2 py-1.5 fx-depth rounded-field border border-base-300 text-xs text-base-content/70 hover:bg-base-content/10 transition-colors"
        :title="t('downloads.scheduleClear')"
        @click="clearSchedule"
      >
        <X :size="12" />
      </button>
    </div>
    <button
      v-if="hasFinished"
      class="fx-noise flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field border border-base-300 text-xs text-base-content/70 hover:bg-base-content/10 transition-colors"
      @click="yt.clearFinishedDownloads"
    >
      <Trash2 :size="12" />
      {{ t('downloads.clearFinished') }}
    </button>
  </div>
</template>
