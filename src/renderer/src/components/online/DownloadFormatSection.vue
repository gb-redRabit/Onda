<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { AUDIO_FORMATS, VIDEO_CONTAINERS, VIDEO_QUALITIES } from '@shared/constants';
import FilenameTemplatePresets from '@renderer/components/FilenameTemplatePresets.vue';
import { AUDIO_QUALITIES } from '@renderer/utils/downloadConfigMeta';

defineProps<{ isSc: boolean }>();
const kind = defineModel<'audio' | 'video'>('kind', { required: true });
const format = defineModel<string>('format', { required: true });
const audioQuality = defineModel<string>('audioQuality', { required: true });
const quality = defineModel<string>('quality', { required: true });
const videoContainer = defineModel<'mp4' | 'mkv' | 'webm'>('videoContainer', { required: true });
const audioLanguage = defineModel<string>('audioLanguage', { required: true });
const trimStart = defineModel<number | null>('trimStart', { required: true });
const trimEnd = defineModel<number | null>('trimEnd', { required: true });
const filenameTemplate = defineModel<string>('filenameTemplate', { required: true });
const sponsorBlock = defineModel<'off' | 'mark' | 'remove'>('sponsorBlock', { required: true });

const { t } = useI18n();
</script>

<template>
  <section v-if="!isSc">
    <p class="text-xs text-base-content/50 font-medium uppercase tracking-wider mb-2">
      {{ t('youtube.prefKind') }}
    </p>
    <div class="flex gap-1 bg-base-200/[var(--glass-alpha)] rounded-box p-1 w-fit">
      <button
        v-for="k in ['audio', 'video'] as const"
        :key="k"
        class="fx-noise px-4 py-1.5 fx-depth rounded-field text-xs font-medium transition-colors"
        :class="
          kind === k
            ? 'bg-primary text-primary-content'
            : 'text-base-content/70 hover:text-base-content'
        "
        @click="kind = k"
      >
        {{ k === 'audio' ? t('youtube.prefAudio') : t('youtube.prefVideo') }}
      </button>
    </div>

    <div class="mt-3 grid grid-cols-2 gap-3">
      <label v-if="kind === 'audio'" class="block text-xs text-base-content/50">
        {{ t('youtube.prefFormat') }}
        <select
          v-model="format"
          class="mt-1 w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
        >
          <option v-for="f in AUDIO_FORMATS" :key="f" :value="f">
            {{ f === 'best' ? t('settings.audioNative') : f }}
          </option>
        </select>
      </label>
      <label v-if="kind === 'audio'" class="block text-xs text-base-content/50">
        {{ t('settings.defaultAudioQuality') }}
        <select
          v-model="audioQuality"
          class="mt-1 w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
        >
          <option v-for="q in AUDIO_QUALITIES" :key="q" :value="q">
            {{ t('settings.audioQuality.' + q) }}
          </option>
        </select>
      </label>
      <label v-if="kind === 'video'" class="block text-xs text-base-content/50">
        {{ t('youtube.prefQuality') }}
        <select
          v-model="quality"
          class="mt-1 w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
        >
          <option v-for="q in VIDEO_QUALITIES" :key="q" :value="q">{{ q }}</option>
        </select>
      </label>
      <label v-if="kind === 'video'" class="block text-xs text-base-content/50">
        {{ t('settings.defaultVideoContainer') }}
        <select
          v-model="videoContainer"
          class="mt-1 w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
        >
          <option v-for="c in VIDEO_CONTAINERS" :key="c" :value="c">{{ c }}</option>
        </select>
      </label>
    </div>

    <label v-if="kind === 'audio'" class="mt-3 block text-xs text-base-content/50">
      {{ t('youtube.audioLanguage') }}
      <input
        v-model="audioLanguage"
        class="mt-1 w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
        :placeholder="t('youtube.audioLanguagePlaceholder')"
      />
    </label>

    <div class="mt-3 grid grid-cols-2 gap-3">
      <label class="block text-xs text-base-content/50">
        {{ t('youtube.trimStart') }}
        <input
          v-model.number="trimStart"
          type="number"
          min="0"
          step="1"
          class="mt-1 w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
          :placeholder="t('youtube.trimStartPlaceholder')"
        />
      </label>
      <label class="block text-xs text-base-content/50">
        {{ t('youtube.trimEnd') }}
        <input
          v-model.number="trimEnd"
          type="number"
          min="0"
          step="1"
          class="mt-1 w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
          :placeholder="t('youtube.trimEndPlaceholder')"
        />
      </label>
    </div>

    <label class="mt-3 block text-xs text-base-content/50">
      {{ t('youtube.prefTemplate') }}
      <input
        v-model="filenameTemplate"
        class="mt-1 w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
        :placeholder="t('youtube.prefTemplatePlaceholder')"
      />
      <div class="mt-1.5">
        <FilenameTemplatePresets @preset="(p) => (filenameTemplate = p)" />
      </div>
    </label>

    <label class="mt-3 block text-xs text-base-content/50">
      {{ t('youtube.sponsorBlock') }}
      <select
        v-model="sponsorBlock"
        class="mt-1 w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
      >
        <option value="off">{{ t('youtube.sponsorBlockOff') }}</option>
        <option value="mark">{{ t('youtube.sponsorBlockMark') }}</option>
        <option value="remove">{{ t('youtube.sponsorBlockRemove') }}</option>
      </select>
    </label>
  </section>
</template>
