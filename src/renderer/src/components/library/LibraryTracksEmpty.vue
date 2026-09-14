<script setup lang="ts">
import { Music2 } from '@lucide/vue';

defineProps<{
  liked?: boolean;
}>();
</script>

<template>
  <div class="flex flex-col items-center justify-center h-full gap-4 text-base-content/50 p-8">
    <div
      class="w-20 h-20 rounded-full bg-base-100 border border-base-300 flex items-center justify-center"
    >
      <Music2 :size="28" class="opacity-40" />
    </div>
    <div class="text-center">
      <p class="text-sm font-medium">
        {{ liked ? $t('library.likedEmpty') : $t('library.noAudio') }}
      </p>
      <p class="text-xs mt-1 opacity-70">{{ $t('library.addFolderHint') }}</p>
    </div>
  </div>
</template>
