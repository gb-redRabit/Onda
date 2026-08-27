<script setup lang="ts">
import { Download, Music2, Film } from '@lucide/vue';
import { useSettingsStore } from '@renderer/stores/settings';

const settings = useSettingsStore();

const kinds = [
  { id: 'audio' as const, icon: Music2, labelKey: 'wizard.kindAudio' },
  { id: 'video' as const, icon: Film, labelKey: 'wizard.kindVideo' }
];

async function chooseFolder() {
  try {
    const paths = (await window.api?.invoke('dialog:openFolder')) as string[] | undefined;
    if (paths && paths.length > 0) {
      settings.updateDownload({ defaultPath: paths[0] });
    }
  } catch {
    /* cancelled */
  }
}
</script>

<template>
  <div>
    <h3 class="text-lg font-bold tracking-tight mb-1.5">{{ $t('wizard.downloadTitle') }}</h3>
    <p class="text-sm text-base-content/70">{{ $t('wizard.downloadDesc') }}</p>

    <div class="mt-5 space-y-5">
      <button
        class="w-full flex items-center gap-3 p-3.5 fx-depth rounded-box border border-base-300 hover:border-primary/50 transition-colors text-left"
        @click="chooseFolder"
      >
        <Download :size="18" class="text-primary shrink-0" />
        <div class="min-w-0">
          <div class="text-sm font-medium">{{ $t('wizard.chooseDownload') }}</div>
          <div class="text-xs text-base-content/50 truncate">
            {{ settings.download.defaultPath || $t('wizard.noneSelected') }}
          </div>
        </div>
      </button>

      <div>
        <div class="text-sm mb-2">{{ $t('wizard.defaultKind') }}</div>
        <div class="flex gap-2">
          <button
            v-for="k in kinds"
            :key="k.id"
            class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 fx-depth rounded-field text-sm font-medium border transition-colors"
            :class="
              settings.download.defaultKind === k.id
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-base-300 text-base-content/70 hover:bg-base-content/5'
            "
            @click="settings.updateDownload({ defaultKind: k.id })"
          >
            <component :is="k.icon" :size="15" />
            {{ $t(k.labelKey) }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
