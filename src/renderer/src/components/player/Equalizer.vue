<script setup lang="ts">
import { usePlayerStore } from '@renderer/stores/player'
import { useMediaPlayer } from '@renderer/composables/useMediaPlayer'
import { RotateCcw } from '@lucide/vue'

const player = usePlayerStore()
const { setEqualizerBand, applyEqPreset } = useMediaPlayer()

const presets: Record<string, Record<number, number>> = {
  flat: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 },
  pop: { 0: -1, 1: 2, 2: 4, 3: 4, 4: 2, 5: -1, 6: -1, 7: -1, 8: 2, 9: 2 },
  rock: { 0: 5, 1: 3, 2: -2, 3: -4, 4: -2, 5: 2, 6: 5, 7: 6, 8: 6, 9: 5 },
  jazz: { 0: 3, 1: 2, 2: 0, 3: 2, 4: -2, 5: -2, 6: 0, 7: 2, 8: 3, 9: 4 },
  classical: { 0: 4, 1: 3, 2: 2, 3: 1, 4: -1, 5: -1, 6: 0, 7: 2, 8: 3, 9: 4 },
  bassBoost: { 0: 8, 1: 6, 2: 4, 3: 2, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 },
  trebleBoost: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 2, 6: 4, 7: 6, 8: 8, 9: 8 },
  vocal: { 0: -2, 1: -3, 2: -3, 3: 1, 4: 4, 5: 4, 6: 3, 7: 1, 8: 0, 9: -2 }
}

const presetLabels: Record<string, string> = {
  flat: 'Flat',
  pop: 'Pop',
  rock: 'Rock',
  jazz: 'Jazz',
  classical: 'Klasyka',
  bassBoost: 'Bas',
  trebleBoost: 'Wysokie',
  vocal: 'Wokal'
}

const bandLabels = ['32', '64', '125', '250', '500', '1K', '2K', '4K', '8K', '16K']

function onBandChange(index: number, value: number) {
  setEqualizerBand(index, value)
}

function selectPreset(name: string) {
  player.equalizerPreset = name
  applyEqPreset(presets[name])
}

function onSliderDrag(e: MouseEvent, index: number) {
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  function update(ev: MouseEvent) {
    const pct = 1 - Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height))
    const val = Math.round(pct * 24 - 12)
    onBandChange(index, val)
  }
  update(e)
  function onMove(ev: MouseEvent) {
    update(ev)
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}
</script>

<template>
  <div class="bg-bg-elevated border border-border-default rounded-2xl p-4 w-[380px]">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-sm font-semibold">Equalizer</h3>
      <button
        class="p-1.5 rounded-lg text-fg-faint hover:bg-bg-hover hover:text-fg-base transition-colors"
        title="Reset"
        @click="selectPreset('flat')"
      >
        <RotateCcw :size="14" />
      </button>
    </div>

    <!-- presets -->
    <div class="flex flex-wrap gap-1.5 mb-5">
      <button
        v-for="(_, name) in presets"
        :key="name"
        class="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors"
        :class="
          player.equalizerPreset === name
            ? 'bg-accent-base text-white'
            : 'bg-bg-overlay text-fg-muted hover:bg-bg-hover'
        "
        @click="selectPreset(name)"
      >
        {{ presetLabels[name] || name }}
      </button>
    </div>

    <!-- bands -->
    <div class="flex gap-2 h-48">
      <div v-for="(label, i) in bandLabels" :key="i" class="flex-1 flex flex-col items-center">
        <span
          class="text-[10px] text-fg-muted font-mono tabular-nums mb-1.5 h-4 leading-4 select-none"
        >
          {{ player.equalizerBands[i] > 0 ? '+' : '' }}{{ player.equalizerBands[i] }}
        </span>
        <div class="flex-1 w-full relative cursor-pointer" @mousedown="onSliderDrag($event, i)">
          <!-- track background — wider, high contrast -->
          <div
            class="absolute w-[5px] h-full rounded-full bg-bg-active"
            style="left: 50%; transform: translateX(-50%)"
          />
          <!-- filled portion from center -->
          <div
            class="absolute w-[5px] rounded-full bg-accent-base"
            style="left: 50%; transform: translateX(-50%)"
            :style="
              player.equalizerBands[i] >= 0
                ? {
                    top: ((12 - player.equalizerBands[i]) / 24) * 100 + '%',
                    height: (Math.abs(player.equalizerBands[i]) / 24) * 100 + '%'
                  }
                : { top: '50%', height: (Math.abs(player.equalizerBands[i]) / 24) * 100 + '%' }
            "
          />
          <!-- center line -->
          <div
            class="absolute w-3 h-[2px] rounded-full bg-fg-faint/70"
            style="left: 50%; transform: translateX(-50%); top: 50%"
          />
          <!-- thumb -->
          <div
            class="absolute w-4 h-4 rounded-full bg-accent-base border-2 border-white shadow-md transition-all duration-75"
            :style="{
              left: '50%',
              top: ((12 - player.equalizerBands[i]) / 24) * 100 + '%',
              transform: 'translate(-50%, -50%)'
            }"
          />
        </div>
        <span class="text-[9px] text-fg-muted mt-1.5 h-3 leading-3 select-none">{{ label }}</span>
      </div>
    </div>
  </div>
</template>
