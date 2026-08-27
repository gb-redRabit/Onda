<script setup lang="ts">
import { RefreshCw } from '@lucide/vue';
import { useDependencies } from '@renderer/composables/useDependencies';

const { deps, refreshAll, runInstall, cancelInstall } = useDependencies();
</script>

<template>
  <div>
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <h3 class="text-lg font-bold tracking-tight mb-1.5">
          {{ $t('wizard.dependenciesTitle') }}
        </h3>
        <p class="text-sm text-base-content/70">{{ $t('wizard.dependenciesDesc') }}</p>
      </div>
      <button
        class="fx-noise shrink-0 flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field border border-base-300 text-xs font-medium hover:bg-base-content/10 transition-colors"
        @click="refreshAll"
      >
        <RefreshCw :size="14" />
        {{ $t('settings.depRefresh') }}
      </button>
    </div>

    <div class="mt-5 space-y-2.5">
      <div
        v-for="dep in deps"
        :key="dep.name"
        class="p-3.5 fx-depth rounded-box border border-base-300 bg-base-200/[var(--glass-alpha)]"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5 min-w-0">
            <span
              class="w-2 h-2 rounded-full shrink-0"
              :class="dep.installed ? 'bg-green-500' : 'bg-red-500'"
            />
            <div class="min-w-0">
              <div class="text-sm font-medium">{{ dep.name }}</div>
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
              <span v-if="dep.installed" class="text-xs font-medium text-green-500">
                {{ dep.version ? `v${dep.version}` : $t('settings.depInstalled') }}
              </span>
              <button
                v-else
                class="fx-noise px-3 py-1.5 fx-depth rounded-field bg-primary text-primary-content text-xs font-medium hover:bg-primary/90 transition-colors"
                @click="runInstall(dep, false)"
              >
                {{ $t('settings.depInstall') }}
              </button>
            </template>
          </div>
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
      </div>
    </div>

    <p class="mt-4 text-xs text-base-content/50 leading-relaxed">
      {{ $t('wizard.dependenciesHint') }}
    </p>
  </div>
</template>
