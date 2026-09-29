<script setup lang="ts">
import { useDialogFocus } from '@renderer/composables/useDialogFocus';
import { X, BookOpen } from '@lucide/vue';
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t, tm } = useI18n();

const emit = defineEmits<{
  close: [];
}>();

/** Locale używa «» zamiast {}, bo klamry to składnia interpolacji vue-i18n. */
function braces(s: string): string {
  return s.replaceAll('«', '{').replaceAll('»', '}');
}

const steps = computed(
  () => tm('sources.guide.steps') as unknown as { title: string; body: string }[]
);
const panelRef = ref<HTMLElement | null>(null);
// Focus enters the dialog on open, cycles inside it, and returns to the opener
// on close; Escape is handled here so every dialog dismisses the same way.
useDialogFocus(panelRef, { closeOnEscape: true, onEscape: () => emit('close') });
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-neutral/70 p-6"
      @click.self="$emit('close')"
    >
      <div
        ref="panelRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-guide-modal-title"
        tabindex="-1"
        class="w-full max-w-4xl max-h-full flex flex-col rounded-box bg-base-100 border border-base-300 shadow-2xl overflow-hidden"
      >
        <div class="flex items-center gap-3 px-4 py-3 border-b border-base-300">
          <BookOpen :size="16" class="text-primary shrink-0" />
          <h2 id="source-guide-modal-title" class="text-lg font-medium truncate flex-1">
            {{ t('sources.guide.title') }}
          </h2>
          <button
            class="fx-noise p-1.5 fx-depth rounded-field text-base-content/70 hover:bg-base-content/10 hover:text-base-content transition-colors"
            :aria-label="t('common.close')"
            @click="$emit('close')"
          >
            <X :size="16" />
          </button>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
          <p class="text-sm leading-relaxed text-base-content/70">
            {{ t('sources.guide.intro') }}
          </p>

          <ol class="space-y-4">
            <li v-for="(step, i) in steps" :key="i" class="flex gap-3">
              <span
                class="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-semibold flex items-center justify-center mt-0.5"
              >
                {{ i + 1 }}
              </span>
              <div class="min-w-0 flex-1 space-y-1.5">
                <h3 class="text-lg font-medium">{{ braces(step.title) }}</h3>
                <p class="text-sm leading-relaxed text-base-content/70 whitespace-pre-line">
                  {{ braces(step.body) }}
                </p>
              </div>
            </li>
          </ol>
        </div>
      </div>
    </div>
  </Teleport>
</template>
