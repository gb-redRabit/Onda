<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Repeat } from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import { formatDuration } from '@renderer/utils/formatters';

// Jeden przycisk cykliczny (bez rozwijanej): 1. klik ustawia A, 2. klik ustawia B
// i startuje pętlę, 3. klik resetuje A–B. Współdzielony przez wideo i audio.

const props = defineProps<{ currentTime: number }>();
const player = usePlayerStore();
const { t } = useI18n();

const hasA = computed(() => player.abA !== null);
const hasB = computed(() => player.abB !== null);
const state = computed<'idle' | 'a' | 'ab'>(() => (hasB.value ? 'ab' : hasA.value ? 'a' : 'idle'));

const label = computed(() => {
  if (state.value === 'a') return `A ${formatDuration(player.abA as number)}`;
  if (state.value === 'ab')
    return `${formatDuration(player.abA as number)}–${formatDuration(player.abB as number)}`;
  return '';
});

const title = computed(() => {
  const action =
    state.value === 'idle'
      ? t('playerView.abSetA')
      : state.value === 'a'
        ? t('playerView.abSetB')
        : t('playerView.abClear');
  return `${t('playerView.abRepeat')} — ${action}`;
});

function onClick() {
  if (state.value === 'idle') player.setAbA(props.currentTime);
  else if (state.value === 'a') player.setAbB(props.currentTime);
  else player.clearAb();
}
</script>

<template>
  <button
    type="button"
    data-testid="ab-repeat-button"
    :data-state="state"
    class="flex items-center gap-1 px-1.5 py-1 rounded-field text-[11px] font-medium transition-colors"
    :class="
      state === 'ab'
        ? 'text-primary'
        : state === 'a'
          ? 'text-neutral-content'
          : 'text-neutral-content/60 hover:text-neutral-content/80'
    "
    :aria-label="title"
    :title="title"
    @click="onClick"
  >
    <Repeat :size="16" />
    <span v-if="label" class="font-mono tabular-nums">{{ label }}</span>
  </button>
</template>
