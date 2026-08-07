import { ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@renderer/stores/settings';
import { logger } from '@shared/logger';
import {
  DEP_LIST,
  EMPTY_DEP_STATUS,
  toolApi,
  safeCheck,
  isStatus
} from '@renderer/utils/dependencies';
import type { DepRow, DepStatus } from '@renderer/utils/dependencies';

export function useDependencies() {
  const settings = useSettingsStore();
  const { t } = useI18n();

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
        safeCheck(() => window.api?.checkFfmpeg(), { ...EMPTY_DEP_STATUS }),
        safeCheck(() => window.api?.checkFfprobe(), { ...EMPTY_DEP_STATUS }),
        safeCheck(() => window.api?.checkYtdlp(), { ...EMPTY_DEP_STATUS }),
        safeCheck(() => window.api?.checkMkvextract(), { ...EMPTY_DEP_STATUS })
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
      const status = await safeCheck(() => api.check?.() ?? Promise.resolve({ ...EMPTY_DEP_STATUS }), {
        ...EMPTY_DEP_STATUS
      });
      if (isStatus(status)) applyStatus(dep, status, now);
      if (dep.tool === 'ffmpeg' || dep.tool === 'ffprobe') {
        const probe = await safeCheck(() => window.api?.checkFfprobe(), { ...EMPTY_DEP_STATUS });
        if (isStatus(probe)) applyStatus(deps.value[1], probe, now);
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
      applyStatus(dep, { ...EMPTY_DEP_STATUS }, now);
      if (dep.tool === 'ffmpeg' || dep.tool === 'ffprobe') {
        const probe = await safeCheck(() => window.api?.checkFfprobe(), { ...EMPTY_DEP_STATUS });
        if (isStatus(probe)) applyStatus(deps.value[1], probe, now);
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

  return {
    deps,
    refreshAll,
    runInstall,
    uninstallDependency,
    cancelInstall
  };
}
