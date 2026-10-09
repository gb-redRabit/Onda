<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { CircleCheck, CircleX, CircleAlert, Plus, Trash2 } from '@lucide/vue';
import type { PhaseItem } from './sourcePhases';

defineProps<{ phases: PhaseItem[]; active: number }>();
const emit = defineEmits<{ select: [index: number]; add: []; remove: [index: number] }>();
const { t } = useI18n();
</script>

<template>
  <nav
    class="w-56 shrink-0 h-full overflow-y-auto border-r border-base-300 bg-base-200/40 py-2"
    role="tablist"
    :aria-label="t('sources.levels')"
  >
    <div
      v-for="(p, i) in phases"
      :key="p.key"
      role="tab"
      tabindex="0"
      :aria-selected="i === active"
      class="group w-full flex items-center gap-2 px-2.5 py-2 cursor-pointer text-xs transition-colors"
      :class="
        i === active
          ? 'bg-primary/15 text-base-content'
          : 'text-base-content/70 hover:bg-base-content/5'
      "
      @click="emit('select', i)"
      @keydown.enter="emit('select', i)"
      @keydown.space.prevent="emit('select', i)"
    >
      <span
        class="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono"
        :class="i === active ? 'bg-primary text-primary-content' : 'bg-base-content/10'"
        >{{ i }}</span
      >
      <span class="min-w-0 flex-1">
        <span class="block truncate font-medium">{{ p.label }}</span>
        <span class="block text-[10px] text-base-content/50 truncate">
          {{
            p.kind === 'source'
              ? t('sources.phaseSource')
              : p.kind === 'test'
                ? t('sources.phaseTest')
                : p.type === 'page'
                  ? t('sources.typePage')
                  : t('sources.typeList')
          }}
        </span>
      </span>
      <CircleCheck v-if="p.status === 'ok'" :size="13" class="shrink-0 text-success" />
      <CircleX v-else-if="p.status === 'fail'" :size="13" class="shrink-0 text-error" />
      <CircleAlert v-else-if="p.status === 'invalid'" :size="13" class="shrink-0 text-warning" />
      <button
        v-if="p.kind === 'endpoint'"
        class="shrink-0 p-0.5 rounded text-base-content/40 hover:text-error transition-colors"
        :aria-label="t('common.delete')"
        @click.stop="emit('remove', i)"
      >
        <Trash2 :size="12" />
      </button>
    </div>
    <button
      class="mt-1 w-full flex items-center gap-1.5 px-2.5 py-2 text-xs text-primary hover:bg-primary/10 transition-colors"
      data-testid="sources-phase-add"
      @click="emit('add')"
    >
      <Plus :size="12" />
      {{ t('sources.addLevel') }}
    </button>
  </nav>
</template>
