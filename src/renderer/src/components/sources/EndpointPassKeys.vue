<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Plus } from '@lucide/vue';
import type { DraftPassKey } from '@renderer/components/sources/endpointDraft';
import FieldLabel from './FieldLabel.vue';
import PassKeyRow from './PassKeyRow.vue';

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
      <FieldLabel :text="t('sources.passKeys')" tight />
      <button
        type="button"
        class="fx-noise flex items-center gap-1 px-1.5 py-0.5 fx-depth rounded-field text-primary text-[11px] font-medium hover:bg-primary/10 transition-colors"
        @click="addPassKey"
      >
        <Plus :size="10" />
        {{ t('sources.addPassKey') }}
      </button>
    </div>
    <div v-if="passKeys.length" class="space-y-1">
      <PassKeyRow
        v-for="(_, i) in passKeys"
        :key="i"
        v-model="passKeys[i]"
        :options="fieldOptions"
        :id-base="fieldId(`pk${i}`)"
        @remove="removePassKey(i)"
      />
    </div>
  </div>
</template>
