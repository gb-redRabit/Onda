<script setup lang="ts">
import { Music2 } from '@lucide/vue';
import EmptyState from '@renderer/components/ui/EmptyState.vue';

defineProps<{
  liked?: boolean;
}>();
</script>

<template>
  <EmptyState
    :title="liked ? $t('library.likedEmpty') : $t('library.noAudio')"
    :description="$t('library.addFolderHint')"
    :icon="Music2"
    class="h-full border-0"
  />
</template>
