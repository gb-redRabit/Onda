<script setup lang="ts">
import { X, BookOpen } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

interface GuideSection {
  heading: string;
  body?: string;
  list?: string[];
  code?: string;
  code2?: string;
}

const { t, tm } = useI18n();

defineEmits<{
  close: [];
}>();

/** Locale używa «» zamiast {}, bo klamry to składnia interpolacji vue-i18n. */
function braces(s: string): string {
  return s.replaceAll('«', '{').replaceAll('»', '}');
}

const sections = computed(
  () => (tm('plugins.guide.sections') as unknown as GuideSection[]) ?? []
);
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-neutral/70 p-4 sm:p-6"
      @click.self="$emit('close')"
    >
      <div
        class="w-full max-w-3xl max-h-full flex flex-col rounded-box bg-base-100 border border-base-300 shadow-2xl overflow-hidden"
      >
        <div class="flex items-center gap-3 px-4 py-3 border-b border-base-300">
          <BookOpen :size="16" class="text-primary shrink-0" />
          <h2 class="text-lg font-medium truncate flex-1">{{ t('plugins.guide.title') }}</h2>
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
            {{ t('plugins.guide.intro') }}
          </p>

          <div v-for="(section, i) in sections" :key="i" class="flex gap-3">
            <span
              class="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-semibold flex items-center justify-center mt-0.5"
            >
              {{ i + 1 }}
            </span>
            <div class="min-w-0 flex-1 space-y-2">
              <h3 class="text-base font-semibold">{{ braces(section.heading) }}</h3>
              <p v-if="section.body" class="text-sm leading-relaxed text-base-content/70 whitespace-pre-line">
                {{ braces(section.body) }}
              </p>
              <ul v-if="section.list && section.list.length" class="space-y-1">
                <li
                  v-for="(item, j) in section.list"
                  :key="j"
                  class="flex gap-2 text-sm leading-relaxed text-base-content/70"
                >
                  <span class="text-primary shrink-0 mt-0.5">•</span>
                  <span class="whitespace-pre-line">{{ braces(item) }}</span>
                </li>
              </ul>
              <pre
                v-if="section.code"
                class="p-3 rounded-field bg-base-200 text-[11px] leading-relaxed text-base-content/70 overflow-auto whitespace-pre-wrap break-all"
              ><code>{{ braces(section.code) }}</code></pre>
              <pre
                v-if="section.code2"
                class="p-3 rounded-field bg-base-200 text-[11px] leading-relaxed text-base-content/70 overflow-auto whitespace-pre-wrap break-all"
              ><code>{{ braces(section.code2) }}</code></pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>