<script setup lang="ts">
import { Album, Calendar, Check, Hash, Loader2, Music2 } from '@lucide/vue';
import type { MusicbrainzRelease } from '@shared/types/ipc';

defineProps<{ rel: MusicbrainzRelease; selected: boolean; lookingUp: boolean; thumb?: string }>();
const emit = defineEmits<{ select: [] }>();
</script>

<template>
  <button
    class="w-full flex items-start gap-3 p-3 hover:bg-base-content/10 transition-colors text-left"
    :class="{ 'bg-primary/10': selected }"
    @click="emit('select')"
  >
    <div
      class="w-10 h-10 rounded-field bg-base-100 flex items-center justify-center shrink-0 overflow-hidden"
    >
      <img v-if="thumb" :src="thumb" class="w-full h-full object-cover" />
      <Music2 v-else :size="18" class="text-base-content/40" />
    </div>
    <div class="flex-1 min-w-0">
      <div class="text-sm font-medium truncate">{{ rel.title }}</div>
      <div class="text-xs text-base-content/70 truncate">
        {{ rel['artist-credit']?.[0]?.name || rel['artist-credit']?.[0]?.artist?.name || '?' }}
      </div>
      <div class="flex gap-3 mt-1 text-[11px] text-base-content/50">
        <span class="flex items-center gap-1"><Calendar :size="10" />{{ rel.date || '?' }}</span>
        <span class="flex items-center gap-1"
          ><Hash :size="10" />{{ rel['track-count'] || '?' }}</span
        >
        <span class="flex items-center gap-1"><Album :size="10" />{{ rel.country || '?' }}</span>
      </div>
    </div>
    <Check v-if="selected && !lookingUp" :size="16" class="text-primary shrink-0 mt-1" />
    <Loader2
      v-else-if="lookingUp"
      :size="14"
      class="animate-spin text-base-content/70 shrink-0 mt-1"
    />
  </button>
</template>
