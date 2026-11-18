<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { FolderOpen, Trash2 } from '@lucide/vue';
import { formatTimecode } from '@renderer/utils/videoClipper';
import type { ClipItem } from '@renderer/composables/useClipExporter';

defineProps<{ clips: ClipItem[]; busy: boolean; fps: number }>();
const emit = defineEmits<{ remove: [id: string]; clear: []; open: [path: string] }>();

const { t } = useI18n();
</script>

<template>
  <section
    v-if="clips.length"
    data-testid="clip-list"
    class="rounded-box border border-hairline bg-base-100/70 p-3"
  >
    <div class="mb-2 flex items-center justify-between gap-2">
      <span class="text-xs font-semibold">
        {{ t('tools.clipList', { count: clips.length }) }}
      </span>
      <button
        type="button"
        class="fx-noise rounded-field px-2 py-1 text-2xs text-base-content/50 transition-colors hover:bg-base-content/10 hover:text-base-content disabled:opacity-40"
        :disabled="busy"
        @click="emit('clear')"
      >
        {{ t('tools.clipClearList') }}
      </button>
    </div>
    <div class="space-y-1">
      <div
        v-for="(clip, index) in clips"
        :key="clip.id"
        class="flex items-center gap-2 rounded-field border border-hairline/60 bg-base-200/40 px-2 py-1.5"
      >
        <span class="w-5 text-center font-mono text-3xs text-base-content/45">
          {{ index + 1 }}
        </span>
        <span class="min-w-0 flex-1 font-mono text-2xs">
          {{ formatTimecode(clip.startSec, fps) }} – {{ formatTimecode(clip.endSec, fps) }}
        </span>
        <span class="shrink-0 text-3xs text-base-content/45">
          {{ clip.status === 'exporting' ? t('tools.clipExporting') : t(`tools.${clip.status}`) }}
        </span>
        <button
          v-if="clip.outputPath"
          type="button"
          class="fx-noise shrink-0 rounded-field p-1 text-base-content/45 transition-colors hover:bg-base-content/10 hover:text-base-content"
          :title="t('tools.openOutput')"
          :aria-label="t('tools.openOutput')"
          @click="emit('open', clip.outputPath)"
        >
          <FolderOpen :size="11" />
        </button>
        <button
          type="button"
          class="fx-noise shrink-0 rounded-field p-1 text-base-content/40 transition-colors hover:bg-error/10 hover:text-error disabled:opacity-30"
          :disabled="busy"
          :aria-label="t('tools.remove')"
          @click="emit('remove', clip.id)"
        >
          <Trash2 :size="11" />
        </button>
      </div>
    </div>
  </section>
</template>
