<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{ isSc: boolean; kind: 'audio' | 'video' }>();
const coverType = defineModel<'thumbnail' | 'none' | 'frame' | 'clip' | 'custom'>('coverType', {
  required: true
});
const coverFrameTime = defineModel<number>('coverFrameTime', { required: true });
const coverClipStart = defineModel<number>('coverClipStart', { required: true });
const coverClipEnd = defineModel<number>('coverClipEnd', { required: true });
const coverClipFormat = defineModel<'webm' | 'mp4'>('coverClipFormat', { required: true });
const customCoverPath = defineModel<string>('customCoverPath', { required: true });

async function pickCustomCover() {
  const res = (await window.api?.openImageDialog()) as
    { canceled?: boolean; filePaths?: string[] } | undefined;
  if (res && !res.canceled && res.filePaths && res.filePaths.length > 0) {
    customCoverPath.value = res.filePaths[0];
  }
}

const { t } = useI18n();
</script>

<template>
  <section v-if="!isSc && kind !== 'video'">
    <p class="text-xs text-base-content/50 font-medium uppercase tracking-wider mb-2">
      {{ t('youtube.coverSection') }}
    </p>
    <div class="flex gap-1 bg-base-200/[var(--glass-alpha)] rounded-box p-1 w-fit flex-wrap">
      <button
        v-for="c in ['thumbnail', 'none', 'frame', 'clip', 'custom'] as const"
        :key="c"
        class="fx-noise px-3 py-1.5 fx-depth rounded-field text-xs font-medium transition-colors"
        :class="
          coverType === c
            ? 'bg-primary text-primary-content'
            : 'text-base-content/70 hover:text-base-content'
        "
        @click="coverType = c"
      >
        {{ t('settings.cover.' + c) }}
      </button>
    </div>
    <div v-if="coverType === 'frame'" class="mt-2 grid grid-cols-1 gap-2">
      <label class="block text-xs text-base-content/50">
        {{ t('youtube.frameTimeLabel') }}
        <input
          v-model.number="coverFrameTime"
          type="number"
          min="0"
          class="mt-1 w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
        />
      </label>
    </div>
    <div v-else-if="coverType === 'clip'" class="mt-2 grid grid-cols-3 gap-2">
      <label class="block text-xs text-base-content/50">
        {{ t('youtube.clipStartLabel') }}
        <input
          v-model.number="coverClipStart"
          type="number"
          min="0"
          class="mt-1 w-full px-2 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
        />
      </label>
      <label class="block text-xs text-base-content/50">
        {{ t('youtube.clipEndLabel') }}
        <input
          v-model.number="coverClipEnd"
          type="number"
          min="1"
          class="mt-1 w-full px-2 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
        />
      </label>
      <label class="block text-xs text-base-content/50">
        {{ t('youtube.clipFormatLabel') }}
        <select
          v-model="coverClipFormat"
          class="mt-1 w-full px-2 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
        >
          <option value="webm">.webm</option>
          <option value="mp4">.mp4</option>
        </select>
      </label>
    </div>
    <div v-else-if="coverType === 'custom'" class="mt-2 flex items-center gap-2">
      <button
        type="button"
        class="fx-noise px-3 py-2 fx-depth rounded-field border border-base-300 text-xs text-base-content/70 hover:bg-base-content/10 transition-colors"
        @click="pickCustomCover"
      >
        {{ t('youtube.pickCoverFile') }}
      </button>
      <span class="text-xs text-base-content/50 truncate flex-1">
        {{ customCoverPath || t('youtube.coverCustomHint') }}
      </span>
    </div>
  </section>
</template>
