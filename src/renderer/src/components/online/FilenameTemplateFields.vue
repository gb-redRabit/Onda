<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import FormField from '@renderer/components/ui/FormField.vue';
import Input from '@renderer/components/ui/Input.vue';
import FilenameTemplatePresets from '@renderer/components/FilenameTemplatePresets.vue';

// Szablon nazwy pliku: pole, gotowe presety, chipy tokenów i podgląd wyniku.
// Tokeny są wstawiane na końcu — klikanie ich w środku tekstu wymagałoby
// śledzenia kursora, a w praktyce szablon układa się od lewej do prawej.
const filenameTemplate = defineModel<string>('filenameTemplate', { required: true });
const props = defineProps<{ preview?: string }>();

const { t } = useI18n();

const TOKENS = ['{title}', '{artist}', '{album}', '{year}', '{id}'] as const;

const previewText = computed(() => {
  if (!props.preview) return '';
  return props.preview;
});

function insertToken(token: string): void {
  const current = filenameTemplate.value ?? '';
  const separator = current && !/\s$/.test(current) ? ' ' : '';
  filenameTemplate.value = `${current}${separator}${token}`;
}
</script>

<template>
  <FormField :label="t('youtube.prefTemplate')">
    <template #default="{ id }">
      <Input
        :id="id"
        v-model="filenameTemplate"
        :placeholder="t('youtube.prefTemplatePlaceholder')"
      />
      <div class="mt-1.5">
        <FilenameTemplatePresets @preset="(p) => (filenameTemplate = p)" />
      </div>
      <div class="mt-2 flex flex-wrap gap-1">
        <button
          v-for="token in TOKENS"
          :key="token"
          type="button"
          class="rounded-field border border-base-300/70 bg-base-200/50 px-1.5 py-0.5 font-mono text-[11px] text-base-content/65 transition-colors hover:border-primary/40 hover:text-base-content"
          :title="t('youtube.templateTokenHint', { token })"
          @click="insertToken(token)"
        >
          {{ token }}
        </button>
      </div>
      <p
        v-if="previewText"
        class="mt-2 truncate font-mono text-[11px] text-base-content/55"
        :title="previewText"
        data-testid="template-preview"
      >
        {{ previewText }}
      </p>
    </template>
  </FormField>
</template>
