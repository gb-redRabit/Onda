<script setup lang="ts">
import ModalShell from '@renderer/components/ui/ModalShell.vue';
import { X, BookOpen, Search, Check, Copy } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

interface GuideSection {
  heading: string;
  body?: string;
  list?: string[];
  code?: string;
  code2?: string;
}

const { t, tm } = useI18n();

const emit = defineEmits<{
  close: [];
}>();

/** Locale używa «» zamiast {}, bo klamry to składnia interpolacji vue-i18n. */
function braces(s: string): string {
  return s.replaceAll('«', '{').replaceAll('»', '}');
}

const allSections = computed(
  () => (tm('plugins.guide.sections') as unknown as GuideSection[]) ?? []
);

const query = ref('');
const searchInput = ref<HTMLInputElement | null>(null);
const copied = ref<string | null>(null);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

/** Dolny i górny limit sekcji liczone są po pozycji w pełnej liście. */
const sections = computed(() => {
  const q = query.value.trim().toLowerCase();
  return allSections.value
    .map((section, index) => ({ section, index }))
    .filter(({ section }) => {
      if (!q) return true;
      const haystack = [section.heading, section.body ?? '', ...(section.list ?? [])]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
});

const isFiltered = computed(() => query.value.trim().length > 0);

async function copyCode(code: string, key: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(braces(code));
    copied.value = key;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copied.value = null;
    }, 1500);
  } catch {
    copied.value = null;
  }
}

function clearSearch(): void {
  query.value = '';
  searchInput.value?.focus();
}
</script>

<template>
  <ModalShell
    labelled-by="plugins-guide-modal-title"
    backdrop-testid="plugins-guide-dialog"
    panel-class="w-full max-w-3xl max-h-full flex flex-col overflow-hidden"
    @close="emit('close')"
  >
    <div class="flex items-center gap-3 px-4 py-3 border-b border-base-300">
      <BookOpen :size="16" class="text-primary shrink-0" />
      <h2 id="plugins-guide-modal-title" class="text-lg font-medium truncate flex-1">
        {{ t('plugins.guide.title') }}
      </h2>
      <button
        class="fx-noise p-1.5 fx-depth rounded-field text-base-content/70 hover:bg-base-content/10 hover:text-base-content transition-colors"
        :aria-label="t('common.close')"
        data-testid="plugins-guide-close"
        @click="emit('close')"
      >
        <X :size="16" />
      </button>
    </div>

    <div class="flex items-center gap-2 px-4 py-2 border-b border-base-300">
      <div class="relative flex-1">
        <Search
          :size="14"
          class="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/50 pointer-events-none"
        />
        <input
          ref="searchInput"
          v-model="query"
          type="text"
          :placeholder="t('plugins.guide.searchPlaceholder')"
          class="w-full pl-8 pr-7 py-1.5 text-xs fx-depth rounded-field bg-base-100 border border-base-300 text-base-content placeholder:text-base-content/50 outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
          data-testid="plugins-guide-search"
        />
        <button
          v-if="query"
          class="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
          :aria-label="t('common.clear')"
          data-testid="plugins-guide-search-clear"
          @click="clearSearch"
        >
          <X :size="12" />
        </button>
      </div>
      <span
        class="shrink-0 text-[11px] text-base-content/50 tabular-nums"
        data-testid="plugins-guide-count"
      >
        {{ sections.length }} / {{ allSections.length }}
      </span>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
      <p v-if="!isFiltered" class="text-sm leading-relaxed text-base-content/70">
        {{ t('plugins.guide.intro') }}
      </p>

      <p
        v-if="!sections.length"
        class="text-sm text-base-content/50"
        data-testid="plugins-guide-empty"
      >
        {{ t('plugins.guide.searchEmpty') }}
      </p>

      <div v-for="{ section, index } in sections" :key="index" class="flex gap-3">
        <span
          class="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-semibold flex items-center justify-center mt-0.5"
        >
          {{ index + 1 }}
        </span>
        <div class="min-w-0 flex-1 space-y-2">
          <h3 class="text-base font-semibold" :data-testid="`plugins-guide-heading-${index}`">
            {{ braces(section.heading) }}
          </h3>
          <p
            v-if="section.body"
            class="text-sm leading-relaxed text-base-content/70 whitespace-pre-line"
          >
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
          <div
            v-for="(code, c) in [section.code, section.code2].filter(Boolean) as string[]"
            :key="c"
            class="relative group"
          >
            <pre
              class="p-3 pe-12 rounded-field bg-base-200 text-[11px] leading-relaxed text-base-content/70 overflow-auto whitespace-pre-wrap break-all"
            ><code>{{ braces(code) }}</code></pre>
            <button
              class="absolute top-1.5 right-1.5 p-1 fx-depth rounded-field text-base-content/50 opacity-60 hover:opacity-100 hover:text-base-content hover:bg-base-content/10 transition-colors focus:opacity-100"
              :aria-label="t('plugins.guide.copyCode')"
              data-testid="plugins-guide-copy"
              @click="copyCode(code, `${index}:${c}`)"
            >
              <Check v-if="copied === `${index}:${c}`" :size="12" class="text-success" />
              <Copy v-else :size="12" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </ModalShell>
</template>
