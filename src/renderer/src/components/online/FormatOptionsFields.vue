<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { AUDIO_FORMATS, VIDEO_CONTAINERS, VIDEO_QUALITIES } from '@shared/constants';
import FormField from '@renderer/components/ui/FormField.vue';
import Input from '@renderer/components/ui/Input.vue';
import Select from '@renderer/components/ui/Select.vue';
import TimeInput from '@renderer/components/ui/TimeInput.vue';

// Współdzielone pola formatu pobierania/subskrybowania. Dialogi konfiguracji
// pobierania i subskrypcji renderują te same pola rodzaju/formatu/jakości/przycinania/
// sponsor-blocka; dialog pobierania dodaje kontener wideo i szablon nazwy pliku, które
// dialog subskrypcji trzyma gdzie indziej. Jeden komponent, jeden zestaw modeli.
withDefaults(
  defineProps<{
    isSc: boolean;
    audioQualities: readonly string[];
    showVideoContainer?: boolean;
  }>(),
  { showVideoContainer: false }
);

const kind = defineModel<'audio' | 'video'>('kind', { required: true });
const format = defineModel<string>('format', { required: true });
const audioQuality = defineModel<string>('audioQuality', { required: true });
const quality = defineModel<string>('quality', { required: true });
const videoContainer = defineModel<'mp4' | 'mkv' | 'webm'>('videoContainer');
const audioLanguage = defineModel<string>('audioLanguage', { required: true });
const trimStart = defineModel<number | null>('trimStart', { required: true });
const trimEnd = defineModel<number | null>('trimEnd', { required: true });
const sponsorBlock = defineModel<'off' | 'mark' | 'remove'>('sponsorBlock', { required: true });

const { t } = useI18n();

// Koniec przycięcia musi być późniejszy niż początek; pole pokazuje błąd
// zamiast po cichu obciąć nagranie do zera.
const trimError = computed(() => {
  if (trimStart.value == null || trimEnd.value == null) return '';
  return trimEnd.value <= trimStart.value ? t('youtube.trimRangeError') : '';
});
</script>

<template>
  <section v-if="!isSc">
    <p class="mb-2 text-xs font-medium uppercase tracking-wider text-base-content/50">
      {{ t('youtube.prefKind') }}
    </p>
    <div class="flex w-fit gap-1 rounded-box bg-base-200/(--glass-alpha) p-1">
      <button
        v-for="k in ['audio', 'video'] as const"
        :key="k"
        class="fx-noise rounded-field px-4 py-1.5 text-xs font-medium fx-depth transition-colors"
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
      <FormField v-if="kind === 'audio'" :label="t('youtube.prefFormat')">
        <template #default="{ id }">
          <Select :id="id" v-model="format">
            <option v-for="f in AUDIO_FORMATS" :key="f" :value="f">
              {{ f === 'best' ? t('settings.audioNative') : f }}
            </option>
          </Select>
        </template>
      </FormField>
      <FormField v-if="kind === 'audio'" :label="t('settings.defaultAudioQuality')">
        <template #default="{ id }">
          <Select :id="id" v-model="audioQuality">
            <option v-for="q in audioQualities" :key="q" :value="q">
              {{ t('settings.audioQuality.' + q) }}
            </option>
          </Select>
        </template>
      </FormField>
      <FormField v-if="kind === 'video'" :label="t('youtube.prefQuality')">
        <template #default="{ id }">
          <Select :id="id" v-model="quality">
            <option v-for="q in VIDEO_QUALITIES" :key="q" :value="q">{{ q }}</option>
          </Select>
        </template>
      </FormField>
      <FormField
        v-if="kind === 'video' && showVideoContainer"
        :label="t('settings.defaultVideoContainer')"
      >
        <template #default="{ id }">
          <Select :id="id" v-model="videoContainer">
            <option v-for="c in VIDEO_CONTAINERS" :key="c" :value="c">{{ c }}</option>
          </Select>
        </template>
      </FormField>
    </div>

    <FormField v-if="kind === 'audio'" class="mt-3" :label="t('youtube.audioLanguage')">
      <template #default="{ id }">
        <Input
          :id="id"
          v-model="audioLanguage"
          :placeholder="t('youtube.audioLanguagePlaceholder')"
        />
      </template>
    </FormField>
    <div class="mt-3 grid grid-cols-2 gap-3">
      <FormField :label="t('youtube.trimStart')">
        <template #default="{ id }">
          <TimeInput :id="id" v-model="trimStart" :aria-label="t('youtube.trimStart')" />
        </template>
      </FormField>
      <FormField :label="t('youtube.trimEnd')" :error="trimError">
        <template #default="{ id, describedby }">
          <TimeInput
            :id="id"
            v-model="trimEnd"
            :aria-label="t('youtube.trimEnd')"
            :aria-describedby="describedby"
            :invalid="!!trimError"
          />
        </template>
      </FormField>
    </div>

    <FormField class="mt-3" :label="t('youtube.sponsorBlock')">
      <template #default="{ id }">
        <Select :id="id" v-model="sponsorBlock">
          <option value="off">{{ t('youtube.sponsorBlockOff') }}</option>
          <option value="mark">{{ t('youtube.sponsorBlockMark') }}</option>
          <option value="remove">{{ t('youtube.sponsorBlockRemove') }}</option>
        </Select>
      </template>
    </FormField>
  </section>
</template>
