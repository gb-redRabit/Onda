<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ImagePlus } from '@lucide/vue';
import { DOWNLOAD_COVER_TYPES as coverTypes } from '@renderer/utils/downloadConfigMeta';

defineProps<{ isSc: boolean; kind: 'audio' | 'video' }>();
const coverType = defineModel<'thumbnail' | 'custom' | 'frame' | 'clip' | 'none'>('coverType', {
  required: true
});
const customPath = defineModel<string>('customPath', { required: true });
const frameTime = defineModel<number>('frameTime', { required: true });
const clipStart = defineModel<number>('clipStart', { required: true });
const clipEnd = defineModel<number>('clipEnd', { required: true });
const clipFormat = defineModel<'webm' | 'mp4'>('clipFormat', { required: true });

async function pickCustomCover() {
  const res = (await window.api?.openImageDialog()) as
    { canceled?: boolean; filePaths?: string[] } | undefined;
  if (res && !res.canceled && res.filePaths && res.filePaths.length > 0) {
    customPath.value = res.filePaths[0];
  }
}

const { t } = useI18n();
</script>

<template>
  <!-- Cover (video: thumbnail/none) -->
  <section v-if="!isSc && kind === 'video'">
    <p class="text-xs text-base-content/50 font-medium uppercase tracking-wider mb-2">
      {{ t('youtube.coverSection') }}
    </p>
    <div class="flex gap-1 bg-base-200/[var(--glass-alpha)] rounded-box p-1 w-fit">
      <button
        class="fx-noise px-4 py-1.5 fx-depth rounded-field text-xs font-medium transition-colors"
        :class="
          coverType !== 'none'
            ? 'bg-primary text-primary-content'
            : 'text-base-content/70 hover:text-base-content'
        "
        @click="coverType = 'thumbnail'"
      >
        {{ t('youtube.coverThumbnail') }}
      </button>
      <button
        class="fx-noise px-4 py-1.5 fx-depth rounded-field text-xs font-medium transition-colors"
        :class="
          coverType === 'none'
            ? 'bg-primary text-primary-content'
            : 'text-base-content/70 hover:text-base-content'
        "
        @click="coverType = 'none'"
      >
        {{ t('youtube.coverNone') }}
      </button>
    </div>
  </section>

  <!-- Cover (audio) -->
  <section v-if="!isSc && kind === 'audio'">
    <p class="text-xs text-base-content/50 font-medium uppercase tracking-wider mb-2">
      {{ t('youtube.coverSection') }}
    </p>
    <div class="grid grid-cols-2 gap-2">
      <button
        v-for="ct in coverTypes"
        :key="ct.id"
        class="fx-noise flex items-center gap-2 px-3 py-2 fx-depth rounded-field border text-sm transition-colors"
        :class="
          coverType === ct.id
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-base-300 text-base-content/70 hover:bg-base-content/10'
        "
        @click="coverType = ct.id"
      >
        <component :is="ct.icon" :size="14" />
        {{ t(ct.key) }}
      </button>
    </div>

    <div v-if="coverType === 'custom'" class="mt-2 flex items-center gap-2">
      <button
        class="fx-noise flex items-center gap-1.5 px-3 py-2 fx-depth rounded-field border border-base-300 text-xs text-base-content/70 hover:bg-base-content/10 transition-colors"
        @click="pickCustomCover"
      >
        <ImagePlus :size="13" />
        {{ t('youtube.pickCoverFile') }}
      </button>
      <span class="text-xs text-base-content/50 truncate flex-1">
        {{ customPath || t('youtube.coverCustomHint') }}
      </span>
    </div>

    <label v-else-if="coverType === 'frame'" class="mt-2 block text-xs text-base-content/50">
      {{ t('youtube.frameTimeLabel') }}
      <input
        v-model.number="frameTime"
        type="number"
        min="0"
        step="1"
        class="mt-1 w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
      />
    </label>

    <div v-else-if="coverType === 'clip'" class="mt-2 grid grid-cols-2 gap-3">
      <label class="block text-xs text-base-content/50">
        {{ t('youtube.clipStartLabel') }}
        <input
          v-model.number="clipStart"
          type="number"
          min="0"
          step="1"
          class="mt-1 w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
        />
      </label>
      <label class="block text-xs text-base-content/50">
        {{ t('youtube.clipEndLabel') }}
        <input
          v-model.number="clipEnd"
          type="number"
          min="1"
          step="1"
          class="mt-1 w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
        />
      </label>
      <label class="block text-xs text-base-content/50 col-span-2">
        {{ t('youtube.clipFormatLabel') }}
        <select
          v-model="clipFormat"
          class="mt-1 w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
        >
          <option value="webm">.webm</option>
          <option value="mp4">.mp4</option>
        </select>
      </label>
    </div>
  </section>
</template>
