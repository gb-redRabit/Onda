<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{ isEdit: boolean }>();
const downloadAll = defineModel<boolean>({ required: true });

const { t } = useI18n();
</script>

<template>
  <div v-if="!isEdit">
    <p class="text-xs text-base-content/50 font-medium uppercase tracking-wider mb-2">
      {{ t('youtube.subscribeScope') }}
    </p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <button
        class="fx-noise p-3 fx-depth rounded-field border text-left transition-all"
        :class="
          !downloadAll ? 'border-primary bg-primary/10' : 'border-base-300 hover:border-base-300'
        "
        @click="downloadAll = false"
      >
        <p class="text-sm font-medium text-base-content">{{ t('youtube.scopeNew') }}</p>
        <p class="text-xs text-base-content/50">{{ t('youtube.scopeNewDesc') }}</p>
      </button>
      <button
        class="fx-noise p-3 fx-depth rounded-field border text-left transition-all"
        :class="
          downloadAll ? 'border-primary bg-primary/10' : 'border-base-300 hover:border-base-300'
        "
        @click="downloadAll = true"
      >
        <p class="text-sm font-medium text-base-content">{{ t('youtube.scopeAll') }}</p>
        <p class="text-xs text-base-content/50">{{ t('youtube.scopeAllDesc') }}</p>
      </button>
    </div>
  </div>
</template>
