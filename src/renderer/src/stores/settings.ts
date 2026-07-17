import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  AppSettings,
  AppearanceSettings,
  PlaybackSettings,
  DownloadSettings,
  DependencyStatus
} from '@renderer/types/settings'
import {
  DEFAULT_APPEARANCE,
  DEFAULT_PLAYBACK,
  DEFAULT_DOWNLOAD,
  DEFAULT_SHORTCUTS
} from '@renderer/utils/constants'

export const useSettingsStore = defineStore('settings', () => {
  const appearance = ref<AppearanceSettings>({ ...DEFAULT_APPEARANCE })
  const playback = ref<PlaybackSettings>({ ...DEFAULT_PLAYBACK })
  const download = ref<DownloadSettings>({ ...DEFAULT_DOWNLOAD })
  const shortcuts = ref<Record<string, string>>({ ...DEFAULT_SHORTCUTS })
  const dependencies = ref<Record<string, DependencyStatus>>({})
  const isLoaded = ref(false)

  const cssVariables = computed(() => ({
    '--accent-color': appearance.value.accentColor,
    '--font-size': `${appearance.value.fontSize}px`
  }))

  async function load() {
    try {
      if (window.api) {
        const data = (await window.api.invoke('settings:get')) as Partial<AppSettings>
        if (data.appearance) appearance.value = data.appearance
        if (data.playback) playback.value = data.playback
        if (data.download) download.value = data.download
        if (data.shortcuts) shortcuts.value = data.shortcuts
        if (data.dependencies) dependencies.value = data.dependencies
      }
    } catch {
      // use defaults
    }
    isLoaded.value = true
  }

  async function save() {
    try {
      if (window.api) {
        await window.api.invoke('settings:set', {
          appearance: appearance.value,
          playback: playback.value,
          download: download.value,
          shortcuts: shortcuts.value,
          dependencies: dependencies.value
        })
      }
    } catch {
      // silent fail
    }
  }

  function updateAppearance(partial: Partial<AppearanceSettings>) {
    Object.assign(appearance.value, partial)
    save()
  }

  function updatePlayback(partial: Partial<PlaybackSettings>) {
    Object.assign(playback.value, partial)
    save()
  }

  function updateDownload(partial: Partial<DownloadSettings>) {
    Object.assign(download.value, partial)
    save()
  }

  function updateShortcut(action: string, key: string) {
    shortcuts.value[action] = key
    save()
  }

  function resetToDefaults() {
    appearance.value = { ...DEFAULT_APPEARANCE }
    playback.value = { ...DEFAULT_PLAYBACK }
    download.value = { ...DEFAULT_DOWNLOAD }
    shortcuts.value = { ...DEFAULT_SHORTCUTS }
    dependencies.value = {}
    save()
  }

  function updateDependency(name: string, status: Omit<DependencyStatus, 'name'>) {
    dependencies.value[name] = { name, ...status }
    save()
  }

  function getDependency(name: string): DependencyStatus | undefined {
    return dependencies.value[name]
  }

  return {
    appearance,
    playback,
    download,
    shortcuts,
    dependencies,
    isLoaded,
    cssVariables,
    load,
    save,
    updateAppearance,
    updatePlayback,
    updateDownload,
    updateShortcut,
    resetToDefaults,
    updateDependency,
    getDependency
  }
})
