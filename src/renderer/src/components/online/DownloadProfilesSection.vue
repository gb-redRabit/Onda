<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Save, Trash2 } from '@lucide/vue';

defineProps<{
  isSc: boolean;
  profiles: Array<{ id: string; name: string }>;
  selectedId: string;
}>();
const emit = defineEmits<{ select: [string]; save: []; delete: [] }>();
const profileName = defineModel<string>('profileName', { required: true });

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
    <div class="flex items-center gap-2">
      <select
        :value="selectedId"
        class="flex-1 min-w-0 px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
        @change="onChange"
      >
        <option value="">{{ t('youtube.profileNone') }}</option>
        <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
      <button
        v-if="selectedId"
        class="fx-noise p-2 fx-depth rounded-field border border-base-300 text-base-content/70 hover:text-error hover:bg-base-content/10 transition-colors shrink-0"
        :title="t('youtube.profileDelete')"
        @click="emit('delete')"
      >
        <Trash2 :size="14" />
      </button>
    </div>
    <div class="flex items-center gap-2 mt-2">
      <input
        v-model="profileName"
        class="flex-1 px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
        :placeholder="t('youtube.profileNamePlaceholder')"
      />
      <button
        class="fx-noise flex items-center gap-1 px-3 py-2 fx-depth rounded-field border border-base-300 text-xs text-base-content/70 hover:bg-base-content/10 transition-colors shrink-0"
        :disabled="!profileName.trim()"
        @click="emit('save')"
      >
        <Save :size="13" />
        {{ t('youtube.profileSave') }}
      </button>
    </div>
  </section>
</template>
