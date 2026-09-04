<script setup lang="ts">
import { computed } from 'vue';
import { Search, ArrowRight, ListMusic, SlidersHorizontal, Globe } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@renderer/stores/settings';
import { detectChannelPrefix, detectPlatform } from '@shared/platform';
import { AUDIO_FORMATS, VIDEO_QUALITIES, VIDEO_CONTAINERS } from '@shared/constants';
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

// What the current input resolves to: an @/$ channel prefix or a platform
// link. Drives the left badge inside the field.
const detection = computed<{ label: string; kind: 'yt' | 'sc' } | null>(() => {
  const value = props.modelValue.trim();
  if (!value) return null;
  const prefix = detectChannelPrefix(value);
  if (prefix) {
    return prefix.platform === 'youtube'
      ? { label: `YT · ${t('youtube.kindChannel')} @`, kind: 'yt' }
      : { label: `SC · ${t('youtube.kindProfile')} $`, kind: 'sc' };
  }
  const d = detectPlatform(value);
  if (!d) return null;
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
        <!-- Left: platform indicator — YT/SC (colored) when a link or @/$
             prefix is recognized, globe for plain text. -->
        <span
          v-if="detection"
          class="absolute left-2.5 top-1/2 -translate-y-1/2 z-10 text-xs font-bold pointer-events-none select-none"
          :class="detection.kind === 'sc' ? 'text-warning' : 'text-error'"
          :title="detection.label"
        >
          {{ detection.kind === 'sc' ? 'SC' : 'YT' }}
        </span>
        <Globe
          v-else
          :size="16"
          class="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/50"
        />
        <input
          :value="modelValue"
          :placeholder="t('youtube.pasteOrSearch')"
          class="w-full pl-11 pr-3 h-field-lg fx-depth rounded-field bg-base-100 border border-base-300 text-sm text-base-content placeholder:text-base-content/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-shadow"
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
            class="absolute -top-1 -right-1 min-w-3.5 h-3.5 px-0.5 flex items-center justify-center bg-primary text-primary-content text-[9px] font-bold rounded-full"
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

    <!-- Quick download settings popover -->
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
          class="px-2 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content focus:border-primary focus:outline-none"
          @change="
            settings.updateDownload({
              defaultAudioFormat: ($event.target as HTMLSelectElement).value as any
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
          class="px-2 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content focus:border-primary focus:outline-none"
          @change="
            settings.updateDownload({
              defaultVideoQuality: ($event.target as HTMLSelectElement).value as any
            })
          "
        >
          <option v-for="q in VIDEO_QUALITIES" :key="q" :value="q">{{ q }}</option>
        </select>

        <select
          v-if="settings.download.defaultKind === 'video'"
          :value="settings.download.defaultVideoContainer"
          class="px-2 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content focus:border-primary focus:outline-none"
          @change="
            settings.updateDownload({
              defaultVideoContainer: ($event.target as HTMLSelectElement).value as any
            })
          "
        >
          <option v-for="c in VIDEO_CONTAINERS" :key="c" :value="c">{{ c }}</option>
        </select>

        <select
          v-if="settings.download.defaultKind === 'audio'"
          :value="settings.download.defaultAudioQuality"
          class="px-2 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content focus:border-primary focus:outline-none"
          @change="
            settings.updateDownload({
              defaultAudioQuality: ($event.target as HTMLSelectElement).value as any
            })
          "
        >
          <option v-for="q in ['best', 'high', 'medium', 'low'] as const" :key="q" :value="q">
            {{ t('settings.audioQuality.' + q) }}
          </option>
        </select>
      </div>
    </Transition>
  </div>
</template>
