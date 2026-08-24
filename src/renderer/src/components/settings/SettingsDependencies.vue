<script setup lang="ts">
import { RefreshCw } from '@lucide/vue';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';
import { useDependencies } from '@renderer/composables/useDependencies';

const { deps, refreshAll, runInstall, uninstallDependency, cancelInstall } = useDependencies();
</script>

<template>
  <SettingsPanel :title="$t('settings.depTitle')" :description="$t('settings.depDesc')">
    <template #actions>
      <button
        class="fx-noise flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-medium hover:bg-base-content/10 transition-colors"
        @click="refreshAll"
      >
        <RefreshCw :size="14" />{{ $t('settings.depRefresh') }}
      </button>
    </template>
    <div class="space-y-6">
      <SettingsCard v-for="dep in deps" :key="dep.name">
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-3 min-w-0">
            <div
              class="w-2 h-2 rounded-full shrink-0"
              :class="dep.installed ? 'bg-green-500' : 'bg-red-500'"
            />
            <div class="min-w-0">
              <div class="text-sm font-medium flex items-center gap-2">
                {{ dep.name }}
                <span
                  v-if="dep.managed && dep.installed"
                  class="text-[10px] px-1.5 py-0.5 rounded-field bg-primary/15 text-primary font-medium"
                >
                  {{ $t('settings.depManaged') }}
                </span>
                <span
                  v-else-if="dep.installed"
                  class="text-[10px] px-1.5 py-0.5 rounded-field bg-base-content/10 text-base-content/50 font-medium"
                >
                  {{ $t('settings.depSystem') }}
                </span>
              </div>
              <div class="text-xs text-base-content/50 truncate">{{ dep.description }}</div>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <template v-if="dep.installing">
              <span class="text-xs text-base-content/50 font-mono">{{ dep.percent }}%</span>
              <button
                class="fx-noise px-3 py-1.5 fx-depth rounded-field border border-base-300 text-xs font-medium hover:bg-base-content/10 transition-colors"
                @click="cancelInstall(dep)"
              >
                {{ $t('settings.depCancel') }}
              </button>
            </template>
            <template v-else>
              <div class="text-right">
                <div v-if="dep.version" class="text-xs text-base-content/50 font-mono">
                  v{{ dep.version }}
                </div>
                <div v-if="dep.updateAvailable" class="text-xs text-amber-500 font-medium">
                  {{ $t('settings.depUpdateAvailable') }}
                </div>
                <div
                  v-else-if="dep.installed && dep.tool === 'yt-dlp'"
                  class="text-xs text-green-500"
                >
                  {{ $t('settings.depUpToDate') }}
                </div>
                <div v-else-if="!dep.installed" class="text-xs text-red-500">
                  {{ $t('settings.depMissing') }}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button
                  v-if="!dep.installed"
                  class="fx-noise px-3 py-1.5 fx-depth rounded-field bg-primary text-primary-content text-xs font-medium hover:bg-primary/90 transition-colors"
                  @click="runInstall(dep, false)"
                >
                  {{ $t('settings.depInstall') }}
                </button>
                <button
                  v-if="dep.installed && dep.tool === 'yt-dlp' && dep.updateAvailable"
                  class="fx-noise px-3 py-1.5 fx-depth rounded-field bg-primary text-primary-content text-xs font-medium hover:bg-primary/90 transition-colors"
                  @click="runInstall(dep, true)"
                >
                  {{ $t('settings.depUpdate') }}
                </button>
                <button
                  v-if="dep.installed"
                  class="fx-noise px-3 py-1.5 fx-depth rounded-field border border-red-500/40 text-red-500 text-xs font-medium hover:bg-red-500/10 transition-colors"
                  @click="uninstallDependency(dep)"
                >
                  {{ $t('settings.depUninstall') }}
                </button>
              </div>
            </template>
          </div>
        </div>
        <div v-if="dep.path" class="mt-2 text-[11px] text-base-content/50 font-mono truncate">
          {{ dep.path }}
        </div>
        <div v-if="dep.installing" class="mt-3">
          <div class="h-1.5 rounded-full bg-base-content/10 overflow-hidden">
            <div
              class="h-full bg-primary transition-[width] duration-200"
              :style="{ width: dep.percent + '%' }"
            />
          </div>
        </div>
        <div v-if="dep.error" class="mt-2 text-xs text-red-500 break-words">{{ dep.error }}</div>
      </SettingsCard>
    </div>
  </SettingsPanel>
</template>
