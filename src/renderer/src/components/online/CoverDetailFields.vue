<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ImagePlus } from '@lucide/vue';
import { pickImagePath } from '@renderer/utils/pickImage';

/**
 * The detail inputs that depend on which cover type is selected: a frame time,
 * a clip range with its container, or a chosen file.
 *
 * DownloadCoverSection and SubscribeCoverSection both wrote these out, and they
 * had drifted: one had `step="1"` on the frame input and the other did not, one
 * laid the clip fields out in two columns and the other in three, and the
 * subscribe copy put the custom branch after the clip branch so the conditions
 * were in a different order. Those differences are now props.
 */
type CoverType = 'thumbnail' | 'custom' | 'frame' | 'clip' | 'none';

withDefaults(
  defineProps<{
    coverType: CoverType;
    frameTime: number;
    clipStart: number;
    clipEnd: number;
    clipFormat: 'webm' | 'mp4';
    customPath: string;
    /** Show the `step` hint on the numeric inputs. */
    stepIntegers?: boolean;
    /** Grid columns for the clip row: 2 puts the format on its own line. */
    clipColumns?: 2 | 3;
  }>(),
  { stepIntegers: true, clipColumns: 2 }
);

const emit = defineEmits<{
  'update:frameTime': [value: number];
  'update:clipStart': [value: number];
  'update:clipEnd': [value: number];
  'update:clipFormat': [value: 'webm' | 'mp4'];
  'update:customPath': [value: string];
}>();

const { t } = useI18n();

async function onPickFile() {
  const path = await pickImagePath();
  if (path) emit('update:customPath', path);
}

const INPUT_BASE =
  'mt-1 w-full py-2 fx-depth rounded-field bg-base-200/(--glass-alpha) border border-base-300 text-sm focus:border-primary focus:outline-none';

/** The 3-column clip row is narrower, so it drops a step of horizontal padding. */
function inputClass(compact: boolean): string {
  return `${INPUT_BASE} ${compact ? 'px-2' : 'px-3'}`;
}
</script>

<template>
  <label v-if="coverType === 'frame'" class="block text-xs text-base-content/50">
    {{ t('youtube.frameTimeLabel') }}
    <input
      :value="frameTime"
      type="number"
      min="0"
      :step="stepIntegers ? 1 : 'any'"
      :class="inputClass(false)"
      @input="emit('update:frameTime', Number(($event.target as HTMLInputElement).value))"
    />
  </label>

  <div
    v-else-if="coverType === 'clip'"
    class="mt-2 grid gap-3"
    :class="clipColumns === 3 ? 'grid-cols-3 gap-2' : 'grid-cols-2'"
  >
    <label class="block text-xs text-base-content/50">
      {{ t('youtube.clipStartLabel') }}
      <input
        :value="clipStart"
        type="number"
        min="0"
        :step="stepIntegers ? 1 : 'any'"
        :class="inputClass(clipColumns === 3)"
        @input="emit('update:clipStart', Number(($event.target as HTMLInputElement).value))"
      />
    </label>
    <label class="block text-xs text-base-content/50">
      {{ t('youtube.clipEndLabel') }}
      <input
        :value="clipEnd"
        type="number"
        min="1"
        :step="stepIntegers ? 1 : 'any'"
        :class="inputClass(clipColumns === 3)"
        @input="emit('update:clipEnd', Number(($event.target as HTMLInputElement).value))"
      />
    </label>
    <label v-if="clipColumns === 2" class="block text-xs text-base-content/50 col-span-2">
      {{ t('youtube.clipFormatLabel') }}
      <select
        :value="clipFormat"
        :class="inputClass(false)"
        @change="
          emit('update:clipFormat', ($event.target as HTMLSelectElement).value as 'webm' | 'mp4')
        "
      >
        <option value="webm">.webm</option>
        <option value="mp4">.mp4</option>
      </select>
    </label>
    <label v-else class="block text-xs text-base-content/50">
      {{ t('youtube.clipFormatLabel') }}
      <select
        :value="clipFormat"
        :class="inputClass(true)"
        @change="
          emit('update:clipFormat', ($event.target as HTMLSelectElement).value as 'webm' | 'mp4')
        "
      >
        <option value="webm">.webm</option>
        <option value="mp4">.mp4</option>
      </select>
    </label>
  </div>

  <div v-else-if="coverType === 'custom'" class="mt-2 flex items-center gap-2">
    <button
      type="button"
      class="fx-noise flex items-center gap-1.5 px-3 py-2 fx-depth rounded-field border border-base-300 text-xs text-base-content/70 hover:bg-base-content/10 transition-colors"
      @click="onPickFile"
    >
      <ImagePlus :size="13" />
      {{ t('youtube.pickCoverFile') }}
    </button>
    <span class="text-xs text-base-content/50 truncate flex-1">
      {{ customPath || t('youtube.coverCustomHint') }}
    </span>
  </div>
</template>
