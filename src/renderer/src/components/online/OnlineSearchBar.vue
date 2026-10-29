<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Search, ArrowRight, ListMusic, SlidersHorizontal, Globe } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@renderer/stores/settings';
import { detectChannelPrefix, detectPlatform, isHttpUrl } from '@shared/platform';
import type { ProviderDetectResult } from '@shared/types/providers';
import { AUDIO_FORMATS, VIDEO_QUALITIES, VIDEO_CONTAINERS } from '@shared/constants';
import { readSelect } from '@renderer/utils/selectOptions';

/** Ta sama lista, z której renderowane są opcje, więc obie nie mogą się rozjechać. */
const AUDIO_QUALITIES = ['best', 'high', 'medium', 'low'] as const;
import OnlineButton from './OnlineButton.vue';
import OnlineIconButton from './OnlineIconButton.vue';

const props = defineProps<{
  modelValue: string;
  isResolving?: boolean;
  isSearching?: boolean;
  batchOpen?: boolean;
  batchCount?: number;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  submit: [];
  toggleBatch: [];
}>();

const { t } = useI18n();
const settings = useSettingsStore();

// Krótkie kody providerów dla plakietki (label bywa długi, np. „Internet Archive").
const PROVIDER_SHORT: Record<string, string> = {
  pikpak: 'PIKPAK',
  mega: 'MEGA',
  gdrive: 'DRIVE',
  terabox: 'TERABOX',
  aliyun: 'ALIYUN',
  '115': '115',
  quark: 'QUARK',
  '123pan': '123PAN',
  '189': '189',
  baidu: 'BAIDU',
  xunlei: 'XUNLEI',
  dropbox: 'DROPBOX',
  yandex: 'YANDEX',
  archive: 'ARCHIVE',
  direct: 'DIRECT'
};

// Auto-detekcja providera (PikPak/MEGA/Drive/hostery) przez IPC — debounce + ochrona
// przed nieaktualnymi odpowiedziami. Dla nieobsługiwanych linków zostaje „WEB".
const providerDetect = ref<ProviderDetectResult | null>(null);
let providerSeq = 0;
let providerTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.modelValue,
  (value) => {
    if (providerTimer) clearTimeout(providerTimer);
    const trimmed = value.trim();
    if (!trimmed || !/^https?:\/\//i.test(trimmed)) {
      providerDetect.value = null;
      return;
    }
    providerTimer = setTimeout(async () => {
      const seq = ++providerSeq;
      try {
        const res = (await window.api.invoke(
          'providers:detect',
          trimmed
        )) as ProviderDetectResult | null;
        if (seq === providerSeq) providerDetect.value = res ?? null;
      } catch {
        if (seq === providerSeq) providerDetect.value = null;
      }
    }, 200);
  }
);
onBeforeUnmount(() => {
  if (providerTimer) clearTimeout(providerTimer);
});

// Na co rozwiązuje się bieżące wejście: prefiks kanału @/$, link providera, link
// platformy lub zwykły adres. Steruje lewą plakietką wewnątrz pola.
const detection = computed<{
  label: string;
  short: string;
  kind: 'yt' | 'sc' | 'web' | 'provider';
} | null>(() => {
  const value = props.modelValue.trim();
  if (!value) return null;
  if (providerDetect.value) {
    return {
      label: providerDetect.value.label,
      short:
        PROVIDER_SHORT[providerDetect.value.id] ||
        providerDetect.value.label.toUpperCase().slice(0, 7),
      kind: 'provider'
    };
  }
  const prefix = detectChannelPrefix(value);
  if (prefix) {
    return prefix.platform === 'youtube'
      ? { label: `YT · ${t('youtube.kindChannel')} @`, short: 'YT', kind: 'yt' }
      : { label: `SC · ${t('youtube.kindProfile')} $`, short: 'SC', kind: 'sc' };
  }
  const d = detectPlatform(value);
  if (!d) {
    return isHttpUrl(value)
      ? { label: `WEB · ${t('youtube.externalLink')}`, short: 'WEB', kind: 'web' }
      : null;
  }
  const typeKey =
    d.kind === 'video'
      ? d.platform === 'soundcloud'
        ? 'youtube.typeTrack'
        : 'youtube.kindVideo'
      : d.kind === 'playlist'
        ? d.platform === 'soundcloud'
          ? 'youtube.typeSet'
          : 'youtube.kindPlaylist'
        : 'youtube.kindChannel';
  return {
    label: `${d.platform === 'youtube' ? 'YT' : 'SC'} · ${t(typeKey)}`,
    short: d.platform === 'youtube' ? 'YT' : 'SC',
    kind: d.platform === 'youtube' ? 'yt' : 'sc'
  };
});

const isResolvable = computed(() => detection.value !== null);

const submitLabel = computed(() => {
  if (props.isResolving) return t('youtube.resolving');
  return isResolvable.value ? t('youtube.resolve') : t('youtube.search');
});

function onDrop(e: DragEvent) {
  const text = e.dataTransfer?.getData('text/plain')?.trim();
  if (!text) return;
  emit('update:modelValue', text);
  emit('submit');
}

