<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { RefreshCw, Shuffle } from '@lucide/vue';

defineProps<{ totalCount: number; isScanning: boolean; showShuffle: boolean }>();
const emit = defineEmits<{ shuffle: []; rescan: [] }>();

const { t } = useI18n();
</script>

<template>
  <div class="flex items-center justify-between gap-3 mb-3">
    <div class="flex items-center gap-3 min-w-0">
      <h1 class="text-xl font-bold tracking-tight shrink-0">{{ t('library.title') }}</h1>
      <span
        class="hidden sm:inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-base-100 border border-base-300 text-base-content/60"
      >
        <span v-if="isScanning" class="w-2 h-2 rounded-full bg-success animate-pulse"></span>
        <span v-else class="w-2 h-2 rounded-full bg-base-300"></span>
        {{ totalCount }} {{ t('library.files') }}
      </span>
    </div>
    <div class="flex items-center gap-1.5 shrink-0">
      <button
        v-if="showShuffle"
        class="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-base-100/(--glass-alpha) border border-base-300 text-xs hover:border-primary/50 hover:text-primary transition-colors"
        :title="t('library.shuffleAll')"
        @click="emit('shuffle')"
      >
        <Shuffle :size="12" />
        <span class="hidden lg:inline">{{ t('library.shuffle') }}</span>
      </button>
      <button
        class="p-2 rounded-full bg-base-100/(--glass-alpha) border border-base-300 hover:border-primary/30 hover:text-primary transition-colors"
        :title="t('library.rescan')"
        @click="emit('rescan')"
      >
        <RefreshCw :size="14" :class="{ 'animate-spin': isScanning }" />
      </button>
    </div>
  </div>
</template>
