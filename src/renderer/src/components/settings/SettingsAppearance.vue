<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings';
import { RotateCcw, PanelLeftOpen, PanelRightOpen } from '@lucide/vue';

const settings = useSettingsStore();

const themes: { id: (typeof settings.appearance.theme); labelKey?: string; label: string; bg: string; fg: string }[] = [
  { id: 'dark', labelKey: 'settings.dark', label: 'Ciemny', bg: '#0f0f17', fg: '#e8e8f0' },
  { id: 'light', labelKey: 'settings.light', label: 'Jasny', bg: '#f8f8fa', fg: '#1a1a2e' },
  { id: 'midnight', label: 'Midnight', bg: '#0d1117', fg: '#c9d1d9' },
  { id: 'spotify', label: 'Spotify', bg: '#121212', fg: '#b3b3b3' }
];

const accentColors = [
  '#7c6aef',
  '#3b82f6',
  '#34d399',
  '#fbbf24',
  '#f87171',
  '#ec4899',
  '#8b5cf6',
  '#06b6d4'
];
</script>

<template>
  <div class="space-y-8 max-w-2xl">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-bold">{{ $t('settings.appearanceSection') }}</h2>
      <button
        class="p-1.5 rounded-lg text-fg-faint hover:bg-bg-hover transition-colors"
        @click="settings.resetToDefaults"
      >
        <RotateCcw :size="14" />
      </button>
    </div>

    <div>
      <h3 class="text-sm font-semibold mb-3">{{ $t('settings.theme') }}</h3>
      <div class="grid grid-cols-4 gap-3">
        <button
          v-for="th in themes"
          :key="th.id"
          class="p-3 rounded-xl border-2 transition-all text-center"
          :class="
            settings.appearance.theme === th.id
              ? 'border-accent-base shadow-lg shadow-accent-base/20'
              : 'border-border-default hover:border-border-subtle'
          "
          @click="settings.updateAppearance({ theme: th.id })"
        >
          <div
            class="w-full h-8 rounded-lg mb-2 flex items-center justify-center"
            :style="{ backgroundColor: th.bg }"
          >
            <div class="w-6 h-1 rounded-full" style="background: #7c6aef" />
          </div>
          <span class="text-xs text-fg-muted">{{ th.labelKey ? $t(th.labelKey) : th.label }}</span>
        </button>
      </div>
    </div>

    <div>
      <h3 class="text-sm font-semibold mb-3">{{ $t('settings.accentColor') }}</h3>
      <div class="flex gap-2">
        <button
          v-for="c in accentColors"
          :key="c"
          class="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110"
          :class="
            settings.appearance.accentColor === c ? 'border-white scale-110' : 'border-transparent'
          "
          :style="{ backgroundColor: c }"
          @click="settings.updateAppearance({ accentColor: c })"
        />
      </div>
    </div>

    <div>
      <h3 class="text-sm font-semibold mb-3">
        {{ $t('settings.fontSize') }}: {{ settings.appearance.fontSize }}px
      </h3>
      <input
        type="range"
        min="12"
        max="18"
        :value="settings.appearance.fontSize"
        class="w-full"
        @input="
          settings.updateAppearance({
            fontSize: parseInt(($event.target as HTMLInputElement).value)
          })
        "
      />
    </div>

    <div>
      <h3 class="text-sm font-semibold mb-3">{{ $t('settings.density') }}</h3>
      <div class="flex gap-2">
        <button
          v-for="d in ['compact', 'comfortable', 'spacious'] as const"
          :key="d"
          class="px-4 py-2 rounded-xl text-sm capitalize border transition-colors"
          :class="
            settings.appearance.density === d
              ? 'border-accent-base bg-accent-ghost text-accent-base font-medium'
              : 'border-border-default text-fg-muted hover:bg-bg-hover'
          "
          @click="settings.updateAppearance({ density: d })"
        >
          {{ $t('settings.' + d) }}
        </button>
      </div>
    </div>

    <div>
      <h3 class="text-sm font-semibold mb-3">{{ $t('settings.sidebarPosition') }}</h3>
      <div class="w-48 h-36 rounded-2xl bg-bg-elevated border-2 border-border-default p-2 relative select-none">
        <div class="grid grid-cols-2 gap-2 w-full h-full">
          <button
            v-for="pos in ['left', 'right'] as const"
            :key="pos"
            class="rounded-xl text-[11px] font-medium transition-all border-2 flex flex-col items-center justify-center gap-1"
            :class="settings.appearance.sidebarPosition === pos
              ? 'border-accent-base bg-accent-ghost text-accent-base shadow-sm shadow-accent-base/20'
              : 'border-transparent text-fg-faint hover:bg-bg-hover hover:text-fg-muted'"
            @click="settings.updateAppearance({ sidebarPosition: pos })"
          >
            <component :is="pos === 'left' ? PanelLeftOpen : PanelRightOpen" :size="18" />
            <span>{{ $t('settings.' + pos) }}</span>
          </button>
        </div>
        <div class="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div class="w-5 h-5 rounded border-2 border-dashed border-fg-faint/20" />
        </div>
      </div>
      <p class="text-[11px] text-fg-faint mt-2">
        {{ $t('settings.selected') }} <span class="text-fg-base font-medium">{{ $t('settings.' + settings.appearance.sidebarPosition) }}</span>
      </p>
    </div>
  </div>
</template>
