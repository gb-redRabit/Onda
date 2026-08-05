<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';
import { useI18n } from 'vue-i18n';
import { logger } from '@shared/logger';
import { RefreshCw } from '@lucide/vue';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';

interface DepStatus {
  installed: boolean;
  version: string | null;
  path: string | null;
  managed: boolean;
}

interface DepRow {
  name: string;
  tool: 'ffmpeg' | 'ffprobe' | 'yt-dlp' | 'mkvextract';
  descriptionKey: string;
  description: string;
  installed: boolean;
  version: string | null;
  path: string | null;
  managed: boolean;
  updateAvailable: boolean;
  installing: boolean;
  percent: number;
  error: string | null;
}

const settings = useSettingsStore();
const { t } = useI18n();

const DEP_LIST = [
  { name: 'FFmpeg', tool: 'ffmpeg', descriptionKey: 'settings.ffmpegDesc' },
  { name: 'FFprobe', tool: 'ffprobe', descriptionKey: 'settings.ffprobeDesc' },
  { name: 'yt-dlp', tool: 'yt-dlp', descriptionKey: 'settings.ytdlpDesc' },
  { name: 'MKVToolbox', tool: 'mkvextract', descriptionKey: 'settings.mkvDesc' }
] as const;

const EMPTY: DepStatus = { installed: false, version: null, path: null, managed: false };

const deps = ref<DepRow[]>(
  DEP_LIST.map((d) => {
    const st = settings.getDependency(d.name);
    return {
      ...d,
      description: t(d.descriptionKey),
      installed: st?.installed ?? false,
      version: st?.version ?? null,
      path: st?.path ?? null,
      managed: st?.managed ?? false,
      updateAvailable: false,
      installing: false,
      percent: 0,
      error: null as string | null
    };
  })
);

let progressCleanup: (() => void) | null = null;

onMounted(() => {
  progressCleanup = window.api?.on('dep:progress', (payload) => {
    const p = payload as { tool: string; percent: number };
    const dep = deps.value.find((d) => d.tool === p.tool);
    if (dep) dep.percent = p.percent;
  });
  refreshAll();
});

onUnmounted(() => progressCleanup?.());

function toolApi(dep: DepRow) {
  if (dep.tool === 'mkvextract') {
    return {
      install: window.api?.installMkvextract,
      check: window.api?.checkMkvextract,
      remove: window.api?.removeMkvextract
    };
  }
  if (dep.tool === 'yt-dlp') {
    return {
      install: window.api?.installYtdlp,
      check: window.api?.checkYtdlp,
      remove: window.api?.removeYtdlp
    };
  }
  // ffmpeg / ffprobe share the same binary group
  return {
    install: window.api?.installFfmpeg,
    check: dep.tool === 'ffprobe' ? window.api?.checkFfprobe : window.api?.checkFfmpeg,
    remove: window.api?.removeFfmpeg
  };
}

async function safeCheck<T>(fn: (() => Promise<T>) | undefined, fallback: T): Promise<T> {
  if (!fn) return fallback;
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

function applyStatus(dep: DepRow, s: DepStatus, now: number): void {
  dep.installed = s.installed;
  dep.version = s.version;
  dep.path = s.path;
  dep.managed = s.managed;
  settings.updateDependency(dep.name, {
    installed: s.installed,
    version: s.version,
    checkedAt: now,
    path: s.path,
    managed: s.managed
  });
}

async function checkYtdlpUpdate(): Promise<void> {
  const yt = deps.value.find((d) => d.tool === 'yt-dlp');
  if (!yt) return;
  try {
    const res = await window.api?.checkUpdateYtdlp();
    yt.updateAvailable = !!res?.updateAvailable;
    if (res?.latest && res.updateAvailable) {
      settings.updateDependency('yt-dlp', {
        installed: yt.installed,
        version: yt.version,
        checkedAt: Date.now(),
        path: yt.path,
        managed: yt.managed,
        latestVersion: res.latest,
        updateAvailable: true
      });
    }
  } catch (e) {
    logger.warn('deps', 'yt-dlp update check failed', e);
  }
}

async function refreshAll(): Promise<void> {
  for (const dep of deps.value) {
    dep.installing = false;
    dep.percent = 0;
    dep.error = null;
  }
  try {
    const [ffmpeg, ffprobe, ytdlp, mkv] = await Promise.all([
      safeCheck(() => window.api?.checkFfmpeg(), { ...EMPTY }),
      safeCheck(() => window.api?.checkFfprobe(), { ...EMPTY }),
      safeCheck(() => window.api?.checkYtdlp(), { ...EMPTY }),
      safeCheck(() => window.api?.checkMkvextract(), { ...EMPTY })
    ]);
    const now = Date.now();
    [ffmpeg, ffprobe, ytdlp, mkv].forEach((res, i) => {
      applyStatus(deps.value[i], res, now);
    });
    await checkYtdlpUpdate();
  } catch (e) {
    logger.warn('deps', 'status check failed', e);
  }
}

async function runInstall(dep: DepRow, update: boolean): Promise<void> {
  dep.installing = true;
  dep.error = null;
  dep.percent = 0;
  const api = toolApi(dep);
  let result: { success?: boolean; error?: string } | undefined;
  try {
    result = update ? await window.api?.updateYtdlp() : await api.install?.();
  } catch (e) {
    logger.warn('deps', `install ${dep.name} failed`, e);
    result = { success: false, error: t('settings.depInstallFailed') };
  }
  const now = Date.now();
  if (result?.success) {
    const status = (await safeCheck(() => api.check(), { ...EMPTY })) as DepStatus;
    applyStatus(dep, status, now);
    if (dep.tool === 'ffmpeg' || dep.tool === 'ffprobe') {
      const probe = (await safeCheck(() => window.api?.checkFfprobe(), { ...EMPTY })) as DepStatus;
      applyStatus(deps.value[1], probe, now);
    }
    await checkYtdlpUpdate();
  } else {
    dep.error = result?.error ?? t('settings.depInstallFailed');
  }
  dep.installing = false;
  dep.percent = 0;
}

async function uninstallDependency(dep: DepRow): Promise<void> {
  const api = toolApi(dep);
  dep.installing = true;
  dep.error = null;
  let result: { success?: boolean; error?: string } | undefined;
  try {
    result = await api.remove?.();
  } catch (e) {
    logger.warn('deps', `uninstall ${dep.name} failed`, e);
    result = { success: false, error: t('settings.depInstallFailed') };
  }
  const now = Date.now();
  if (result?.success) {
    applyStatus(dep, { ...EMPTY }, now);
    if (dep.tool === 'ffmpeg' || dep.tool === 'ffprobe') {
      const probe = (await safeCheck(() => window.api?.checkFfprobe(), { ...EMPTY })) as DepStatus;
      applyStatus(deps.value[1], probe, now);
    }
    await checkYtdlpUpdate();
  } else {
    dep.error = result?.error ?? t('settings.depInstallFailed');
  }
  dep.installing = false;
}

async function cancelInstall(dep: DepRow): Promise<void> {
  await window.api?.cancelDepInstall(dep.tool);
  dep.installing = false;
  dep.percent = 0;
}
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