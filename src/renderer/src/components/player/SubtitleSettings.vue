<script setup lang="ts">
import { usePlayerStore } from '@renderer/stores/player'
import { Settings } from '@lucide/vue'

const player = usePlayerStore()

const fontOptions = [
  'Arial',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Georgia',
  'Trebuchet MS'
]
const positionOptions = [
  { label: 'Dół', value: 'bottom' as const },
  { label: 'Środek', value: 'center' as const },
  { label: 'Góra', value: 'top' as const }
]
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-2 text-xs text-fg-muted">
      <Settings :size="14" />
      <span>Ustawienia napisów</span>
    </div>

    <div class="space-y-2.5">
      <!-- font size -->
      <div>
        <label class="text-[11px] text-fg-faint mb-1 block">
          Rozmiar czcionki: {{ player.subtitleSettings.fontSize }}px
        </label>
        <input
          v-model.number="player.subtitleSettings.fontSize"
          type="range"
          min="12"
          max="48"
          step="1"
          class="w-full h-1 bg-white/20 rounded-full appearance-none cursor-pointer accent-accent-base"
        />
      </div>

      <!-- font family -->
      <div>
        <label class="text-[11px] text-fg-faint mb-1 block">Czcionka</label>
        <select
          v-model="player.subtitleSettings.fontName"
          class="w-full text-sm bg-bg-overlay border border-border-default rounded-lg px-2.5 py-1.5 text-fg-base outline-none focus:border-accent-base"
        >
          <option v-for="font in fontOptions" :key="font" :value="font">{{ font }}</option>
        </select>
      </div>

      <!-- bold / italic -->
      <div class="flex gap-2">
        <button
          class="flex-1 text-xs py-1.5 rounded-lg border transition-colors"
          :class="
            player.subtitleSettings.bold
              ? 'bg-accent-base text-white border-accent-base'
              : 'bg-bg-overlay text-fg-muted border-border-default hover:border-accent-base'
          "
          @click="player.subtitleSettings.bold = !player.subtitleSettings.bold"
        >
          Pogrubienie
        </button>
        <button
          class="flex-1 text-xs py-1.5 rounded-lg border transition-colors"
          :class="
            player.subtitleSettings.italic
              ? 'bg-accent-base text-white border-accent-base'
              : 'bg-bg-overlay text-fg-muted border-border-default hover:border-accent-base'
          "
          @click="player.subtitleSettings.italic = !player.subtitleSettings.italic"
        >
          Kursywa
        </button>
      </div>

      <!-- text color -->
      <div>
        <label class="text-[11px] text-fg-faint mb-1 block">Kolor tekstu</label>
        <div class="flex items-center gap-2">
          <input
            v-model="player.subtitleSettings.textColor"
            type="color"
            class="w-7 h-7 rounded cursor-pointer border-0 bg-transparent"
          />
          <span class="text-xs text-fg-faint font-mono">{{
            player.subtitleSettings.textColor
          }}</span>
        </div>
      </div>

      <!-- bg color + opacity -->
      <div>
        <label class="text-[11px] text-fg-faint mb-1 block">
          Przezroczystość tła: {{ Math.round(player.subtitleSettings.opacity * 100) }}%
        </label>
        <input
          v-model.number="player.subtitleSettings.opacity"
          type="range"
          min="0"
          max="1"
          step="0.05"
          class="w-full h-1 bg-white/20 rounded-full appearance-none cursor-pointer accent-accent-base"
        />
      </div>

      <!-- position -->
      <div>
        <label class="text-[11px] text-fg-faint mb-1 block">Pozycja</label>
        <div class="flex gap-1">
          <button
            v-for="pos in positionOptions"
            :key="pos.value"
            class="flex-1 text-xs py-1.5 rounded-lg border transition-colors"
            :class="
              player.subtitleSettings.position === pos.value
                ? 'bg-accent-base text-white border-accent-base'
                : 'bg-bg-overlay text-fg-muted border-border-default hover:border-accent-base'
            "
            @click="player.subtitleSettings.position = pos.value"
          >
            {{ pos.label }}
          </button>
        </div>
      </div>

      <!-- margin -->
      <div>
        <label class="text-[11px] text-fg-faint mb-1 block">
          Margines: {{ player.subtitleSettings.margin }}px
        </label>
        <input
          v-model.number="player.subtitleSettings.margin"
          type="range"
          min="0"
          max="100"
          step="5"
          class="w-full h-1 bg-white/20 rounded-full appearance-none cursor-pointer accent-accent-base"
        />
      </div>
    </div>
  </div>
</template>
