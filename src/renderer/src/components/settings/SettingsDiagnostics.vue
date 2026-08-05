<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { AppInfo } from '@shared/types/ipc';
import { logger } from '@shared/logger';
import { Download, RefreshCw, Trash2 } from '@lucide/vue';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';

const info = ref<AppInfo | null>(null);
const logs = ref('');
const busy = ref(false);

onMounted(() => loadAll());

async function loadAll(): Promise<void> {
  try {
    const [i, l] = await Promise.all([window.api?.getAppInfo(), window.api?.readLogs()]);
    if (i) info.value = i;
    if (l !== undefined) logs.value = l;
  } catch (e) {
    logger.warn('diagnostics', 'load failed', e);
  }
}

async function refresh(): Promise<void> {
  busy.value = true;
  await loadAll();
  busy.value = false;
}

async function onDownload(): Promise<void> {
  await window.api?.downloadLog();
}

async function onClear(): Promise<void> {
  const ok = await window.api?.clearLogs();
  if (ok) logs.value = '';
}
</script>

<template>
  <SettingsPanel
    :title="$t('settings.diagnosticsTitle')"
    :description="$t('settings.diagnosticsDesc')"
  >
    <SettingsCard>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <template v-if="info">
          <div class="p-3 rounded-xl bg-bg-base border border-border-default">
            <div class="text-[11px] text-fg-faint mb-0.5">{{ $t('settings.version') }}</div>
            <div class="text-sm font-mono">{{ info.appVersion }}</div>
          </div>
          <div class="p-3 rounded-xl bg-bg-base border border-border-default">
            <div class="text-[11px] text-fg-faint mb-0.5">Electron</div>
            <div class="text-sm font-mono">{{ info.electron }}</div>
          </div>
          <div class="p-3 rounded-xl bg-bg-base border border-border-default">
            <div class="text-[11px] text-fg-faint mb-0.5">Chrome</div>
            <div class="text-sm font-mono">{{ info.chrome }}</div>
          </div>
          <div class="p-3 rounded-xl bg-bg-base border border-border-default">
            <div class="text-[11px] text-fg-faint mb-0.5">Node.js</div>
            <div class="text-sm font-mono">{{ info.node }}</div>
          </div>
          <div class="p-3 rounded-xl bg-bg-base border border-border-default">
            <div class="text-[11px] text-fg-faint mb-0.5">V8</div>
            <div class="text-sm font-mono">{{ info.v8 }}</div>
          </div>
          <div class="p-3 rounded-xl bg-bg-base border border-border-default">
            <div class="text-[11px] text-fg-faint mb-0.5">{{ $t('settings.os') }}</div>
            <div class="text-sm font-mono truncate" :title="info.os">{{ info.os }}</div>
          </div>
          <div class="p-3 rounded-xl bg-bg-base border border-border-default">
            <div class="text-[11px] text-fg-faint mb-0.5">{{ $t('settings.platform') }}</div>
            <div class="text-sm font-mono">{{ info.platform }} / {{ info.arch }}</div>
          </div>
          <div class="p-3 rounded-xl bg-bg-base border border-border-default">
            <div class="text-[11px] text-fg-faint mb-0.5">{{ $t('settings.uptime') }}</div>
            <div class="text-sm font-mono">{{ info.uptime }}s</div>
          </div>
        </template>
        <div class="col-span-2 p-3 rounded-xl bg-bg-base border border-border-default">
          <div class="text-[11px] text-fg-faint mb-0.5">{{ $t('settings.userDataPath') }}</div>
          <div class="text-xs font-mono break-all">{{ info?.userDataPath }}</div>
        </div>
        <div class="col-span-2 p-3 rounded-xl bg-bg-base border border-border-default">
          <div class="text-[11px] text-fg-faint mb-0.5">{{ $t('settings.logPath') }}</div>
          <div class="text-xs font-mono break-all">{{ info?.logPath }}</div>
        </div>
      </div>
    </SettingsCard>

    <div class="flex items-center gap-2">
      <button
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-elevated border border-border-default text-xs font-medium hover:bg-bg-hover transition-colors"
        :disabled="busy"
        @click="refresh"
      >
        <RefreshCw :size="14" />{{ $t('settings.depRefresh') }}
      </button>
      <button
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-elevated border border-border-default text-xs font-medium hover:bg-bg-hover transition-colors"
        @click="onDownload"
      >
        <Download :size="14" />{{ $t('settings.downloadLog') }}
      </button>
      <button
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/40 text-red-500 text-xs font-medium hover:bg-red-500/10 transition-colors"
        @click="onClear"
      >
        <Trash2 :size="14" />{{ $t('settings.clearLog') }}
      </button>
    </div>

    <SettingsCard :padded="false">
      <pre
        class="h-64 overflow-auto p-4 text-[11px] leading-relaxed font-mono text-fg-muted whitespace-pre-wrap break-words"
        >{{ logs || $t('settings.logEmpty') }}</pre
      >
    </SettingsCard>
  </SettingsPanel>
</template>
