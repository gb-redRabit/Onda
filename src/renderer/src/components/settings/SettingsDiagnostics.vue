<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  AppCacheClearResult,
  AppInfo,
  DepSource,
  DepToolPaths,
  IpcPerfSnapshot,
  IpcWarningEntry
} from '@shared/types/ipc';
import { logger } from '@shared/logger';
import { formatBytes } from '@shared/formatBytes';
import { getRendererBootMetrics } from '@renderer/utils/bootMetrics';
import { useUIStore } from '@renderer/stores/ui';
import { usePromptDialog } from '@renderer/composables/usePromptDialog';
import { Download, RefreshCw, RotateCcw, Trash2 } from '@lucide/vue';
import ExplorerPromptDialog from '@renderer/components/explorer/ExplorerPromptDialog.vue';
import SettingsGroup from '@renderer/components/settings/SettingsGroup.vue';

const { t } = useI18n();
const ui = useUIStore();
const {
  promptVisible,
  promptIsConfirm,
  promptMessage,
  promptValue,
  showConfirm,
  promptConfirm,
  promptCancel
} = usePromptDialog();
const info = ref<AppInfo | null>(null);
const logs = ref('');
const resolver = ref<DepToolPaths>([]);
const warnings = ref<IpcWarningEntry[]>([]);
const busy = ref(false);
const cacheBusy = ref(false);
const lastClear = ref<AppCacheClearResult | null>(null);
const resetBusy = ref(false);
const resetting = ref(false);
const perf = ref<IpcPerfSnapshot | null>(null);
// Przechwycone raz: renderer oznacza gotowość przy montowaniu App, zanim otworzy się ten widok.
const rendererBoot = getRendererBootMetrics();

function bootBarWidth(ms: number): string {
  const max = Math.max(1, ...(perf.value?.phases.map((p) => p.ms) ?? [1]));
  return `${Math.max(2, Math.round((ms / max) * 100))}%`;
}

onMounted(() => loadAll());

