<script setup lang="ts">
import { Image } from '@lucide/vue';
import { useI18n } from 'vue-i18n';

defineProps<{ thumbnail?: string; title: string }>();

const { t } = useI18n();
</script>

<template>
  <div class="space-y-4">
    <div class="aspect-video rounded-box overflow-hidden bg-base-100 border border-base-300">
      <img v-if="thumbnail" :src="thumbnail" :alt="title" class="w-full h-full object-cover" />
      <div v-else class="w-full h-full flex items-center justify-center text-base-content/50">
        <Image :size="32" />
      </div>
    </div>
    <div class="p-3 rounded-box bg-base-100 border border-base-300">
      <p class="text-xs text-base-content/50">{{ t('youtube.downloadConfigHint') }}</p>
      <p class="text-sm font-medium text-base-content mt-1 line-clamp-2">{{ title }}</p>
    </div>
  </div>
</template>
