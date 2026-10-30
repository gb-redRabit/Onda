<script setup lang="ts">
import {
  RotateCcw,
  Plus,
  SlidersHorizontal,
  Power,
  Download,
  Upload,
  Save,
  Palette,
  Magnet,
  Combine,
  Moon
} from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { ref } from 'vue';
import { EQUALIZER_PRESETS } from '@renderer/utils/constants/audio';
import { freqToRatio } from '@renderer/utils/eqCurve';
import {
  EQ_CURVE as CURVE,
  EQ_GRID_DBS as GRID_DBS,
  EQ_GRID_FREQS as GRID_FREQS,
  bandX,
  bandY,
  dbToY,
  markerRadius
} from '@renderer/utils/eqGeometry';
import EqBandRow from './EqBandRow.vue';
import ExplorerPromptDialog from '@renderer/components/explorer/ExplorerPromptDialog.vue';
import { useEqualizerPanel } from '@renderer/composables/useEqualizerPanel';

const { t } = useI18n();

// Refy DOM wiązane przez `ref="panel"` / `ref="curveEl"` w szablonie —
// composable dostaje je gotowe i używa w onClickOutside / timeFromEvent.
const panel = ref<HTMLElement | null>(null);
const curveEl = ref<HTMLElement | null>(null);

// Szablon korzysta z tych samych nazw co wcześniej — logika jest w composable.
const {
  showControls,
  menuBand,
  fx,
  audio,
  prompt,
  bandTypes,
  limits,
  presetLabels,
  bands,
  color,
  solo,
  toggleSolo,
  userPresets,
  activePreset,
  curvePath,
  zeroLineY,
  spectrumPath,
  draggingBand,
  hoverBand,
  menuBelow,
  onCurveDown,
  onCurveMove,
  onCurveUp,
  onCurveDblClick,
  onMarkerDblClick,
  onMarkerContext,
  selectPreset,
  setType,
  patchBand,
  addBand,
  removeBand,
  typeLabel,
  naming,
  presetName,
  canSavePreset,
  savePreset,
  confirmSavePreset,
  deletePreset,
  exportEq,
  importEq
} = useEqualizerPanel({ panel, curveEl });
</script>