const quickOpen = defineModel<boolean>('quickOpen', { default: false });
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center gap-2">
      <div class="relative flex-1 min-w-0">
        <!-- Lewa: wskaźnik platformy — YT/SC (kolorowy), gdy rozpoznano link lub
             prefiks @/$, globus dla zwykłego tekstu. -->
        <span
          v-if="detection"
          data-testid="online-detect-badge"
          class="absolute left-2.5 top-1/2 -translate-y-1/2 z-10 text-xs font-bold pointer-events-none select-none"
          :class="
            detection.kind === 'sc'
              ? 'text-warning'
              : detection.kind === 'web'
                ? 'text-info'
                : detection.kind === 'provider'
                  ? 'text-primary-text'
                  : 'text-error'
          "
          :title="detection.label"
        >
          {{ detection.short }}
        </span>
        <Globe
          v-else
          :size="16"
          class="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/50"
        />
        <input
          data-testid="online-search-input"
          :value="modelValue"
          :placeholder="t('youtube.pasteOrSearch')"
          class="w-full pl-[46px] pr-3 h-field-lg fx-depth rounded-field bg-base-100 border border-base-300 text-sm text-base-content placeholder:text-base-content/50 focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary/30 transition-shadow"
          @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
          @keydown.enter="emit('submit')"
          @dragover.prevent
          @drop.prevent="onDrop"
        />
      </div>

      <OnlineButton
        :variant="isResolvable ? 'secondary' : 'primary'"
        :disabled="isResolving || isSearching || !modelValue.trim()"
        @click="emit('submit')"
      >
        <ArrowRight v-if="isResolvable" :size="16" />
        <Search v-else :size="16" />
        <span class="hidden sm:inline">{{ submitLabel }}</span>
      </OnlineButton>

      <OnlineIconButton
        :title="t('youtube.batch')"
        :active="batchOpen"
        @click="emit('toggleBatch')"
      >
        <div class="relative">
          <ListMusic :size="18" />
          <span
            v-if="batchCount && batchCount > 0"
            class="absolute -top-1 -right-1 min-w-3.5 h-3.5 px-0.5 flex items-center justify-center bg-primary text-primary-content text-[10px] font-bold rounded-full"
          >
            {{ batchCount > 9 ? '9+' : batchCount }}
          </span>
        </div>
      </OnlineIconButton>

      <OnlineIconButton
        :title="t('youtube.downloadOptions')"
        :active="quickOpen"
        @click="quickOpen = !quickOpen"
      >
        <SlidersHorizontal :size="18" />
      </OnlineIconButton>
    </div>

    <!-- Popover szybkich ustawień pobierania -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div
        v-if="quickOpen"
        class="flex flex-wrap items-center gap-3 p-3 rounded-box bg-base-100 border border-base-300"
      >
        <span class="text-xs text-base-content/50">{{ t('youtube.quickDownload') }}</span>
        <div class="flex gap-1 bg-base-100 rounded-box p-1">
          <button
            v-for="k in ['audio', 'video'] as const"
            :key="k"
            type="button"
            class="fx-noise px-3 py-1.5 fx-depth rounded-field text-xs font-medium transition-colors"
            :class="
              settings.download.defaultKind === k
                ? 'bg-base-100 text-base-content'
                : 'text-base-content/50 hover:text-base-content/70'
            "
            @click="settings.updateDownload({ defaultKind: k })"
          >
            {{ k === 'audio' ? t('youtube.prefAudio') : t('youtube.prefVideo') }}
          </button>
        </div>

        <select
          v-if="settings.download.defaultKind === 'audio'"
          :value="settings.download.defaultAudioFormat"
          class="px-2 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content focus:border-primary focus:outline-hidden"
          @change="
            settings.updateDownload({
              defaultAudioFormat: readSelect($event, AUDIO_FORMATS)
            })
          "
        >
          <option v-for="f in AUDIO_FORMATS" :key="f" :value="f">
            {{ f === 'best' ? t('settings.audioNative') : f }}
          </option>
        </select>

        <select
          v-else
          :value="settings.download.defaultVideoQuality"
          class="px-2 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content focus:border-primary focus:outline-hidden"
          @change="
            settings.updateDownload({
              defaultVideoQuality: readSelect($event, VIDEO_QUALITIES)
            })
          "
        >
          <option v-for="q in VIDEO_QUALITIES" :key="q" :value="q">{{ q }}</option>
        </select>

        <select
          v-if="settings.download.defaultKind === 'video'"
          :value="settings.download.defaultVideoContainer"
          class="px-2 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content focus:border-primary focus:outline-hidden"
          @change="
            settings.updateDownload({
              defaultVideoContainer: readSelect($event, VIDEO_CONTAINERS)
            })
          "
        >
          <option v-for="c in VIDEO_CONTAINERS" :key="c" :value="c">{{ c }}</option>
        </select>

        <select
          v-if="settings.download.defaultKind === 'audio'"
          :value="settings.download.defaultAudioQuality"
          class="px-2 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content focus:border-primary focus:outline-hidden"
          @change="
            settings.updateDownload({
              defaultAudioQuality: readSelect($event, AUDIO_QUALITIES)
            })
          "
        >
          <option v-for="q in AUDIO_QUALITIES" :key="q" :value="q">
            {{ t('settings.audioQuality.' + q) }}
          </option>
        </select>
      </div>
    </Transition>
  </div>
</template>
