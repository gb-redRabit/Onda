<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{ isSc: boolean }>();
const subsEnabled = defineModel<boolean>('subsEnabled', { required: true });
const subsLangs = defineModel<string>('subsLangs', { required: true });
const subsMode = defineModel<'manual' | 'auto' | 'best'>('subsMode', { required: true });
const subsFormat = defineModel<'srt' | 'vtt' | 'ass'>('subsFormat', { required: true });
const subsFolder = defineModel<boolean>('subsFolder', { required: true });

const { t } = useI18n();
</script>

<template>
  <section v-if="!isSc">
    <p class="text-xs text-base-content/50 font-medium uppercase tracking-wider mb-2">
      {{ t('youtube.subsSection') }}
    </p>
    <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
      <input v-model="subsEnabled" type="checkbox" />
      {{ t('youtube.subsDownload') }}
    </label>
    <div v-if="subsEnabled" class="mt-2 space-y-2">
      <input
        v-model="subsLangs"
        class="w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
        :placeholder="t('youtube.subsLangsPlaceholder')"
      />
      <div class="grid grid-cols-2 gap-2">
        <select
          v-model="subsMode"
          class="px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
        >
          <option value="best">{{ t('youtube.subsModeBest') }}</option>
          <option value="manual">{{ t('youtube.subsModeManual') }}</option>
          <option value="auto">{{ t('youtube.subsModeAuto') }}</option>
        </select>
        <select
          v-model="subsFormat"
          class="px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
        >
          <option value="srt">SRT</option>
          <option value="vtt">VTT</option>
          <option value="ass">ASS</option>
        </select>
      </div>
      <label class="flex items-center gap-2 text-xs cursor-pointer select-none">
        <input
          v-model="subsFolder"
          type="checkbox"
          class="w-3.5 h-3.5 fx-depth rounded-field accent-primary"
        />
        {{ t('youtube.subsFolder') }}
      </label>
    </div>
  </section>
</template>
