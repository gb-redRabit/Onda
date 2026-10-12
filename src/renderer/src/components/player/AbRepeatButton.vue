<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Repeat, X } from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import { formatDuration } from '@renderer/utils/formatters';

// Pojedynczy przycisk „A–B" otwierający mały popover: ustaw A, ustaw B, pętla, wyczyść.
// Współdzielony przez odtwarzacz wideo i pasek audio (różni się tylko `currentTime`).

const props = defineProps<{ currentTime: number }>();
const player = usePlayerStore();

const open = ref(false);
const rootEl = ref<HTMLElement | null>(null);

const hasA = computed(() => player.abA !== null);
const hasB = computed(() => player.abB !== null);
const canLoop = computed(() => hasA.value && hasB.value);
const lit = computed(() => hasA.value || player.abActive);

const aLabel = computed(() => (hasA.value ? formatDuration(player.abA as number) : '—'));
const bLabel = computed(() => (hasB.value ? formatDuration(player.abB as number) : '—'));

function setA() {
  player.setAbA(props.currentTime);
}
function setB() {
  player.setAbB(props.currentTime);
}
function clearAll() {
  player.clearAb();
  open.value = false;
}

function onDocMousedown(e: MouseEvent) {
  if (!open.value) return;
  if (rootEl.value && !rootEl.value.contains(e.target as Node)) open.value = false;
}
onMounted(() => document.addEventListener('mousedown', onDocMousedown));
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocMousedown));
</script>

<template>
  <div ref="rootEl" class="relative" data-wheel-ignore>
    <button
      type="button"
      data-testid="ab-repeat-button"
      class="flex items-center gap-1 px-1.5 py-1 rounded-field text-[11px] font-medium transition-colors"
      :class="
        player.abActive
          ? 'text-primary'
          : lit
            ? 'text-neutral-content'
            : 'text-neutral-content/60 hover:text-neutral-content/80'
      "
      :aria-expanded="open"
      :aria-label="$t('playerView.abRepeat')"
      :title="$t('playerView.abRepeat')"
      @click="open = !open"
    >
      <Repeat :size="16" />
      <span v-if="lit" class="font-mono tabular-nums"
        >{{ aLabel }}<template v-if="hasB">–{{ bLabel }}</template></span
      >
    </button>

    <div
      v-if="open"
      data-testid="ab-repeat-popover"
      class="absolute bottom-full right-0 mb-2 z-30 w-52 p-2 rounded-box border border-base-300 bg-base-100 fx-depth"
      @click.stop
    >
      <div class="flex items-center justify-between mb-1.5 px-1">
        <span class="text-[11px] font-medium text-base-content/70">{{
          $t('playerView.abRepeat')
        }}</span>
        <button
          type="button"
          class="text-base-content/40 hover:text-base-content"
          :aria-label="$t('common.close')"
          @click="open = false"
        >
          <X :size="13" />
        </button>
      </div>

      <button
        type="button"
        data-testid="ab-set-a"
        class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-field text-xs hover:bg-base-content/10 transition-colors"
        @click="setA"
      >
        <span>{{ $t('playerView.abSetA') }}</span>
        <span class="font-mono tabular-nums text-base-content/60">{{ aLabel }}</span>
      </button>
      <button
        type="button"
        data-testid="ab-set-b"
        class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-field text-xs transition-colors disabled:opacity-40"
        :class="hasA ? 'hover:bg-base-content/10' : 'cursor-not-allowed'"
        :disabled="!hasA"
        @click="setB"
      >
        <span>{{ $t('playerView.abSetB') }}</span>
        <span class="font-mono tabular-nums text-base-content/60">{{ bLabel }}</span>
      </button>

      <div class="my-1 border-t border-base-300" />

      <button
        type="button"
        data-testid="ab-loop"
        class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-field text-xs transition-colors disabled:opacity-40"
        :class="canLoop ? 'hover:bg-base-content/10' : 'cursor-not-allowed'"
        :disabled="!canLoop"
        @click="player.toggleAb()"
      >
        <span>{{ $t('playerView.abLoop') }}</span>
        <span
          class="px-1.5 py-0.5 rounded-selector text-[10px] font-bold leading-none border"
          :class="
            player.abActive
              ? 'bg-primary text-primary-content border-primary'
              : 'bg-base-300 border-base-300 text-base-content/60'
          "
          >{{ player.abActive ? 'ON' : 'OFF' }}</span
        >
      </button>
      <button
        type="button"
        data-testid="ab-clear"
        class="w-full text-left px-2.5 py-1.5 rounded-field text-xs text-base-content/70 hover:bg-base-content/10 transition-colors disabled:opacity-40"
        :disabled="!lit"
        @click="clearAll"
      >
        {{ $t('playerView.abClear') }}
      </button>
    </div>
  </div>
</template>
