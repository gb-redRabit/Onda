<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{
  isSc: boolean;
  profiles: Array<{ id: string; name: string }>;
  selectedId: string;
}>();
const emit = defineEmits<{ select: [string] }>();

function onChange(e: Event) {
  emit('select', (e.target as HTMLSelectElement).value);
}

const { t } = useI18n();
</script>

<template>
  <section v-if="!isSc">
    <p class="text-xs text-base-content/50 font-medium uppercase tracking-wider mb-2">
      {{ t('youtube.profilesSection') }}
    </p>
    <select
      :value="selectedId"
      class="w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
      @change="onChange"
    >
      <option value="">{{ t('youtube.profileNone') }}</option>
      <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
    </select>
  </section>
</template>
