<script setup lang="ts">
import { CheckCircle2, Clock, FolderOpen, Square } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import IconButton from '@renderer/components/ui/IconButton.vue';
import type { ClipStatus } from '@renderer/composables/useClipExporter';

defineProps<{
  status: ClipStatus;
  progress: number;
  speed: string;
  error: string;
  outputPath: string;
}>();

defineEmits<{ open: [] }>();

const { t } = useI18n();
</script>

<template>
  <section
    v-if="status !== 'idle'"
    data-testid="clip-job"
    :data-status="status"
    class="rounded-box border border-hairline bg-base-100/70 px-3 py-2"
  >
    <div class="flex items-center gap-2">
      <CheckCircle2 v-if="status === 'done'" :size="14" class="shrink-0 text-success" />
      <Square v-else-if="status === 'canceled'" :size="14" class="shrink-0 text-base-content/40" />
      <Clock v-else :size="14" class="shrink-0 text-primary-text" />
      <span class="min-w-0 flex-1 truncate text-xs">{{ t('tools.clipJob') }}</span>
      <span class="shrink-0 text-2xs text-base-content/50">
        {{ status === 'exporting' ? t('tools.clipExporting') : t(`tools.${status}`) }}
        <template v-if="status === 'exporting'">
          {{ t('tools.progress', { percent: Math.round(progress) }) }}
          <template v-if="speed"> · {{ speed }}</template>
        </template>
      </span>
      <IconButton
        v-if="outputPath"
        :icon="FolderOpen"
        :label="t('tools.openOutput')"
        :size="12"
        @click="$emit('open')"
      />
    </div>
    <div v-if="status === 'exporting'" class="mt-1.5 h-1 overflow-hidden rounded-full bg-base-300">
      <div
        class="h-full rounded-full bg-primary transition-[width] duration-300"
        :style="{ width: `${Math.max(2, Math.min(100, progress))}%` }"
      />
    </div>
    <p v-if="error" class="mt-1 text-2xs text-error line-clamp-2" :title="error">
      {{ error }}
    </p>
  </section>
</template>
