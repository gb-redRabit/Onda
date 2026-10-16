<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Trash2 } from '@lucide/vue';
import { useUIStore } from '@renderer/stores/ui';
import SettingsGroup from '@renderer/components/settings/SettingsGroup.vue';
import SettingsRow from '@renderer/components/settings/SettingsRow.vue';

const ui = useUIStore();
const { t } = useI18n();

const stats = ref<{ files: number; bytes: number; videos: number } | null>(null);

const sizeLabel = computed(() => {
  const bytes = stats.value?.bytes ?? 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
});

async function loadStats(): Promise<void> {
  try {
    stats.value = (await window.api?.getFontCacheStats()) ?? null;
  } catch (e) {
    ui.notify('error', t('settings.fontCacheStatsError'), String(e));
  }
}

async function clearCache(): Promise<void> {
  try {
    const res = await window.api?.clearFontCache();
    ui.notify('success', t('settings.fontCacheCleared', { n: res?.removed ?? 0 }));
    await loadStats();
  } catch (e) {
    ui.notify('error', t('settings.fontCacheClearError'), String(e));
  }
}

onMounted(loadStats);
</script>

<template>
  <SettingsGroup :title="$t('settings.fontCache')" :description="$t('settings.fontCacheDesc')">
    <SettingsRow
      :label="$t('settings.fontCacheSaved')"
      :description="$t('settings.fontCacheSavedDesc')"
    >
      <span class="text-[13px] text-base-content/70">
        {{
          $t('settings.fontCacheStats', {
            files: stats?.files ?? 0,
            videos: stats?.videos ?? 0,
            size: sizeLabel
          })
        }}
      </span>
    </SettingsRow>
    <div class="pt-3">
      <button
        class="fx-noise flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field border border-base-300 text-xs font-medium text-base-content/70 hover:bg-base-content/10 transition-colors"
        @click="clearCache"
      >
        <Trash2 :size="14" />{{ $t('settings.fontCacheClear') }}
      </button>
    </div>
  </SettingsGroup>
</template>
