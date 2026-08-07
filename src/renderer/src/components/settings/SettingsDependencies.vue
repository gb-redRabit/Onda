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
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-elevated border border-border-default text-xs font-medium hover:bg-bg-hover transition-colors"
        @click="refreshAll"
      >
        <RefreshCw :size="14" />{{ $t('settings.depRefresh') }}
      </button>
    </template>
    <div class="space-y-6">
      <SettingsCard
        v-for="dep in deps"
        :key="dep.name"
      >
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
                  class="text-[10px] px-1.5 py-0.5 rounded bg-accent-base/15 text-accent-base font-medium"
                >
                  {{ $t('settings.depManaged') }}
                </span>
                <span
                  v-else-if="dep.installed"
                  class="text-[10px] px-1.5 py-0.5 rounded bg-bg-hover text-fg-faint font-medium"
                >
                  {{ $t('settings.depSystem') }}
                </span>
              </div>
              <div class="text-xs text-fg-faint truncate">{{ dep.description }}</div>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <template v-if="dep.installing">
              <span class="text-xs text-fg-faint font-mono">{{ dep.percent }}%</span>
              <button
                class="px-3 py-1.5 rounded-lg border border-border-default text-xs font-medium hover:bg-bg-hover transition-colors"
                @click="cancelInstall(dep)"
              >
                {{ $t('settings.depCancel') }}
              </button>
            </template>
            <template v-else>
              <div class="text-right">
                <div v-if="dep.version" class="text-xs text-fg-faint font-mono">
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
                  class="px-3 py-1.5 rounded-lg bg-accent-base text-white text-xs font-medium hover:bg-accent-hover transition-colors"
                  @click="runInstall(dep, false)"
                >
                  {{ $t('settings.depInstall') }}
                </button>
                <button
                  v-if="dep.installed && dep.tool === 'yt-dlp' && dep.updateAvailable"
                  class="px-3 py-1.5 rounded-lg bg-accent-base text-white text-xs font-medium hover:bg-accent-hover transition-colors"
                  @click="runInstall(dep, true)"
                >
                  {{ $t('settings.depUpdate') }}
                </button>
                <button
                  v-if="dep.installed"
                  class="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-500 text-xs font-medium hover:bg-red-500/10 transition-colors"
                  @click="uninstallDependency(dep)"
                >
                  {{ $t('settings.depUninstall') }}
                </button>
              </div>
            </template>
          </div>
        </div>
        <div v-if="dep.path" class="mt-2 text-[11px] text-fg-faint font-mono truncate">
          {{ dep.path }}
        </div>
        <div v-if="dep.installing" class="mt-3">
          <div class="h-1.5 rounded-full bg-bg-hover overflow-hidden">
            <div
              class="h-full bg-accent-base transition-[width] duration-200"
              :style="{ width: dep.percent + '%' }"
            />
          </div>
        </div>
        <div v-if="dep.error" class="mt-2 text-xs text-red-500 break-words">{{ dep.error }}</div>
      </SettingsCard>
    </div>
  </SettingsPanel>
</template>