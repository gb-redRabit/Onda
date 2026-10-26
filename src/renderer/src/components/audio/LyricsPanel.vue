<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Minus, Plus, RotateCcw, ZoomIn, ZoomOut } from '@lucide/vue';
import { useLyricsStore } from '@renderer/stores/lyrics';
import { formatLyricsDelay } from '@renderer/utils/lyrics';

const props = defineProps<{ variant?: string }>();
const { t } = useI18n();
const lyrics = useLyricsStore();

const variantClass = computed(() => {
  switch (props.variant) {
    case 'minimal':
      return 'border border-transparent bg-transparent shadow-none backdrop-blur-none';
    case 'solid':
      return 'border border-base-300 bg-base-300 shadow-xl';
    case 'gradient':
      return 'border border-primary/25 bg-linear-to-br from-base-300/95 via-base-200/90 to-primary/20 shadow-xl';
    default:
      return 'border border-white/15 bg-linear-to-br from-white/10 via-base-200/20 to-base-200/35 shadow-2xl ring-1 ring-inset ring-white/10 backdrop-blur-xl backdrop-saturate-150';
  }
});

const currentIndex = computed(() => Math.max(0, lyrics.activeIndex));
const currentLine = computed(() => lyrics.lines[currentIndex.value] ?? null);
const nextLine = computed(() => lyrics.lines[currentIndex.value + 1] ?? null);
</script>

<template>
  <div
    data-testid="lyrics-panel"
    class="flex h-full w-full flex-col overflow-hidden rounded-box border"
    :class="variantClass"
    :aria-label="t('lyrics.title')"
  >
    <div
      class="flex min-h-0 flex-1 flex-col justify-center overflow-hidden px-4 py-2"
      :style="{ fontSize: `${1.5 * lyrics.fontScale}rem` }"
    >
      <p v-if="lyrics.loading" class="text-center text-xs text-base-content/50">
        {{ t('lyrics.loading') }}
      </p>
      <p
        v-else-if="lyrics.error"
        class="text-center text-xs text-warning"
        data-testid="lyrics-error"
      >
        {{ t(lyrics.error) }}
      </p>
      <p
        v-else-if="!lyrics.result.lines.length"
        class="text-center text-xs leading-relaxed text-base-content/50"
        data-testid="lyrics-empty"
      >
        {{ t('lyrics.empty') }}
      </p>
      <div
        v-else-if="lyrics.result.kind === 'plain'"
        class="h-full overflow-y-auto text-center leading-relaxed text-base-content/80"
      >
        <p v-for="(line, index) in lyrics.result.lines" :key="`${index}-${line.text}`">
          {{ line.text }}
        </p>
      </div>
      <Transition v-else name="lyrics-swap" mode="out-in">
        <div :key="currentIndex" class="flex flex-col items-center gap-1">
          <button
            v-if="currentLine"
            data-testid="lyrics-current"
            class="w-full whitespace-pre-line text-center font-semibold leading-snug text-primary-text transition-colors"
            @click="lyrics.seekToLine(currentIndex)"
          >
            {{ currentLine.text }}
          </button>
          <button
            v-if="nextLine"
            data-testid="lyrics-next"
            class="w-full whitespace-pre-line text-center text-[0.78em] leading-snug text-base-content/45 transition-colors hover:text-base-content/70"
            @click="lyrics.seekToLine(currentIndex + 1)"
          >
            {{ nextLine.text }}
          </button>
        </div>
      </Transition>
    </div>

    <footer
      class="flex shrink-0 items-center justify-center gap-1 border-t px-2 py-1 text-[11px] text-base-content/50 transition-opacity"
      :class="props.variant === 'minimal' ? 'border-transparent' : 'border-base-300/60'"
    >
      <button
        class="fx-noise rounded-field p-1 hover:bg-base-content/10 hover:text-base-content disabled:opacity-30"
        :title="t('lyrics.zoomOut')"
        :aria-label="t('lyrics.zoomOut')"
        :disabled="lyrics.fontScale <= 0.8"
        @click="lyrics.adjustFontScale(-lyrics.fontStep)"
      >
        <ZoomOut :size="12" />
      </button>
      <button
        class="fx-noise rounded-field p-1 hover:bg-base-content/10 hover:text-base-content disabled:opacity-30"
        :title="t('lyrics.zoomIn')"
        :aria-label="t('lyrics.zoomIn')"
        :disabled="lyrics.fontScale >= 2"
        @click="lyrics.adjustFontScale(lyrics.fontStep)"
      >
        <ZoomIn :size="12" />
      </button>

      <span class="mx-1 h-4 w-px bg-base-content/15" aria-hidden="true" />

      <button
        class="fx-noise rounded-field p-1 hover:bg-base-content/10 hover:text-base-content"
        :title="t('lyrics.earlier')"
        :aria-label="t('lyrics.earlier')"
        @click="lyrics.adjustDelay(-lyrics.stepMs)"
      >
        <Minus :size="12" />
      </button>
      <button
        class="fx-noise min-w-16 rounded-field px-2 py-0.5 font-mono tabular-nums hover:bg-base-content/10 hover:text-base-content"
        :title="t('lyrics.resetOffset')"
        :aria-label="t('lyrics.resetOffset')"
        @click="lyrics.resetDelay()"
      >
        {{ formatLyricsDelay(lyrics.delayMs) }}
      </button>
      <button
        class="fx-noise rounded-field p-1 hover:bg-base-content/10 hover:text-base-content"
        :title="t('lyrics.later')"
        :aria-label="t('lyrics.later')"
        @click="lyrics.adjustDelay(lyrics.stepMs)"
      >
        <Plus :size="12" />
      </button>
      <button
        class="fx-noise ml-1 rounded-field p-1 hover:bg-base-content/10 hover:text-base-content"
        :title="t('lyrics.resetOffset')"
        :aria-label="t('lyrics.resetOffset')"
        @click="lyrics.resetDelay()"
      >
        <RotateCcw :size="11" />
      </button>
    </footer>
  </div>
</template>

<style scoped>
.lyrics-swap-enter-active,
.lyrics-swap-leave-active {
  transition:
    opacity 220ms ease,
    transform 220ms ease;
}
.lyrics-swap-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.lyrics-swap-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
