<script setup lang="ts">
import { Play, Pause, Volume2 } from '@lucide/vue'

defineProps<{
  visible: boolean
  text: string
  icon: 'play' | 'pause' | 'volume' | 'seek' | 'track'
}>()
</script>

<template>
  <Transition name="osd-fade">
    <div
      v-if="visible"
      class="absolute top-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-5 py-2.5 rounded-xl bg-black/70 backdrop-blur-sm border border-white/10 pointer-events-none"
    >
      <Play v-if="icon === 'play'" :size="16" class="text-accent-base" fill="currentColor" />
      <Pause v-else-if="icon === 'pause'" :size="16" class="text-accent-base" />
      <Volume2 v-else-if="icon === 'volume'" :size="16" class="text-accent-base" />
      <span class="text-white text-sm font-medium truncate max-w-100">{{ text }}</span>
    </div>
  </Transition>
</template>

<style scoped>
.osd-fade-enter-active,
.osd-fade-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}
.osd-fade-enter-from,
.osd-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -10px);
}
.osd-fade-enter-to,
.osd-fade-leave-from {
  opacity: 1;
  transform: translate(-50%, 0);
}
</style>