<template>
  <div
    ref="panel"
    data-testid="equalizer"
    class="bg-base-100 border border-base-300 rounded-box p-4 w-135 max-w-[95vw]"
  >
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-1.5">
        <button
          class="fx-noise p-1.5 fx-depth rounded-field transition-colors"
          :class="fx.equalizerEnabled ? 'text-primary-text' : 'text-base-content/55'"
          data-testid="eq-power"
          :title="fx.equalizerEnabled ? $t('equalizer.disable') : $t('equalizer.enable')"
          :aria-label="fx.equalizerEnabled ? $t('equalizer.disable') : $t('equalizer.enable')"
          :aria-pressed="fx.equalizerEnabled"
          @click="audio.setEqEnabled(!fx.equalizerEnabled)"
        >
          <Power :size="14" />
        </button>
        <h3 class="text-sm font-semibold">{{ $t('equalizer.title') }}</h3>
      </div>
      <div class="flex items-center gap-1">
        <button
          class="fx-noise p-1.5 fx-depth rounded-field transition-colors"
          :class="fx.equalizerMono ? 'text-primary-text' : 'text-base-content/50'"
          data-testid="eq-mono"
          :title="$t('equalizer.mono')"
          :aria-label="$t('equalizer.mono')"
          :aria-pressed="fx.equalizerMono"
          @click="audio.setEqMono(!fx.equalizerMono)"
        >
          <Combine :size="14" />
        </button>
        <button
          class="fx-noise p-1.5 fx-depth rounded-field transition-colors"
          :class="fx.nightMode ? 'text-primary-text' : 'text-base-content/50'"
          data-testid="eq-night"
          :title="$t('player.nightMode')"
          :aria-label="$t('player.nightMode')"
          :aria-pressed="fx.nightMode"
          @click="audio.setNightMode(!fx.nightMode)"
        >
          <Moon :size="14" />
        </button>
        <button
          class="fx-noise p-1.5 fx-depth rounded-field transition-colors"
          :class="fx.equalizerSnap ? 'text-primary-text' : 'text-base-content/50'"
          data-testid="eq-snap"
          :title="$t('equalizer.snap')"
          :aria-label="$t('equalizer.snap')"
          :aria-pressed="fx.equalizerSnap"
          @click="audio.setEqSnap(!fx.equalizerSnap)"
        >
          <Magnet :size="14" />
        </button>
        <button
          class="fx-noise p-1.5 fx-depth rounded-field transition-colors"
          :class="fx.equalizerMulticolor ? 'text-primary-text' : 'text-base-content/50'"
          data-testid="eq-multicolor"
          :title="$t('equalizer.multicolor')"
          :aria-label="$t('equalizer.multicolor')"
          :aria-pressed="fx.equalizerMulticolor"
          @click="audio.setEqMulticolor(!fx.equalizerMulticolor)"
        >
          <Palette :size="14" />
        </button>
        <button
          class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:bg-base-content/10 hover:text-base-content transition-colors disabled:opacity-30"
          data-testid="eq-add-band"
          :title="$t('equalizer.addBand')"
          :aria-label="$t('equalizer.addBand')"
          :disabled="bands.length >= limits.maxBands"
          @click="addBand"
        >
          <Plus :size="14" />
        </button>
        <button
          class="fx-noise p-1.5 fx-depth rounded-field transition-colors"
          :class="showControls ? 'text-primary-text' : 'text-base-content/50'"
          data-testid="eq-toggle-controls"
          :title="showControls ? $t('equalizer.hideControls') : $t('equalizer.showControls')"
          :aria-label="showControls ? $t('equalizer.hideControls') : $t('equalizer.showControls')"
          @click="showControls = !showControls"
        >
          <SlidersHorizontal :size="14" />
        </button>
        <button
          class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:bg-base-content/10 hover:text-base-content transition-colors"
          :title="$t('equalizer.reset')"
          :aria-label="$t('equalizer.reset')"
          @click="selectPreset('flat')"
        >
          <RotateCcw :size="14" />
        </button>
      </div>
    </div>

    <!-- preamp -->
    <div class="flex items-center gap-2 mb-3">
      <span class="text-2xs text-base-content/50 shrink-0">{{ $t('equalizer.preamp') }}</span>
      <input
        type="range"
        min="-12"
        max="12"
        step="1"
        :value="fx.equalizerPreamp"
        data-testid="eq-preamp"
        :aria-label="$t('equalizer.preamp')"
        class="flex-1 h-1 cursor-pointer accent-primary"
        @input="audio.setEqPreamp(Number(($event.target as HTMLInputElement).value))"
      />
      <span class="w-14 text-right text-2xs font-mono tabular-nums text-base-content/70"
        >{{ fx.equalizerPreamp > 0 ? '+' : '' }}{{ fx.equalizerPreamp }}
        {{ $t('equalizer.db') }}</span
      >
    </div>

    <!-- opóźnienie dźwięku (kompensacja lip-sync) -->
    <div class="flex items-center gap-2 mb-3">
      <span class="text-2xs text-base-content/50 shrink-0">{{ $t('equalizer.audioDelay') }}</span>
      <input
        type="range"
        min="0"
        max="500"
        step="10"
        :value="fx.audioDelayMs"
        data-testid="eq-audio-delay"
        :aria-label="$t('equalizer.audioDelay')"
        class="flex-1 h-1 cursor-pointer accent-primary"
        @input="audio.setAudioDelay(Number(($event.target as HTMLInputElement).value))"
      />
      <span class="w-14 text-right text-2xs font-mono tabular-nums text-base-content/70"
        >{{ fx.audioDelayMs }} {{ $t('equalizer.ms') }}</span
      >
    </div>

    <!-- presety (wbudowane + własne) -->
    <div class="flex flex-wrap gap-1.5 mb-3">
      <button
        v-for="(_, name) in EQUALIZER_PRESETS"
        :key="name"
        :data-testid="'eq-preset-' + name"
        class="fx-noise px-2.5 py-1 fx-depth rounded-field text-2xs font-medium transition-colors"
        :class="
          activePreset === name
            ? 'bg-primary text-primary-content'
            : 'bg-base-300 text-base-content/70 hover:bg-base-content/10'
        "
        @click="selectPreset(name)"
      >
        {{ presetLabels[name] || name }}
      </button>
      <button
        v-for="(_, name) in userPresets"
        :key="'u-' + name"
        :data-testid="'eq-user-preset-' + name"
        class="fx-noise px-2.5 py-1 fx-depth rounded-field text-2xs font-medium transition-colors border border-primary/40"
        :class="
          activePreset === name
            ? 'bg-primary text-primary-content'
            : 'bg-primary/10 text-primary-text'
        "
        @click="selectPreset(name)"
        @contextmenu.prevent="deletePreset(name)"
      >
        {{ name }}
      </button>
      <span
        v-if="activePreset === 'custom'"
        data-testid="eq-preset-custom"
        class="px-2.5 py-1 rounded-field text-2xs font-medium bg-primary/15 text-primary-text border border-primary/40"
      >
        {{ $t('equalizer.custom') }}
      </span>
      <button
        class="fx-noise px-2 py-1 fx-depth rounded-field text-2xs text-base-content/60 hover:text-base-content transition-colors"
        data-testid="eq-save-preset"
        :title="$t('equalizer.savePreset')"
        @click="savePreset"
      >
        <Save :size="12" />
      </button>
      <button
        class="fx-noise px-2 py-1 fx-depth rounded-field text-2xs text-base-content/60 hover:text-base-content transition-colors"
        data-testid="eq-export"
        :title="$t('equalizer.export')"
        @click="exportEq"
      >
        <Download :size="12" />
      </button>
      <button
        class="fx-noise px-2 py-1 fx-depth rounded-field text-2xs text-base-content/60 hover:text-base-content transition-colors"
        data-testid="eq-import"
        :title="$t('equalizer.import')"
        @click="importEq"
      >
        <Upload :size="12" />
      </button>
    </div>

    <!-- nazwa nowego presetu (zamiast window.prompt, którego Electron nie wspiera) -->
    <div
      v-if="naming"
      class="flex items-center gap-2 mb-3"
      data-testid="eq-preset-name"
      @keydown.esc="naming = false"
    >
      <input
        v-model="presetName"
        type="text"
        :aria-label="$t('equalizer.presetName')"
        :placeholder="$t('equalizer.presetName')"
        class="flex-1 min-w-0 px-2 py-1 rounded-field bg-base-100 border border-base-300 text-xs focus:border-primary focus:outline-hidden"
        data-testid="eq-preset-name-input"
        @keydown.enter="confirmSavePreset"
      />
      <button
        type="button"
        class="fx-noise px-2.5 py-1 fx-depth rounded-field bg-primary text-primary-content text-2xs font-medium transition-colors disabled:opacity-40"
        :disabled="!canSavePreset"
        data-testid="eq-preset-name-confirm"
        @click="confirmSavePreset"
      >
        {{ $t('equalizer.savePreset') }}
      </button>
      <button
        type="button"
        class="fx-noise px-2.5 py-1 fx-depth rounded-field bg-base-300 text-base-content/70 text-2xs font-medium transition-colors"
        data-testid="eq-preset-name-cancel"
        @click="naming = false"
      >
        {{ $t('common.cancel') }}
      </button>
    </div>

    <!-- krzywa -->
    <div
      ref="curveEl"
      class="relative z-30 rounded-field border border-base-300 bg-base-200/(--glass-alpha) mb-3"
      data-testid="eq-curve"
      @dblclick="onCurveDblClick"
    >
      <svg
        :viewBox="`0 0 ${CURVE.width} ${CURVE.height}`"
        preserveAspectRatio="none"
        class="w-full h-32 block"
        aria-hidden="true"
      >
        <!-- siatka dB -->
        <line
          v-for="db in GRID_DBS"
          :key="'d' + db"
          x1="0"
          :y1="dbToY(db)"
          :x2="CURVE.width"
          :y2="dbToY(db)"
          class="stroke-base-content/10"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
        />
        <!-- siatka częstotliwości -->
        <line
          v-for="f in GRID_FREQS"
          :key="'f' + f"
          :x1="(freqToRatio(f, CURVE.minFreq, CURVE.maxFreq) * CURVE.width).toFixed(1)"
          y1="0"
          :x2="(freqToRatio(f, CURVE.minFreq, CURVE.maxFreq) * CURVE.width).toFixed(1)"
          :y2="CURVE.height"
          class="stroke-base-content/10"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
        />
        <line
          x1="0"
          :y1="zeroLineY"
          :x2="CURVE.width"
          :y2="zeroLineY"
          class="stroke-base-content/25"
          stroke-width="1"
          stroke-dasharray="3 3"
          vector-effect="non-scaling-stroke"
        />
        <path v-if="spectrumPath" :d="spectrumPath" class="fill-base-content/10" stroke="none" />
        <path
          :d="curvePath"
          fill="none"
          class="stroke-primary-text"
          stroke-width="2"
          vector-effect="non-scaling-stroke"
        />
      </svg>

      <!-- etykiety siatki -->
      <span class="absolute left-1 top-0.5 text-3xs text-base-content/55">+18</span>
      <span class="absolute left-1 bottom-0.5 text-3xs text-base-content/55">-18</span>
      <span
        v-for="f in GRID_FREQS"
        :key="'lf' + f"
        class="absolute bottom-0.5 text-3xs text-base-content/55 -translate-x-1/2"
        :style="{ left: freqToRatio(f, CURVE.minFreq, CURVE.maxFreq) * 100 + '%' }"
        >{{ f >= 1000 ? f / 1000 + 'k' : f }}</span
      >

      <!-- kropki pasm -->
      <button
        v-for="(band, i) in bands"
        :key="'m' + i"
        type="button"
        class="absolute w-5 h-5 flex items-center justify-center text-3xs font-bold text-base-100 shadow cursor-grab active:cursor-grabbing"
        :style="{
          left: bandX(band.frequency) + '%',
          top: bandY(band.gain + fx.equalizerPreamp) + '%',
          backgroundColor: color(i),
          borderRadius: markerRadius(band.type),
          opacity: band.enabled === false ? 0.35 : 1,
          transform: `translate(-50%, -50%) scale(${hoverBand === i || draggingBand === i ? 1.3 : 1})`,
          zIndex: hoverBand === i || draggingBand === i ? 5 : 1
        }"
        :title="typeLabel(band.type)"
        :aria-label="`${t('equalizer.band')} ${i + 1} — ${typeLabel(band.type)}`"
        @pointerdown="(e: PointerEvent) => onCurveDown(i, e)"
        @pointermove="onCurveMove"
        @pointerup="onCurveUp"
        @pointercancel="onCurveUp"
        @dblclick.stop="onMarkerDblClick(i)"
        @contextmenu="onMarkerContext($event, i)"
        @mouseenter="hoverBand = i"
        @mouseleave="hoverBand = null"
      >
        {{ i + 1 }}
      </button>

      <!-- menu kontekstowe kropki -->
      <div
        v-if="menuBand !== null"
        class="absolute z-50 w-36 p-1 rounded-field border border-base-300 bg-base-100 fx-depth text-2xs"
        :style="{
          left: bandX(bands[menuBand].frequency) + '%',
          top: bandY(bands[menuBand].gain + fx.equalizerPreamp) + '%',
          transform: menuBelow ? 'translate(-50%, 14px)' : 'translate(-50%, calc(-100% - 14px))'
        }"
        @click.stop
      >
        <button
          v-for="tp in bandTypes"
          :key="tp"
          class="w-full text-left px-2 py-1 rounded-field hover:bg-base-content/10 transition-colors"
          :class="{ 'text-primary-text': bands[menuBand].type === tp }"
          @click="setType(menuBand, tp)"
        >
          {{ typeLabel(tp) }}
        </button>
        <div class="my-0.5 border-t border-base-300" />
        <button
          class="w-full text-left px-2 py-1 rounded-field text-error hover:bg-base-content/10 transition-colors"
          :disabled="bands.length <= 1"
          @click="removeBand(menuBand)"
        >
          {{ $t('equalizer.removeBand') }}
        </button>
      </div>
    </div>

    <!-- pasma -->
    <div v-if="showControls" class="space-y-2 max-h-72 overflow-auto pr-1">
      <EqBandRow
        v-for="(band, i) in bands"
        :key="i"
        :band="band"
        :index="i"
        :color="color(i)"
        :soloed="solo === i"
        :hovered="hoverBand === i"
        :can-remove="bands.length > 1"
        :snap-enabled="fx.equalizerSnap"
        :band-types="bandTypes"
        :type-label="typeLabel"
        @patch="(patch) => patchBand(i, patch)"
        @toggle-solo="toggleSolo(i)"
        @remove="removeBand(i)"
        @mouseenter="hoverBand = i"
        @mouseleave="hoverBand = null"
      />
    </div>

    <ExplorerPromptDialog
      :visible="prompt.promptVisible.value"
      :is-confirm="prompt.promptIsConfirm.value"
      :message="prompt.promptMessage.value"
      :value="prompt.promptValue.value"
      @update:value="prompt.promptValue.value = $event"
      @confirm="prompt.promptConfirm"
      @cancel="prompt.promptCancel"
    />
  </div>
</template>
