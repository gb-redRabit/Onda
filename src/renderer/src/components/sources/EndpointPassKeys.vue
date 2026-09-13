<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Plus, Trash2 } from '@lucide/vue';
import type { DraftPassKey } from '@renderer/components/sources/endpointDraft';

const props = defineProps<{ modelId: string; fieldOptions: string[] }>();
const passKeys = defineModel<DraftPassKey[]>('passKeys', { required: true });

function fieldId(suffix: string): string {
  return `dl-${props.modelId}-${suffix}`;
}

function addPassKey() {
  passKeys.value.push({ from: '', as: '', type: 'string' });
}

function removePassKey(i: number) {
  passKeys.value.splice(i, 1);
}

const { t } = useI18n();
</script>

<template>
  <div class="space-y-1.5">
    <div class="flex items-center justify-between">
      <label class="block text-[10px] text-base-content/50 uppercase tracking-wider">{{
        t('sources.passKeys')
      }}</label>
      <button
        class="fx-noise flex items-center gap-1 px-1.5 py-0.5 fx-depth rounded-field text-primary text-[10px] font-medium hover:bg-primary/10 transition-colors"
        @click="addPassKey"
      >
        <Plus :size="10" />
        {{ t('sources.addPassKey') }}
      </button>
    </div>
    <div v-if="passKeys.length" class="space-y-1">
      <div v-for="(pk, i) in passKeys" :key="i" class="flex items-center gap-1.5">
        <input
          v-model="pk.from"
          type="text"
          :list="fieldId(`pk${i}`)"
          placeholder="slug"
          class="flex-1 min-w-0 px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <datalist :id="fieldId(`pk${i}`)">
          <option v-for="o in fieldOptions" :key="o" :value="o" />
        </datalist>
        <span class="text-base-content/50 text-xs">→</span>
        <input
          v-model="pk.as"
          type="text"
          placeholder="slug"
          class="w-24 px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <select
          v-model="pk.type"
          class="px-1.5 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs focus:outline-none"
        >
          <option value="string">{{ t('sources.keyString') }}</option>
          <option value="number">{{ t('sources.keyNumber') }}</option>
        </select>
        <button
          class="fx-noise p-1 fx-depth rounded-field text-base-content/50 hover:text-error transition-colors"
          :aria-label="t('common.delete')"
          @click="removePassKey(i)"
        >
          <Trash2 :size="12" />
        </button>
      </div>
    </div>
  </div>
</template>
