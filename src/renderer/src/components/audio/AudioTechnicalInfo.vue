<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePlayerStore } from '@renderer/stores/player';
import { formatFileSize } from '@renderer/utils/formatters';

// Element „Informacje techniczne”: format, bezstratność, bitrate, sample rate i rozmiar.
// Warianty różnią się układem, nie danymi — puste pola po prostu znikają.

const props = defineProps<{ variant?: string }>();

const player = usePlayerStore();
const { t } = useI18n();

const track = computed(() => player.currentTrack);
const meta = computed(() => track.value?.metadata);

const formatLabel = computed(() => {
  const raw = track.value?.extension || meta.value?.format || '';
  return raw.replace(/^\./, '').toUpperCase();
});

const bitrateLabel = computed(() => {
  const bitrate = meta.value?.bitrate;
  return bitrate && bitrate > 0 ? `${Math.round(bitrate / 1000)} kb/s` : '';
});

const sampleRateLabel = computed(() => {
  const rate = meta.value?.sampleRate;
  if (!rate || rate <= 0) return '';
  const khz = rate / 1000;
  return `${Number.isInteger(khz) ? khz : khz.toFixed(1)} kHz`;
});

const sizeLabel = computed(() => {
  const size = track.value?.size;
  return size && size > 0 ? formatFileSize(size) : '';
});

const isLossless = computed(() => {
  if (meta.value?.lossless === true) return true;
  // Stare skany nie zapisują `lossless`; wtedy wnioskujemy z kodeka/rozszerzenia.
  const haystack =
    `${meta.value?.codec ?? ''} ${meta.value?.format ?? ''} ${track.value?.extension ?? ''}`.toLowerCase();
  return /\b(flac|alac|wav|wave|aiff|ape|wv|dsd|dsf|pcm)\b/.test(haystack);
});

const isMinimal = computed(() => props.variant === 'minimal');
const isInline = computed(() => props.variant === 'inline');

const chips = computed(() => {
  const out = [formatLabel.value, bitrateLabel.value, sampleRateLabel.value];
  if (!isMinimal.value) out.push(sizeLabel.value);
  return out.filter(Boolean);
});

const inlineText = computed(() => {
  const out = [formatLabel.value, bitrateLabel.value, sampleRateLabel.value];
  if (!isMinimal.value) out.push(sizeLabel.value);
  return out.filter(Boolean).join(' · ');
});
</script>

<template>
  <div
    v-if="track"
    data-testid="audio-technical"
    class="w-full h-full flex items-center justify-center overflow-hidden px-2"
    :aria-label="t('audioView.elementTechnical')"
  >
    <span
      v-if="isInline || isMinimal"
      class="truncate text-3xs text-base-content/60 tabular-nums"
      :title="inlineText"
    >
      {{ inlineText }}
    </span>
    <div v-else class="flex items-center justify-center gap-1 overflow-hidden">
      <span
        v-for="chip in chips"
        :key="chip"
        class="shrink-0 rounded-full bg-base-content/8 px-2 py-0.5 text-3xs font-medium text-base-content/70 tabular-nums whitespace-nowrap"
      >
        {{ chip }}
      </span>
      <span
        v-if="isLossless"
        class="shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-3xs font-semibold text-success whitespace-nowrap"
      >
        {{ t('audioView.losslessLabel') }}
      </span>
    </div>
  </div>
</template>
