<script setup lang="ts">
import { X, BookOpen } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t, tm } = useI18n();

defineEmits<{
  close: [];
}>();

/** Locale używa «» zamiast {}, bo klamry to składnia interpolacji vue-i18n. */
function braces(s: string): string {
  return s.replaceAll('«', '{').replaceAll('»', '}');
}

const steps = computed(
  () => (tm('sources.guide.steps') as unknown) as { title: string; body: string }[]
);
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      @click.self="$emit('close')"
    >
      <div
        class="w-full max-w-4xl max-h-full flex flex-col rounded-2xl bg-bg-surface border border-border-default shadow-2xl overflow-hidden"
      >
        <div class="flex items-center gap-3 px-4 py-3 border-b border-border-default">
          <BookOpen :size="16" class="text-accent-base shrink-0" />
          <h2 class="text-lg font-medium truncate flex-1">{{ t('sources.guide.title') }}</h2>
          <button
            class="p-1.5 rounded-lg text-fg-muted hover:bg-bg-hover hover:text-fg-base transition-colors"
            :aria-label="t('common.close')"
            @click="$emit('close')"
          >
            <X :size="16" />
          </button>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
          <p class="text-sm leading-relaxed text-fg-muted">
            {{ t('sources.guide.intro') }}
          </p>

          <ol class="space-y-4">
            <li
              v-for="(step, i) in steps"
              :key="i"
              class="flex gap-3"
            >
              <span
                class="shrink-0 w-6 h-6 rounded-full bg-accent-base/10 text-accent-base text-sm font-semibold flex items-center justify-center mt-0.5"
              >
                {{ i + 1 }}
              </span>
              <div class="min-w-0 flex-1 space-y-1.5">
                <h3 class="text-lg font-medium">{{ braces(step.title) }}</h3>
                <p class="text-sm leading-relaxed text-fg-muted whitespace-pre-line">
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
