<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch } from 'vue'
import TitleBar from './components/layout/TitleBar.vue'
import TopMenu from './components/layout/TopMenu.vue'
import Sidebar from './components/layout/Sidebar.vue'
import PlayerBar from './components/layout/PlayerBar.vue'
import StatusBar from './components/layout/StatusBar.vue'
import QueuePanel from './components/player/QueuePanel.vue'
import Equalizer from './components/player/Equalizer.vue'
import { useSettingsStore } from './stores/settings'
import { usePlayerStore } from './stores/player'
import { useUIStore } from './stores/ui'
import { moduleManager } from './modules/ModuleManager'
import { THEME_PALETTES } from './utils/constants'

const settings = useSettingsStore()
const player = usePlayerStore()
const ui = useUIStore()

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null
}

function applyTheme() {
  const root = document.documentElement
  const theme = settings.appearance.theme
  const accent = settings.appearance.accentColor
  const fontSize = settings.appearance.fontSize

  const palette = THEME_PALETTES[theme] || THEME_PALETTES.dark
  root.style.setProperty('--color-bg-base', palette.bgBase)
  root.style.setProperty('--color-bg-surface', palette.bgSurface)
  root.style.setProperty('--color-bg-overlay', palette.bgOverlay)
  root.style.setProperty('--color-bg-elevated', palette.bgElevated)
  root.style.setProperty('--color-bg-hover', palette.bgHover)
  root.style.setProperty('--color-bg-active', palette.bgActive)
  root.style.setProperty('--color-border-default', palette.borderDefault)
  root.style.setProperty('--color-border-subtle', palette.borderSubtle)
  root.style.setProperty('--color-fg-base', palette.fgBase)
  root.style.setProperty('--color-fg-muted', palette.fgMuted)
  root.style.setProperty('--color-fg-faint', palette.fgFaint)

  root.style.setProperty('--color-accent-base', accent)
  const rgb = hexToRgb(accent)
  if (rgb) {
    root.style.setProperty(
      '--color-accent-hover',
      `rgba(${Math.min(255, rgb.r + 20)}, ${Math.min(255, rgb.g + 20)}, ${Math.min(255, rgb.b + 20)}, 1)`
    )
    root.style.setProperty(
      '--color-accent-strong',
      `rgba(${Math.max(0, rgb.r - 20)}, ${Math.max(0, rgb.g - 20)}, ${Math.max(0, rgb.b - 20)}, 1)`
    )
    root.style.setProperty('--color-accent-ghost', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.10)`)
  }

  root.style.setProperty('--font-size', `${fontSize}px`)
  root.style.fontSize = `${fontSize}px`
}

onMounted(() => {
  settings.load().then(() => applyTheme())
  if (!moduleManager.getActive()) {
    moduleManager.switchTo('home')
  }
})

onBeforeUnmount(() => {
  moduleManager.deactivateAll()
})

watch(() => settings.appearance.theme, applyTheme)
watch(() => settings.appearance.accentColor, applyTheme)
watch(() => settings.appearance.fontSize, applyTheme)
</script>

<template>
  <div class="flex flex-col h-full w-full overflow-hidden">
    <TitleBar />
    <TopMenu v-if="ui.topMenuVisible" />
    <div class="flex flex-1 min-h-0">
      <Sidebar v-if="ui.sidebarExpanded && settings.appearance.sidebarPosition === 'left'" />
      <main class="flex-1 min-w-0 overflow-auto">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
      <QueuePanel v-if="player.queueVisible" class="w-75 shrink-0" />
      <Sidebar v-if="ui.sidebarExpanded && settings.appearance.sidebarPosition === 'right'" />
      <div v-if="player.equalizerVisible" class="fixed bottom-24 right-6 z-40">
        <Equalizer />
      </div>
    </div>
    <PlayerBar v-if="ui.playerBarVisible && player.currentTrack?.type === 'audio'" />
    <StatusBar v-if="ui.statusBarVisible" />

    <div
      v-if="ui.contextMenu"
      class="fixed z-50 bg-bg-elevated border border-border-subtle rounded-xl shadow-2xl shadow-black/50 py-1.5 min-w-45"
      :style="{ left: ui.contextMenu.x + 'px', top: ui.contextMenu.y + 'px' }"
      @click="ui.hideContextMenu"
    >
      <template v-for="item in ui.contextMenu.items" :key="item.label">
        <div v-if="item.separator" class="border-t border-border-default my-1 mx-2" />
        <button
          v-else
          class="w-full px-3 py-1.5 text-left text-sm hover:bg-accent-ghost hover:text-accent-base transition-colors"
          :class="{ 'opacity-40 pointer-events-none': item.disabled }"
          @click="
            item.action?.();
            ui.hideContextMenu()
          "
        >
          {{ item.label }}
        </button>
      </template>
    </div>
  </div>
</template>

<style>
.page-enter-active,
.page-leave-active {
  transition: opacity 0.12s ease;
}
.page-enter-from,
.page-leave-to {
  opacity: 0;
}
</style>
