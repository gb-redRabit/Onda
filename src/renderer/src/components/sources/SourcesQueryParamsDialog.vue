<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ModalShell from '@renderer/components/ui/ModalShell.vue';
import Button from '@renderer/components/ui/Button.vue';
import FormField from '@renderer/components/ui/FormField.vue';

// Edytor parametrów zapytania: po jednym `klucz=wartość` w linii. Pole w pasku
// narzędzi pokazuje tylko skrót, bo lista parametrów bywa długa i łamała układ.
const props = defineProps<{
  open: boolean;
  modelValue: string;
  /** Efektywny adres zapytania (z parametrami) do zwijanych szczegółów. */
  requestUrl?: string;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: string];
  apply: [];
  close: [];
}>();

const { t } = useI18n();
const draft = ref('');

watch(
  () => props.open,
  (open) => {
    if (open) draft.value = props.modelValue;
  }
);

function apply(): void {
  emit('update:modelValue', draft.value);
  emit('apply');
  emit('close');
}

function clear(): void {
  draft.value = '';
}
</script>

<template>
  <ModalShell
    v-if="open"
    labelled-by="sources-params-title"
    panel-class="w-full max-w-lg overflow-hidden"
    @close="emit('close')"
    @escape="emit('close')"
  >
    <div class="border-b border-base-300 px-5 py-3.5">
      <h3 id="sources-params-title" class="text-sm font-semibold text-base-content">
        {{ t('sources.queryParams') }}
      </h3>
    </div>

    <div class="space-y-3 px-5 py-4">
      <FormField :label="t('sources.queryBuilderParams')" :hint="t('sources.queryParamsHint')">
        <template #default="{ id }">
          <textarea
            :id="id"
            v-model="draft"
            rows="7"
            spellcheck="false"
            data-testid="sources-params-input"
            class="w-full resize-y rounded-field border border-base-300/80 bg-base-200/70 px-3 py-2 font-mono text-xs text-base-content transition-colors placeholder:text-base-content/50 focus:border-primary/50 focus:outline-hidden focus:ring-2 focus:ring-primary/20"
            :placeholder="t('sources.queryParamsPlaceholder')"
          />
        </template>
      </FormField>

      <details v-if="requestUrl" class="rounded-field border border-base-300 bg-base-100/60">
        <summary class="cursor-pointer px-3 py-2 text-2xs font-medium text-base-content/60">
          {{ t('sources.requestDetails') }}
        </summary>
        <p class="break-all px-3 pb-3 font-mono text-2xs text-base-content/70">
          {{ requestUrl }}
        </p>
      </details>
    </div>

    <div class="flex items-center justify-end gap-2 border-t border-base-300 px-5 py-3.5">
      <Button variant="ghost" size="md" class="mr-auto" @click="clear">
        {{ t('common.clear') }}
      </Button>
      <Button variant="outline" size="md" @click="emit('close')">
        {{ t('common.cancel') }}
      </Button>
      <Button variant="solid" size="md" data-testid="sources-params-apply" @click="apply">
        {{ t('sources.applyParams') }}
      </Button>
    </div>
  </ModalShell>
</template>
