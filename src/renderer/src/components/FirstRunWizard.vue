<script setup lang="ts">
import { ref, computed, type Component } from 'vue';
import { useI18n } from 'vue-i18n';
import { X, ArrowLeft, ArrowRight, Check } from '@lucide/vue';
import { useLibraryStore } from '@renderer/stores/library';
import { useUIStore } from '@renderer/stores/ui';
import WizardWelcome from './wizard/WizardWelcome.vue';
import WizardLibrary from './wizard/WizardLibrary.vue';
import WizardDownload from './wizard/WizardDownload.vue';
import WizardOnline from './wizard/WizardOnline.vue';
import WizardAppearance from './wizard/WizardAppearance.vue';
import WizardAudio from './wizard/WizardAudio.vue';
import WizardPip from './wizard/WizardPip.vue';
import WizardDependencies from './wizard/WizardDependencies.vue';
import WizardSummary from './wizard/WizardSummary.vue';

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const library = useLibraryStore();
const ui = useUIStore();

const steps: Component[] = [
  WizardWelcome,
  WizardLibrary,
  WizardDownload,
  WizardOnline,
  WizardAppearance,
  WizardAudio,
  WizardPip,
  WizardDependencies,
  WizardSummary
];
const total = steps.length;
const current = ref(0);
const scanNow = ref(true);

const progress = computed(() => Math.round(((current.value + 1) / total) * 100));
const isLast = computed(() => current.value === total - 1);
const isFirst = computed(() => current.value === 0);
const stepProps = computed(() =>
  current.value === 1 || isLast.value ? { scanNow: scanNow.value } : {}
);

function markDone() {
  try {
    localStorage.setItem('onda-first-run-done', '1');
  } catch {
    /* storage unavailable */
  }
}

function next() {
  if (isLast.value) {
    finish();
  } else {
    current.value += 1;
  }
}

function back() {
  if (current.value > 0) current.value -= 1;
}

function finish() {
  markDone();
  if (scanNow.value && library.folders.length > 0) void library.scanFolders();
  ui.notify('success', t('wizard.done'));
  emit('close');
}

function skipAll() {
  markDone();
  emit('close');
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 bg-neutral/60 backdrop-blur-sm flex items-center justify-center p-6"
    @click.self="skipAll"
  >
    <div
      class="w-full max-w-xl rounded-box bg-base-100 border border-base-300 shadow-2xl shadow-black/50 flex flex-col max-h-[86vh]"
    >
      <header class="px-6 pt-5 pb-4 border-b border-base-300">
        <div class="flex items-center justify-between gap-4">
          <div class="text-xs font-medium text-base-content/50">
            {{ t('wizard.title') }}
          </div>
          <button
            class="p-1.5 rounded hover:bg-base-content/10 text-base-content/50 hover:text-base-content transition-colors"
            :title="t('wizard.later')"
            @click="skipAll"
          >
            <X :size="16" />
          </button>
        </div>
        <div class="mt-2 h-1.5 rounded-full bg-base-300 overflow-hidden">
          <div
            class="h-full rounded-full bg-primary transition-all duration-300"
            :style="{ width: progress + '%' }"
          />
        </div>
        <div class="mt-1.5 text-[11px] text-base-content/40">
          {{ t('wizard.step', { current: current + 1, total }) }}
        </div>
      </header>

      <main class="px-6 py-5 overflow-y-auto">
        <component :is="steps[current]" v-bind="stepProps" @update:scan-now="scanNow = $event" />
      </main>

      <footer class="px-6 pb-5 pt-4 border-t border-base-300 flex items-center gap-3">
        <button
          class="px-3 py-2 rounded-field text-sm text-base-content/60 hover:text-base-content hover:bg-base-content/10 transition-colors"
          @click="skipAll"
        >
          {{ t('wizard.skipAll') }}
        </button>

        <div class="flex-1" />

        <button
          class="fx-noise px-3.5 py-2 fx-depth rounded-field border border-base-300 text-sm text-base-content/70 hover:bg-base-content/10 transition-colors disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1.5"
          :disabled="isFirst"
          @click="back"
        >
          <ArrowLeft :size="15" />
          {{ t('wizard.back') }}
        </button>

        <button
          class="fx-noise px-4 py-2 fx-depth rounded-field bg-primary text-primary-content text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-1.5"
          @click="next"
        >
          <template v-if="isLast">
            <Check :size="15" />
            {{ t('wizard.start') }}
          </template>
          <template v-else>
            {{ t('wizard.next') }}
            <ArrowRight :size="15" />
          </template>
        </button>
      </footer>
    </div>
  </div>
</template>
