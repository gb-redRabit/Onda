<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AppInfo, DepSource, DepToolPaths } from '@shared/types/ipc';
import { logger } from '@shared/logger';
import { Download, RefreshCw, Trash2 } from '@lucide/vue';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';

const { t } = useI18n();
const info = ref<AppInfo | null>(null);
const logs = ref('');
const resolver = ref<DepToolPaths>([]);
const busy = ref(false);

onMounted(() => loadAll());

async function loadAll(): Promise<void> {
  try {
    const [i, l, r] = await Promise.all([
      window.api?.getAppInfo(),
      window.api?.readLogs(),
      window.api?.getDependencyPaths()
    ]);
    if (i) info.value = i;
    if (l !== undefined) logs.value = l;
    if (r) resolver.value = r;
  } catch (e) {
    logger.warn('diagnostics', 'load failed', e);
  }
}

function sourceLabel(source: DepSource | null): string {
  if (source === 'bundled') return t('settings.depBundled');
  if (source === 'managed') return t('settings.depManaged');
  if (source === 'system') return t('settings.depSystem');
  return t('settings.depMissing');
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
          <div class="p-3 rounded-box bg-base-200/[var(--glass-alpha)] border border-base-300">
            <div class="text-[11px] text-base-content/50 mb-0.5">{{ $t('settings.version') }}</div>
            <div class="text-sm font-mono">{{ info.appVersion }}</div>
          </div>
          <div class="p-3 rounded-box bg-base-200/[var(--glass-alpha)] border border-base-300">
            <div class="text-[11px] text-base-content/50 mb-0.5">Electron</div>
            <div class="text-sm font-mono">{{ info.electron }}</div>
          </div>
          <div class="p-3 rounded-box bg-base-200/[var(--glass-alpha)] border border-base-300">
            <div class="text-[11px] text-base-content/50 mb-0.5">Chrome</div>
            <div class="text-sm font-mono">{{ info.chrome }}</div>
          </div>
          <div class="p-3 rounded-box bg-base-200/[var(--glass-alpha)] border border-base-300">
            <div class="text-[11px] text-base-content/50 mb-0.5">Node.js</div>
            <div class="text-sm font-mono">{{ info.node }}</div>
          </div>
          <div class="p-3 rounded-box bg-base-200/[var(--glass-alpha)] border border-base-300">
            <div class="text-[11px] text-base-content/50 mb-0.5">V8</div>
            <div class="text-sm font-mono">{{ info.v8 }}</div>
          </div>
          <div class="p-3 rounded-box bg-base-200/[var(--glass-alpha)] border border-base-300">
            <div class="text-[11px] text-base-content/50 mb-0.5">{{ $t('settings.os') }}</div>
            <div class="text-sm font-mono truncate" :title="info.os">{{ info.os }}</div>
          </div>
          <div class="p-3 rounded-box bg-base-200/[var(--glass-alpha)] border border-base-300">
            <div class="text-[11px] text-base-content/50 mb-0.5">{{ $t('settings.platform') }}</div>
            <div class="text-sm font-mono">{{ info.platform }} / {{ info.arch }}</div>
          </div>
          <div class="p-3 rounded-box bg-base-200/[var(--glass-alpha)] border border-base-300">
            <div class="text-[11px] text-base-content/50 mb-0.5">{{ $t('settings.uptime') }}</div>
            <div class="text-sm font-mono">{{ info.uptime }}s</div>
          </div>
        </template>
        <div
          class="col-span-2 p-3 rounded-box bg-base-200/[var(--glass-alpha)] border border-base-300"
        >
          <div class="text-[11px] text-base-content/50 mb-0.5">
            {{ $t('settings.userDataPath') }}
          </div>
          <div class="text-xs font-mono break-all">{{ info?.userDataPath }}</div>
        </div>
        <div
          class="col-span-2 p-3 rounded-box bg-base-200/[var(--glass-alpha)] border border-base-300"
        >
          <div class="text-[11px] text-base-content/50 mb-0.5">{{ $t('settings.logPath') }}</div>
          <div class="text-xs font-mono break-all">{{ info?.logPath }}</div>
        </div>
      </div>
    </SettingsCard>

    <SettingsCard>
      <div class="flex items-baseline justify-between gap-3 mb-3">
        <div class="text-sm font-medium">{{ $t('settings.resolverTitle') }}</div>
        <div class="text-[11px] text-base-content/50">{{ $t('settings.resolverDesc') }}</div>
      </div>
      <div v-if="resolver.length" class="space-y-2">
        <div
          v-for="row in resolver"
          :key="row.tool"
          class="flex items-start justify-between gap-3 text-xs"
        >
          <div class="flex items-center gap-2 min-w-0 pt-0.5">
            <span
              class="w-1.5 h-1.5 rounded-full shrink-0"
              :class="row.broken ? 'bg-amber-500' : row.path ? 'bg-success' : 'bg-error'"
            />
            <span class="font-medium">{{ row.tool }}</span>
            <span
              class="text-[10px] px-1.5 py-0.5 rounded-field bg-base-content/10 text-base-content/50 font-medium"
            >
              {{ sourceLabel(row.source) }}
            </span>
          </div>
          <div class="text-right min-w-0">
            <div
              v-if="row.broken"
              class="text-amber-500 font-medium truncate"
              :title="row.error ?? ''"
            >
              {{ $t('settings.depBroken')
              }}<span v-if="row.error" class="text-base-content/50 font-normal">
                — {{ row.error }}</span
              >
            </div>
            <div v-else-if="row.version" class="font-mono text-base-content/50">
              v{{ row.version }}
            </div>
            <div v-else class="text-base-content/40">{{ $t('settings.depMissing') }}</div>
            <div
              v-if="row.path"
              class="text-[10px] font-mono text-base-content/40 truncate max-w-[320px]"
              :title="row.path"
            >
              {{ row.path }}
            </div>
          </div>
        </div>
      </div>
      <div v-else class="text-xs text-base-content/50">{{ $t('settings.resolverEmpty') }}</div>
    </SettingsCard>

    <div class="flex items-center gap-2">
      <button
        class="fx-noise flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-medium hover:bg-base-content/10 transition-colors"
        :disabled="busy"
        @click="refresh"
      >
        <RefreshCw :size="14" />{{ $t('settings.depRefresh') }}
      </button>
      <button
        class="fx-noise flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-medium hover:bg-base-content/10 transition-colors"
        @click="onDownload"
      >
        <Download :size="14" />{{ $t('settings.downloadLog') }}
      </button>
      <button
        class="fx-noise flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field border border-red-500/40 text-error text-xs font-medium hover:bg-error/10 transition-colors"
        @click="onClear"
      >
        <Trash2 :size="14" />{{ $t('settings.clearLog') }}
      </button>
    </div>

    <SettingsCard :padded="false">
      <pre
        class="h-64 overflow-auto p-4 text-[11px] leading-relaxed font-mono text-base-content/70 whitespace-pre-wrap break-words"
        >{{ logs || $t('settings.logEmpty') }}</pre>
    </SettingsCard>
  </SettingsPanel>
</template>
