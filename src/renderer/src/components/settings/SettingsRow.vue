<script setup lang="ts">
import { computed } from 'vue';
import { RotateCcw } from '@lucide/vue';
import { currentOf, isSettingModified, resetSetting } from '@renderer/utils/settingsDefaults';

const props = withDefaults(
  defineProps<{
    label: string;
    description?: string;
    /** `<group>.<field>` — włącza kropkę "zmienione" i reset pojedynczego ustawienia. */
    path?: string;
    /** Id kotwicy używane przez wyszukiwanie ustawień. */
    anchor?: string;
    /** Szersza kolumna kontrolki dla suwaków/wybieraków kolorów. */
    wide?: boolean;
  }>(),
  { wide: false }
);

const modified = computed(() => (props.path ? isSettingModified(props.path) : false));
const valueLabel = computed(() => {
  if (!props.path) return '';
  const value = currentOf(props.path);
  return typeof value === 'number' || typeof value === 'string' ? String(value) : '';
});
</script>

<template>
  <div :id="anchor" class="flex items-center justify-between gap-4 py-2.5 scroll-mt-14">
    <div class="min-w-0">
      <div class="flex items-center gap-1.5">
        <span class="text-[13px] font-medium text-base-content">{{ label }}</span>
        <span
          v-if="modified"
          class="w-1.5 h-1.5 rounded-full bg-primary shrink-0"
          :title="$t('settings.modified')"
        />
      </div>
      <div v-if="description" class="mt-0.5 text-[11px] text-base-content/45">
        {{ description }}
      </div>
    </div>
    <div class="shrink-0 flex items-center gap-2" :class="wide ? 'w-64' : 'w-auto'">
      <button
        v-if="modified"
        class="p-1 rounded-field text-base-content/40 hover:text-base-content hover:bg-base-content/10 transition-colors"
        :title="$t('settings.resetSetting')"
        :aria-label="$t('settings.resetSetting')"
        @click="path && resetSetting(path)"
      >
        <RotateCcw :size="13" />
      </button>
      <div class="flex-1 flex justify-end" :title="valueLabel">
        <slot />
      </div>
    </div>
  </div>
</template>
