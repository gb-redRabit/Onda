<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Disc3, RefreshCw, Shuffle } from '@lucide/vue';
import { useCountLabel } from '@renderer/composables/useCountLabel';

defineProps<{ totalCount: number; isScanning: boolean; showShuffle: boolean }>();
const emit = defineEmits<{ shuffle: []; rescan: [] }>();

const { t } = useI18n();
const { fileCount } = useCountLabel();
</script>

<template>
  <div class="flex items-center justify-between gap-3 mb-3">
    <div class="flex items-center gap-3 min-w-0">
      <span
        class="grid h-8 w-8 shrink-0 place-items-center rounded-field bg-primary/10 text-primary-text"
      >
        <Disc3 :size="17" />
      </span>
      <h1 class="text-base font-semibold tracking-tight shrink-0">{{ t('library.title') }}</h1>
      <span
        class="hidden sm:inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full bg-base-200/80 border border-base-300/80 text-base-content/60 tabular-nums"
      >
        <span v-if="isScanning" class="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
        <span v-else class="w-1.5 h-1.5 rounded-full bg-primary/60"></span>
        {{ fileCount(totalCount) }}
      </span>
    </div>
    <div class="flex items-center gap-1.5 shrink-0">
      <button
        v-if="showShuffle"
        class="hidden sm:inline-flex h-8 items-center gap-1.5 px-2.5 rounded-field bg-base-200/60 border border-base-300/80 text-xs font-medium text-base-content/75 hover:border-primary/40 hover:text-base-content hover:bg-base-content/8 transition-colors"
        :title="t('library.shuffleAll')"
        @click="emit('shuffle')"
      >
        <Shuffle :size="13" class="text-primary-text" />
        <span class="hidden lg:inline">{{ t('library.shuffle') }}</span>
      </button>
      <button
        class="grid h-8 w-8 place-items-center rounded-field bg-base-200/60 border border-base-300/80 text-base-content/65 hover:border-primary/40 hover:text-base-content hover:bg-base-content/8 transition-colors"
        :title="t('library.rescan')"
        :aria-label="t('library.rescan')"
        @click="emit('rescan')"
      >
        <RefreshCw :size="14" :class="{ 'animate-spin text-primary-text': isScanning }" />
      </button>
    </div>
  </div>
</template>