async function loadAll(): Promise<void> {
  try {
    const [i, l, r, w, p] = await Promise.all([
      window.api?.getAppInfo(),
      window.api?.readLogs(),
      window.api?.getDependencyPaths(),
      window.api?.getRecentWarnings(),
      window.api?.getPerfSnapshot()
    ]);
    if (i) info.value = i;
    if (l !== undefined) logs.value = l;
    if (r) resolver.value = r;
    if (w) warnings.value = w;
    if (p) perf.value = p;
  } catch (e) {
    logger.warn('diagnostics', 'load failed', e);
  }
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString();
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

function cacheDetail(result: AppCacheClearResult): string {
  return t('settings.cacheClearedDetail', {
    files: result.filesRemoved,
    size: formatBytes(result.bytesFreed)
  });
}

async function onClearCache(): Promise<void> {
  if (cacheBusy.value) return;
  cacheBusy.value = true;
  try {
    const res = await window.api?.clearCache();
    if (res?.success) {
      lastClear.value = res;
      ui.notify('success', t('settings.cacheCleared'), cacheDetail(res));
    } else {
      ui.notify('error', t('settings.cacheClearError'), res?.error);
    }
  } catch (e) {
    logger.warn('diagnostics', 'clear cache failed', e);
    ui.notify('error', t('settings.cacheClearError'), String(e));
  } finally {
    cacheBusy.value = false;
  }
}

async function onFactoryReset(): Promise<void> {
  const ok = await showConfirm(t('settings.resetFactoryConfirm'));
  if (!ok) return;
  resetBusy.value = true;
  try {
    const res = await window.api?.factoryReset();
    if (res?.success) {
      // Main za chwilę zrestartuje aplikację — utrzymaj kartę w stanie
      // "restarting", zamiast udawać, że operacja jest zakończona.
      resetting.value = true;
      ui.notify('success', t('settings.resetFactoryRestarting'));
    } else {
      resetBusy.value = false;
      ui.notify('error', t('settings.resetFactoryError'), res?.error);
    }
  } catch (e) {
    resetBusy.value = false;
    logger.warn('diagnostics', 'factory reset failed', e);
    ui.notify('error', t('settings.resetFactoryError'), String(e));
  }
}
</script>

<template>
  <SettingsGroup>
    <div class="mb-3 text-sm font-medium">{{ $t('settings.runtimeDetails') }}</div>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <template v-if="info">
        <div class="p-3 rounded-box bg-base-200/(--glass-alpha) border border-base-300">
          <div class="text-[11px] text-base-content/50 mb-0.5">Electron</div>
          <div class="text-sm font-mono">{{ info.electron }}</div>
        </div>
        <div class="p-3 rounded-box bg-base-200/(--glass-alpha) border border-base-300">
          <div class="text-[11px] text-base-content/50 mb-0.5">Chrome</div>
          <div class="text-sm font-mono">{{ info.chrome }}</div>
        </div>
        <div class="p-3 rounded-box bg-base-200/(--glass-alpha) border border-base-300">
          <div class="text-[11px] text-base-content/50 mb-0.5">Node.js</div>
          <div class="text-sm font-mono">{{ info.node }}</div>
        </div>
        <div class="p-3 rounded-box bg-base-200/(--glass-alpha) border border-base-300">
          <div class="text-[11px] text-base-content/50 mb-0.5">V8</div>
          <div class="text-sm font-mono">{{ info.v8 }}</div>
        </div>
        <div class="p-3 rounded-box bg-base-200/(--glass-alpha) border border-base-300">
          <div class="text-[11px] text-base-content/50 mb-0.5">{{ $t('settings.os') }}</div>
          <div class="text-sm font-mono truncate" :title="info.os">{{ info.os }}</div>
        </div>
        <div class="p-3 rounded-box bg-base-200/(--glass-alpha) border border-base-300">
          <div class="text-[11px] text-base-content/50 mb-0.5">{{ $t('settings.platform') }}</div>
          <div class="text-sm font-mono">{{ info.platform }} / {{ info.arch }}</div>
        </div>
        <div class="p-3 rounded-box bg-base-200/(--glass-alpha) border border-base-300">
          <div class="text-[11px] text-base-content/50 mb-0.5">{{ $t('settings.uptime') }}</div>
          <div class="text-sm font-mono">{{ info.uptime }}s</div>
        </div>
      </template>
      <div class="col-span-2 p-3 rounded-box bg-base-200/(--glass-alpha) border border-base-300">
        <div class="text-[11px] text-base-content/50 mb-0.5">
          {{ $t('settings.userDataPath') }}
        </div>
        <div class="text-xs font-mono break-all">{{ info?.userDataPath }}</div>
      </div>
      <div class="col-span-2 p-3 rounded-box bg-base-200/(--glass-alpha) border border-base-300">
        <div class="text-[11px] text-base-content/50 mb-0.5">{{ $t('settings.logPath') }}</div>
        <div class="text-xs font-mono break-all">{{ info?.logPath }}</div>
      </div>
    </div>
  </SettingsGroup>

  <SettingsGroup>
    <div class="flex items-baseline justify-between gap-3 mb-3">
      <div class="text-sm font-medium">{{ $t('settings.perfTitle') }}</div>
      <div class="text-[11px] text-base-content/50">{{ $t('settings.perfDesc') }}</div>
    </div>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div class="p-3 rounded-box bg-base-200/(--glass-alpha) border border-base-300">
        <div class="text-[11px] text-base-content/50 mb-0.5">
          {{ $t('settings.perfRendererDom') }}
        </div>
        <div class="text-sm font-mono">
          {{
            rendererBoot.domContentLoadedMs !== null ? `${rendererBoot.domContentLoadedMs} ms` : '—'
          }}
        </div>
      </div>
      <div class="p-3 rounded-box bg-base-200/(--glass-alpha) border border-base-300">
        <div class="text-[11px] text-base-content/50 mb-0.5">
          {{ $t('settings.perfRendererReady') }}
        </div>
        <div class="text-sm font-mono">
          {{ rendererBoot.rendererReadyMs !== null ? `${rendererBoot.rendererReadyMs} ms` : '—' }}
        </div>
      </div>
      <div class="p-3 rounded-box bg-base-200/(--glass-alpha) border border-base-300">
        <div class="text-[11px] text-base-content/50 mb-0.5">
          {{ $t('settings.perfMainRss') }}
        </div>
        <div class="text-sm font-mono">{{ perf ? `${perf.mainRssMb} MB` : '—' }}</div>
      </div>
      <div class="p-3 rounded-box bg-base-200/(--glass-alpha) border border-base-300">
        <div class="text-[11px] text-base-content/50 mb-0.5">
          {{ $t('settings.perfProcesses') }}
        </div>
        <div class="text-sm font-mono">{{ perf?.processes.length ?? 0 }}</div>
      </div>
    </div>
    <div v-if="perf && perf.phases.length" class="mt-3 space-y-1">
      <div class="text-[11px] text-base-content/50 mb-1.5">
        {{ $t('settings.perfBootTimeline') }}
      </div>
      <div v-for="phase in perf.phases" :key="phase.label" class="flex items-center gap-2 text-xs">
        <span class="font-mono text-base-content/60 w-16 text-right shrink-0 tabular-nums">
          {{ phase.ms }} ms
        </span>
        <span class="flex-1 h-1.5 rounded-full bg-base-content/10 overflow-hidden">
          <span class="block h-full bg-primary" :style="{ width: bootBarWidth(phase.ms) }" />
        </span>
        <span class="text-base-content/70 w-40 truncate shrink-0" :title="phase.label">
          {{ phase.label }}
        </span>
      </div>
    </div>
    <div v-else class="text-xs text-base-content/50">{{ $t('settings.perfEmpty') }}</div>
  </SettingsGroup>

  <SettingsGroup>
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
            :class="row.broken ? 'bg-warning' : row.path ? 'bg-success' : 'bg-error'"
          />
          <span class="font-medium">{{ row.tool }}</span>
          <span
            class="text-[10px] px-1.5 py-0.5 rounded-field bg-base-content/10 text-base-content/50 font-medium"
          >
            {{ sourceLabel(row.source) }}
          </span>
        </div>
        <div class="text-right min-w-0">
          <div v-if="row.broken" class="text-warning font-medium truncate" :title="row.error ?? ''">
            {{ $t('settings.depBroken')
            }}<span v-if="row.error" class="text-base-content/50 font-normal">
              — {{ row.error }}</span
            >
          </div>
          <div v-else-if="row.version" class="font-mono text-base-content/50">
            v{{ row.version }}
          </div>
          <div v-else class="text-base-content/60">{{ $t('settings.depMissing') }}</div>
          <div
            v-if="row.path"
            class="text-[10px] font-mono text-base-content/60 truncate max-w-[320px]"
            :title="row.path"
          >
            {{ row.path }}
          </div>
        </div>
      </div>
    </div>
    <div v-else class="text-xs text-base-content/50">{{ $t('settings.resolverEmpty') }}</div>
  </SettingsGroup>

  <SettingsGroup>
    <div class="flex items-baseline justify-between gap-3 mb-3">
      <div class="text-sm font-medium">{{ $t('settings.warningsTitle') }}</div>
      <div class="text-[11px] text-base-content/50">{{ $t('settings.warningsDesc') }}</div>
    </div>
    <div v-if="warnings.length" class="space-y-1">
      <div v-for="(w, i) in warnings" :key="i" class="flex items-start gap-2 text-xs">
        <span class="font-mono text-[10px] text-base-content/60 shrink-0 pt-0.5">
          {{ formatTime(w.at) }}
        </span>
        <span class="text-base-content/70 wrap-break-word min-w-0">{{ w.text }}</span>
        <span
          v-if="w.count > 1"
          class="text-[10px] px-1.5 py-0.5 rounded-field bg-warning/15 text-warning font-medium shrink-0"
        >
          ×{{ w.count }}
        </span>
      </div>
    </div>
    <div v-else class="text-xs text-base-content/50">{{ $t('settings.warningsEmpty') }}</div>
  </SettingsGroup>

  <SettingsGroup>
    <div class="flex items-baseline justify-between gap-3 mb-3">
      <div class="text-sm font-medium">{{ $t('settings.cacheTitle') }}</div>
      <div class="text-[11px] text-base-content/50 text-right">
        {{ $t('settings.cacheDesc') }}
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <button
        class="fx-noise flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field border border-error/40 text-error text-xs font-medium hover:bg-error/10 transition-colors disabled:opacity-50"
        :disabled="cacheBusy"
        @click="onClearCache"
      >
        <Trash2 :size="14" />{{ $t('settings.cacheClear') }}
      </button>
      <span v-if="lastClear" class="text-[11px] text-base-content/50">
        {{ cacheDetail(lastClear) }}
      </span>
    </div>
  </SettingsGroup>

  <SettingsGroup>
    <div class="flex items-baseline justify-between gap-3 mb-3">
      <div class="text-sm font-medium text-error">{{ $t('settings.resetFactoryTitle') }}</div>
      <div class="text-[11px] text-base-content/50 text-right">
        {{ $t('settings.resetFactoryDesc') }}
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <button
        class="fx-noise flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field bg-error text-error-content text-xs font-medium hover:bg-error/90 transition-colors disabled:opacity-50"
        :disabled="resetBusy || resetting"
        @click="onFactoryReset"
      >
        <RotateCcw :size="14" />{{ $t('settings.resetFactoryButton') }}
      </button>
      <span v-if="resetting" class="text-[11px] text-error font-medium">
        {{ $t('settings.resetFactoryRestarting') }}
      </span>
    </div>
  </SettingsGroup>

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
      class="fx-noise flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field border border-error/40 text-error text-xs font-medium hover:bg-error/10 transition-colors"
      @click="onClear"
    >
      <Trash2 :size="14" />{{ $t('settings.clearLog') }}
    </button>
  </div>

  <SettingsGroup :padded="false">
    <pre
      class="h-64 overflow-auto p-4 text-[11px] leading-relaxed font-mono text-base-content/70 whitespace-pre-wrap wrap-break-word"
      >{{ logs || $t('settings.logEmpty') }}</pre>
  </SettingsGroup>

  <ExplorerPromptDialog
    :visible="promptVisible"
    :is-confirm="promptIsConfirm"
    :message="promptMessage"
    :value="promptValue"
    @update:value="promptValue = $event"
    @confirm="promptConfirm"
    @cancel="promptCancel"
  />
</template>
