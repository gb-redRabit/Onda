<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import CoverDetailFields from './CoverDetailFields.vue';

// Współdzielone pola okładki dla dialogów konfiguracji pobierania i subskrypcji.
// Zastępuje dwa niemal identyczne wrappery DownloadCoverSection/SubscribeCoverSection
// jednym komponentem i jednym zestawem modeli.
defineProps<{ isSc: boolean; kind: 'audio' | 'video' }>();

const coverType = defineModel<'thumbnail' | 'custom' | 'frame' | 'clip' | 'none'>('coverType', {
  required: true
});
const customPath = defineModel<string>('customPath', { required: true });
const frameTime = defineModel<number>('frameTime', { required: true });
const clipStart = defineModel<number>('clipStart', { required: true });
const clipEnd = defineModel<number>('clipEnd', { required: true });
const clipFormat = defineModel<'webm' | 'mp4'>('clipFormat', { required: true });

const { t } = useI18n();
</script>

<template>
  <!-- Wideo: miniatura lub brak -->
  <section v-if="!isSc && kind === 'video'">
    <p class="text-xs text-base-content/50 font-medium uppercase tracking-wider mb-2">
      {{ t('youtube.coverSection') }}
    </p>
    <div class="flex gap-1 bg-base-200/(--glass-alpha) rounded-box p-1 w-fit">
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

  <!-- Audio: miniatura / brak / klatka / klip / własna -->
  <section v-else-if="!isSc">
    <p class="text-xs text-base-content/50 font-medium uppercase tracking-wider mb-2">
      {{ t('youtube.coverSection') }}
    </p>
    <div class="flex gap-1 bg-base-200/(--glass-alpha) rounded-box p-1 w-fit flex-wrap">
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
    <CoverDetailFields
      :cover-type="coverType"
      :frame-time="frameTime"
      :clip-start="clipStart"
      :clip-end="clipEnd"
      :clip-format="clipFormat"
      :custom-path="customPath"
      :step-integers="false"
      :clip-columns="3"
      @update:frame-time="frameTime = $event"
      @update:clip-start="clipStart = $event"
      @update:clip-end="clipEnd = $event"
      @update:clip-format="clipFormat = $event"
      @update:custom-path="customPath = $event"
    />
  </section>
</template>
