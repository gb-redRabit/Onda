import { ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@renderer/stores/settings';
import { logger } from '@shared/logger';
import {
  DEP_LIST,
  EMPTY_DEP_STATUS,
  toolApi,
  safeCheck,
  isStatus,
  recheckDependencies
} from '@renderer/utils/dependencies';
import { depEvents } from '@renderer/utils/depEvents';
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
        source: null,
        broken: false,
        probeError: null,
        updateAvailable: false,
        installing: false,
        percent: 0,
        error: null as string | null
      };
    })
  );

  let progressCleanup: (() => void) | null = null;
  let depEventCleanup: (() => void) | null = null;
  const refreshing = ref(false);

  onMounted(() => {
    progressCleanup = window.api?.on('dep:progress', (payload) => {
      const p = payload as { tool: string; percent: number };
      const dep = deps.value.find((d) => d.tool === p.tool);
      if (dep) dep.percent = p.percent;
    });
    // Every instance keeps its own copy of the status (settings page, first-run
    // wizard), so an install/uninstall made in one place has to refresh the
    // others — otherwise the second view kept showing "installed" until restart.
    depEventCleanup = depEvents.on('changed', () => void refreshAll());
    refreshAll();
  });

  onUnmounted(() => {
    progressCleanup?.();
    depEventCleanup?.();
  });

  function applyStatus(dep: DepRow, s: DepStatus, now: number): void {
    dep.installed = s.installed;
    dep.version = s.version;
    dep.path = s.path;
    dep.managed = s.managed;
    dep.source = s.source;
    dep.broken = s.broken;
    dep.probeError = s.error;
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
    refreshing.value = true;
    for (const dep of deps.value) {
      dep.installing = false;
      dep.percent = 0;
      dep.error = null;
    }
    // Manual "refresh status" (and every mount) must reflect the real system, not
    // the cached probe verdict.
    await recheckDependencies();
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
    } finally {
      refreshing.value = false;
    }
  }

  async function runInstall(dep: DepRow, update: boolean): Promise<void> {
    dep.installing = true;
    dep.error = null;
    dep.percent = 0;
    const api = toolApi(dep);
    let result: { success?: boolean; error?: string; cancelled?: boolean } | undefined;
    try {
      result = update ? await window.api?.updateYtdlp() : await api.install?.();
    } catch (e) {
      logger.warn('deps', `install ${dep.name} failed`, e);
      result = { success: false, error: t('settings.depInstallFailed') };
    }
    const now = Date.now();
    if (result?.success) {
      const status = await safeCheck(
        () => api.check?.() ?? Promise.resolve({ ...EMPTY_DEP_STATUS }),
        {
          ...EMPTY_DEP_STATUS
        }
      );
      if (isStatus(status)) applyStatus(dep, status, now);
      if (dep.tool === 'ffmpeg' || dep.tool === 'ffprobe') {
        const probe = await safeCheck(() => window.api?.checkFfprobe(), { ...EMPTY_DEP_STATUS });
        if (isStatus(probe)) applyStatus(deps.value[1], probe, now);
      }
      await checkYtdlpUpdate();
      // Let other views holding their own status copy (the missing-dependencies
      // banner, the wizard) refresh right away instead of waiting for the next
      // window focus.
      depEvents.emit('changed');
    } else if (result?.cancelled) {
      // Elevation prompt dismissed — nothing changed, so no error either.
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
    let result: { success?: boolean; error?: string; cancelled?: boolean } | undefined;
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
      depEvents.emit('changed');
    } else if (result?.cancelled) {
      // Elevation prompt dismissed — nothing changed, so no error either.
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
    refreshing,
    refreshAll,
    runInstall,
    uninstallDependency,
    cancelInstall
  };
}
