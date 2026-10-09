<script setup lang="ts">
import { useRouter } from 'vue-router';
import { ArrowDownToLine, ArrowRight, RotateCw, X } from '@lucide/vue';
import { useUpdater } from '@renderer/composables/useUpdater';

// Trwały baner o dostępnej/pobranej aktualizacji (jak baner brakujących zależności).
// Widoczny niezależnie od widoku, dopóki użytkownik go nie odrzuci.
const router = useRouter();
const { show, status, version, progress, download, install, dismiss } = useUpdater();

function openUpdates(): void {
  router.push({ path: '/settings', query: { tab: 'updates' } });
}
</script>

<template>
  <div
    v-if="show"
    data-testid="update-banner"
    class="flex items-start gap-3 shrink-0 px-4 py-2 border-b border-primary/30 bg-primary/10"
  >
    <ArrowDownToLine :size="16" class="mt-0.5 shrink-0 text-primary" />
    <div class="min-w-0 flex-1">
      <div class="text-xs font-medium">
        {{
          status === 'downloaded'
            ? $t('settings.updateToastReadyTitle')
            : $t('settings.updateToastAvailableTitle')
        }}
      </div>
      <div class="text-[11px] text-base-content/70">
        <template v-if="status === 'downloading'">
          {{ $t('settings.downloading') }} {{ Math.round(progress) }}%
        </template>
        <template v-else>
          {{ $t('settings.updateToastAvailableMessage', { version }) }}
        </template>
      </div>
      <div
        v-if="status === 'downloading'"
        class="mt-1 h-1.5 rounded-full bg-base-200/(--glass-alpha) overflow-hidden"
      >
        <div
          class="h-full bg-primary transition-[width] duration-200"
          :style="{ width: progress + '%' }"
        />
      </div>
    </div>
    <button
      v-if="status === 'available'"
      class="fx-noise shrink-0 flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field bg-primary text-primary-content text-xs font-medium hover:bg-primary/90 transition-colors"
      @click="download"
    >
      <ArrowDownToLine :size="14" />{{ $t('settings.downloadUpdate') }}
    </button>
    <button
      v-else-if="status === 'downloaded'"
      class="fx-noise shrink-0 flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field bg-primary text-primary-content text-xs font-medium hover:bg-primary/90 transition-colors"
      @click="install"
    >
      <RotateCw :size="14" />{{ $t('settings.restartInstall') }}
    </button>
    <button
      class="fx-noise shrink-0 flex items-center gap-1 px-3 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content/70 hover:bg-base-content/10 transition-colors"
      @click="openUpdates"
    >
      {{ $t('settings.updateManage') }}<ArrowRight :size="14" />
    </button>
    <button
      class="shrink-0 p-1 rounded-field text-base-content/50 hover:bg-base-content/10 hover:text-base-content transition-colors"
      :aria-label="$t('common.close')"
      @click="dismiss"
    >
      <X :size="14" />
    </button>
  </div>
</template>
