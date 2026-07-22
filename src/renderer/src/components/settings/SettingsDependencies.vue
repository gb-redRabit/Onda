<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';
import { useI18n } from 'vue-i18n';

const settings = useSettingsStore();
const { t } = useI18n();

const DEP_LIST = [
  { name: 'FFmpeg', descriptionKey: 'settings.ffmpegDesc' },
  { name: 'FFprobe', descriptionKey: 'settings.ffprobeDesc' },
  { name: 'yt-dlp', descriptionKey: 'settings.ytdlpDesc' },
  { name: 'MKVToolbox', descriptionKey: 'settings.mkvDesc' }
];

const deps = ref(
  DEP_LIST.map((d) => ({
    ...d,
    description: t(d.descriptionKey),
    installed: settings.getDependency(d.name)?.installed ?? false,
    version: settings.getDependency(d.name)?.version ?? null,
    installing: false,
    error: null as string | null
  }))
);

onMounted(() => {
  if (!DEP_LIST.every((d) => settings.getDependency(d.name)?.checkedAt)) {
    checkDependencies();
  }
});

async function checkDependencies(): Promise<void> {
  for (const dep of deps.value) {
    dep.installing = true;
    dep.error = null;
  }

  const [ffmpeg, ffprobe, ytdlp, mkv] = await Promise.all([
    window.api?.checkFfmpeg() ?? Promise.resolve({ installed: false, version: null }),
    window.api?.checkFfprobe() ?? Promise.resolve({ installed: false, version: null }),
    window.api?.checkYtdlp() ?? Promise.resolve({ installed: false, version: null, path: null }),
    window.api?.checkMkvextract() ?? Promise.resolve({ installed: false, version: null })
  ]);

  const results = [ffmpeg, ffprobe, ytdlp, mkv];
  const now = Date.now();
  deps.value.forEach((dep, i) => {
    dep.installed = results[i].installed;
    dep.version = results[i].version;
    dep.installing = false;
    settings.updateDependency(dep.name, {
      installed: results[i].installed,
      version: results[i].version,
      checkedAt: now
    });
  });
}

async function installDependency(dep: (typeof deps.value)[0]): Promise<void> {
  dep.installing = true;
  dep.error = null;

  let installFn, checkFn;
  if (dep.name === 'FFmpeg' || dep.name === 'FFprobe') {
    installFn = window.api?.installFfmpeg;
    checkFn = dep.name === 'FFmpeg' ? window.api?.checkFfmpeg : window.api?.checkFfprobe;
  } else if (dep.name === 'MKVToolbox') {
    installFn = window.api?.installMkvextract;
    checkFn = window.api?.checkMkvextract;
  } else {
    installFn = window.api?.installYtdlp;
    checkFn = window.api?.checkYtdlp;
  }

  const result = await installFn?.();
  const now = Date.now();
  if (result?.success) {
    const status = await checkFn?.();
    dep.installed = status?.installed ?? false;
    dep.version = status?.version ?? null;
    settings.updateDependency(dep.name, {
      installed: dep.installed,
      version: dep.version,
      checkedAt: now
    });

    if (dep.name === 'FFmpeg') {
      const probeStatus = (await window.api?.checkFfprobe()) ?? { installed: false, version: null };
      deps.value[1].installed = probeStatus.installed;
      deps.value[1].version = probeStatus.version;
      settings.updateDependency('FFprobe', {
        installed: probeStatus.installed,
        version: probeStatus.version,
        checkedAt: now
      });
    }
  } else {
    dep.error = result?.error ?? t('settings.depInstallFailed');
  }
  dep.installing = false;
}
</script>

<template>
  <div class="space-y-6 max-w-2xl">
    <h2 class="text-lg font-bold">{{ $t('settings.depTitle') }}</h2>
    <p class="text-xs text-fg-faint mb-4">
      {{ $t('settings.depDesc') }}
    </p>
    <button
      class="px-4 py-2 rounded-xl bg-bg-elevated border border-border-default text-sm font-medium hover:bg-bg-hover transition-colors mb-4"
      @click="checkDependencies"
    >
      {{ $t('settings.depRefresh') }}
    </button>
    <div class="space-y-3">
      <div
        v-for="dep in deps"
        :key="dep.name"
        class="p-4 rounded-xl bg-bg-elevated border border-border-default"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div
              class="w-2 h-2 rounded-full"
              :class="dep.installed ? 'bg-green-500' : 'bg-red-500'"
            />
            <div>
              <div class="text-sm font-medium">{{ dep.name }}</div>
              <div class="text-xs text-fg-faint">{{ dep.description }}</div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <span v-if="dep.version" class="text-xs text-fg-faint font-mono"
              >v{{ dep.version }}</span
            >
            <span v-else-if="dep.installed" class="text-xs text-green-500">{{ $t('settings.depInstalled') }}</span>
            <span v-else class="text-xs text-red-500">{{ $t('settings.depMissing') }}</span>
            <button
              v-if="!dep.installed"
              class="px-3 py-1.5 rounded-lg bg-accent-base text-white text-xs font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
              :disabled="dep.installing"
              @click="installDependency(dep)"
            >
              {{ dep.installing ? $t('settings.depInstalling') : $t('settings.depInstall') }}
            </button>
          </div>
        </div>
        <div v-if="dep.error" class="mt-2 text-xs text-red-500">{{ dep.error }}</div>
      </div>
    </div>
  </div>
</template>
